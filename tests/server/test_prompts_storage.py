"""Prompt persistence regressions; all files live in an isolated temporary root."""

import csv
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import uuid
import warnings

import storage


CONTENT = '  中文, "引號"\n\t縮排與特殊符號 😀 <script>alert("x")</script>\n```json\n{"value": "N/A", "other": "NULL"}\n```\n\\frac{α}{β} $x^2$\r\n  尾端空白  \n'


class PromptStorageTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve() / "tracker"
        paths = patch.multiple(
            storage, PROJECT_ROOT=self.root, DATA_DIR=self.root / "data",
            APPLICATIONS_DIR=self.root / "applications", BACKUPS_DIR=self.root / "backups",
            JOBS_FILE=self.root / "data/jobs.json", SETTINGS_FILE=self.root / "data/settings.json",
        )
        paths.start()
        self.addCleanup(paths.stop)
        self.path = storage.DATA_DIR / "prompts.csv"
        self.backup = storage.BACKUPS_DIR / "prompts.csv.bak"

    def test_empty_reads_and_missing_delete_do_not_write(self):
        for _ in range(3):
            self.assertEqual(storage.load_prompts(), [])
        self.assertFalse(storage.delete_prompt(str(uuid.uuid4())))
        self.assertFalse(self.root.exists())

    def test_literal_csv_round_trip_and_immutable_identity(self):
        with patch.object(storage, "_utc_now", return_value="2026-10-01T14:00:00+00:00"):
            original = storage.create_prompt('  用途, "中文"\n第二行  ', CONTENT)
        self.assertEqual(str(uuid.UUID(original["id"])), original["id"])
        self.assertEqual(original["created_at"], "2026-10-01T14:00:00+00:00")
        self.assertEqual(original["description"], '用途, "中文"\n第二行')
        self.assertEqual(original["content"], CONTENT)
        self.assertEqual(storage.load_prompts(), [original])
        with self.path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            self.assertEqual(reader.fieldnames, ["id", "created_at", "description", "content"])
            self.assertEqual(list(reader), [original])
        changed = storage.update_prompt(original["id"], " NULL ", "N/A")
        self.assertEqual(changed, {**original, "description": "NULL", "content": "N/A"})
        self.assertEqual(storage.load_prompts(), [changed])
        self.assertEqual(storage._read_prompts_csv(self.backup), [original])

    def test_restarts_from_another_working_directory_keep_data(self):
        original = storage.create_prompt("保存完整文字", CONTENT)
        other_cwd = self.root / "elsewhere"
        other_cwd.mkdir()
        script = """
import json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import storage
root = Path(sys.argv[2])
storage.PROJECT_ROOT = root
storage.DATA_DIR = root / 'data'
storage.APPLICATIONS_DIR = root / 'applications'
storage.BACKUPS_DIR = root / 'backups'
storage.JOBS_FILE = root / 'data/jobs.json'
storage.SETTINGS_FILE = root / 'data/settings.json'
print(json.dumps(storage.load_prompts()))
"""
        result = subprocess.run(
            [sys.executable, "-c", script, str(Path(storage.__file__).parent), str(self.root)],
            cwd=other_cwd, check=True, capture_output=True, text=True,
        )
        self.assertEqual(json.loads(result.stdout), [original])
        self.assertFalse((other_cwd / "data").exists())

    def test_invalid_inputs_and_missing_update_do_not_write(self):
        original = storage.create_prompt("Existing", CONTENT)
        before = self.path.read_bytes()
        for description, content in ((" \n", CONTENT), ("valid", "\n\t ")):
            with self.subTest(description=description):
                with self.assertRaises(ValueError):
                    storage.create_prompt(description, content)
                with self.assertRaises(ValueError):
                    storage.update_prompt(original["id"], description, content)
                self.assertEqual(self.path.read_bytes(), before)
        with self.assertRaises(KeyError):
            storage.update_prompt(str(uuid.uuid4()), "Missing", "text")
        self.assertEqual(self.path.read_bytes(), before)

    def test_delete_only_selected_uuid_and_leave_all_other_files_untouched(self):
        job = storage.create_job({"company": "Fixture", "job_title": "Role"})
        storage.create_company({"company_name": "Fixture"})
        (storage.get_job_directory(job["id"]) / "resume.tex").write_text("Resume fixture")
        before = {path: path.read_bytes() for path in self.root.rglob("*") if path.is_file()}
        first = storage.create_prompt("Same description", "first")
        second = storage.create_prompt("Same description", "second")
        self.assertTrue(storage.delete_prompt(first["id"]))
        self.assertEqual(storage.load_prompts(), [second])
        self.assertFalse(storage.delete_prompt(first["id"]))
        self.assertTrue(storage.delete_prompt(second["id"]))
        self.assertEqual(storage.load_prompts(), [])
        self.assertEqual(self.path.read_text(), "id,created_at,description,content\n")
        self.assertEqual({path: path.read_bytes() for path in before}, before)

    def test_corrupt_csv_blocks_load_and_all_mutations(self):
        self.path.parent.mkdir(parents=True)
        for broken in (
            b"", b"wrong,header\n", b'id,created_at,description,content\n"unclosed',
            b"id,created_at,description,content\nnot-uuid,bad-date,name,text\n",
            b"id,created_at,description,content\n\xff\n",
            f"id,created_at,description,content\n{uuid.uuid4()},2026-10-01T14:00:00+00:00,name\n".encode(),
        ):
            self.path.write_bytes(broken)
            for action in (
                storage.load_prompts, lambda: storage.save_prompts([]),
                lambda: storage.create_prompt("New", "text"),
                lambda: storage.update_prompt("missing", "Changed", "text"),
                lambda: storage.delete_prompt("missing"),
            ):
                with self.subTest(broken=broken, action=action), self.assertRaises(storage.CorruptStorageError):
                    action()
                self.assertEqual(self.path.read_bytes(), broken)

    def test_backup_recovery_is_visible_and_preserves_valid_backup(self):
        original = storage.create_prompt("Original", CONTENT)
        storage.update_prompt(original["id"], "Updated", "updated")
        backup_bytes = self.backup.read_bytes()
        self.path.write_text("corrupt", encoding="utf-8")
        with warnings.catch_warnings(record=True) as notices:
            warnings.simplefilter("always")
            self.assertEqual(storage.load_prompts(), [original])
            storage.update_prompt(original["id"], "Recovered", CONTENT)
        self.assertTrue(any(item.category is storage.StorageRecoveryWarning for item in notices))
        self.assertEqual(self.backup.read_bytes(), backup_bytes)
        self.path.unlink()
        with self.assertWarns(storage.StorageRecoveryWarning):
            self.assertEqual(storage.load_prompts(), [original])

    def test_read_and_atomic_write_failures_preserve_original(self):
        original = storage.create_prompt("Original", CONTENT)
        before = self.path.read_bytes()
        read_csv = storage._read_prompts_csv

        def unreadable(path):
            if path == self.path:
                raise PermissionError("Permission denied")
            return read_csv(path)

        with patch.object(storage, "_read_prompts_csv", side_effect=unreadable):
            with self.assertRaises(storage.CorruptStorageError):
                storage.create_prompt("New", "text")
        real_replace = storage.os.replace

        def failed_replace(source, destination):
            if destination == self.path:
                raise OSError("Disk failure")
            real_replace(source, destination)

        with patch.object(storage.os, "replace", side_effect=failed_replace):
            with self.assertRaises(OSError):
                storage.update_prompt(original["id"], "Updated", "text")
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(storage.load_prompts(), [original])
        self.assertFalse(self.path.with_suffix(".csv.tmp").exists())


if __name__ == "__main__":
    unittest.main()
