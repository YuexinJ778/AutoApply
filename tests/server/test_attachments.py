"""Isolated regression tests for email fields and job attachment storage."""

from __future__ import annotations

import json
import tempfile
import unittest
import uuid
import warnings
from pathlib import Path
from unittest.mock import patch

import storage


class AttachmentStorageTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "tracker"
        self.paths = patch.multiple(
            storage,
            PROJECT_ROOT=self.root,
            DATA_DIR=self.root / "data",
            APPLICATIONS_DIR=self.root / "applications",
            BACKUPS_DIR=self.root / "backups",
            JOBS_FILE=self.root / "data" / "jobs.json",
            SETTINGS_FILE=self.root / "data" / "settings.json",
        )
        self.paths.start()
        self.addCleanup(self.paths.stop)
        self.job_id = str(uuid.uuid4())

    def directory(self, job_id: str | None = None) -> Path:
        return self.root / "applications" / (job_id or self.job_id) / "attachments"

    def read_index(self) -> dict:
        return json.loads((self.directory() / "index.json").read_text(encoding="utf-8"))

    def test_email_defaults_and_updates_preserve_independent_job_fields(self) -> None:
        created = storage.create_job({
            "company": "Example",
            "job_title": "Analyst",
            "email": "  application@example.com \n",
            "account": "separate-login",
            "password": "plain text password",
            "custom_fields": {"referral": "A name", "onsite": True},
            "legacy_extra": "keep this",
        })
        self.assertEqual(created["email"], "application@example.com")
        updated = storage.update_job(created["id"], {"email": " next@example.com "})
        self.assertEqual(storage.get_job_by_id(created["id"])["email"], "next@example.com")
        for key in ("account", "password", "custom_fields", "legacy_extra", "id", "created_at"):
            self.assertEqual(updated[key], created[key])
        document = storage.load_jobs()
        document["jobs"][0].pop("email")
        storage.JOBS_FILE.write_text(json.dumps(document), encoding="utf-8")
        legacy = storage.get_job_by_id(created["id"])
        self.assertEqual(legacy["email"], "")
        self.assertEqual(legacy["account"], "separate-login")
        self.assertNotIn("email", json.loads(storage.JOBS_FILE.read_text())["jobs"][0])
        self.assertEqual(storage.update_job(created["id"], {"email": " \t "})["email"], "")

    def test_read_only_empty_state_creates_nothing(self) -> None:
        self.assertEqual(storage.list_attachments(self.job_id), [])
        self.assertFalse(self.root.exists())
        self.assertFalse(storage.delete_attachment(self.job_id, str(uuid.uuid4())))
        self.assertEqual(storage.add_attachments(self.job_id, []), [])
        self.assertFalse(self.root.exists())

    def test_batch_duplicate_names_original_bytes_and_persisted_metadata(self) -> None:
        payloads = [("company.pdf", b"first\x00\xff"), ("company.pdf", b"second"), ("empty.bin", b"")]
        items = storage.add_attachments(self.job_id, payloads)
        self.assertEqual(len({item["id"] for item in items}), 3)
        self.assertEqual(self.read_index()["schema_version"], 1)
        self.assertEqual(len(self.read_index()["files"]), 3)
        for item, (filename, data) in zip(items, payloads):
            self.assertEqual(str(uuid.UUID(item["id"])), item["id"])
            self.assertEqual(item["original_filename"], filename)
            self.assertEqual(item["size_bytes"], len(data))
            self.assertEqual(storage.load_attachment(self.job_id, item["id"]), data)
            self.assertEqual(storage.get_attachment_path(self.job_id, item["id"]).parent, self.directory().resolve())
        # No process-local cache is needed; every list is reconstructed from disk.
        items[0]["original_filename"] = "mutated result"
        fresh = storage.list_attachments(self.job_id)
        self.assertEqual(sum(item["original_filename"] == "company.pdf" for item in fresh), 2)
        self.assertFalse(storage.JOBS_FILE.exists())
        self.assertFalse((self.directory().parent / "pdfs").exists())
        self.assertFalse((self.directory().parent / "resume.tex").exists())
        self.assertEqual(len(list(self.directory().iterdir())), 4)

    def test_files_and_deletion_are_scoped_to_one_job(self) -> None:
        first = storage.add_attachments(self.job_id, [("resume.tex", b"attachment source"), ("keep.txt", b"keep")])
        other_job = str(uuid.uuid4())
        other = storage.add_attachments(other_job, [("resume.tex", b"other job")])[0]
        job_directory = self.directory().parent
        sentinels = {
            "resume.tex": b"real resume",
            "notes.md": b"notes",
            "build/preview.pdf": b"compiled preview",
            "pdfs/saved.pdf": b"saved resume",
        }
        for filename, content in sentinels.items():
            path = job_directory / filename
            path.parent.mkdir(exist_ok=True)
            path.write_bytes(content)
        with self.assertRaises(FileNotFoundError):
            storage.load_attachment(self.job_id, other["id"])
        self.assertFalse(storage.delete_attachment(self.job_id, other["id"]))
        self.assertTrue(storage.delete_attachment(self.job_id, first[0]["id"]))
        self.assertFalse(storage.delete_attachment(self.job_id, first[0]["id"]))
        self.assertEqual(storage.load_attachment(self.job_id, first[1]["id"]), b"keep")
        self.assertEqual(storage.load_attachment(other_job, other["id"]), b"other job")
        for filename, content in sentinels.items():
            self.assertEqual((job_directory / filename).read_bytes(), content)

    def test_oversize_or_invalid_batch_does_not_write_any_file(self) -> None:
        with patch.object(storage, "MAX_ATTACHMENT_BYTES", 3):
            with self.assertRaisesRegex(ValueError, "50 MiB"):
                storage.add_attachments(self.job_id, [("valid.txt", b"abc"), ("large.txt", b"abcd")])
            self.assertFalse(self.root.exists())
            accepted = storage.add_attachments(self.job_id, [("exact.txt", b"abc")])[0]
            self.assertEqual(storage.load_attachment(self.job_id, accepted["id"]), b"abc")
        with self.assertRaises(TypeError):
            storage.add_attachments(self.job_id, [("notbytes.txt", "text")])
        self.assertEqual(len(storage.list_attachments(self.job_id)), 1)

    def test_bad_ids_and_display_names_cannot_escape_attachment_directory(self) -> None:
        for invalid in ("../outside", "x", "", self.job_id.upper()):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                storage.list_attachments(invalid)
        item = storage.add_attachments(self.job_id, [("../../outside.TEX", b"plain bytes")])[0]
        self.assertEqual(item["original_filename"], "outside.TEX")
        self.assertEqual(item["stored_filename"], item["id"] + ".tex")
        with self.assertRaises(ValueError):
            storage.load_attachment(self.job_id, "../outside")
        self.assertEqual(storage.load_attachment(self.job_id, item["id"]), b"plain bytes")
        self.assertFalse((self.root / "outside.TEX").exists())

    def test_uuid_collision_never_overwrites_existing_file(self) -> None:
        item = storage.add_attachments(self.job_id, [("same.txt", b"original")])[0]
        with patch.object(storage.uuid, "uuid4", return_value=uuid.UUID(item["id"])):
            with self.assertRaises(ValueError):
                storage.add_attachments(self.job_id, [("same.txt", b"replace")])
        self.assertEqual(storage.load_attachment(self.job_id, item["id"]), b"original")

    def test_symlink_attachment_directory_is_rejected(self) -> None:
        directory = self.directory()
        directory.parent.mkdir(parents=True)
        outside = self.root / "outside"
        outside.mkdir()
        directory.symlink_to(outside, target_is_directory=True)
        with self.assertRaises(ValueError):
            storage.add_attachments(self.job_id, [("x.txt", b"unsafe")])
        with self.assertRaises(ValueError):
            storage.list_attachments(self.job_id)
        self.assertEqual(list(outside.iterdir()), [])

    def test_symlink_attachment_and_index_paths_are_rejected(self) -> None:
        item = storage.add_attachments(self.job_id, [("x.txt", b"original")])[0]
        target = self.root / "outside.txt"
        target.write_bytes(b"safe")
        path = self.directory() / item["stored_filename"]
        path.unlink()
        path.symlink_to(target)
        with self.assertRaises((ValueError, storage.CorruptStorageError)):
            storage.load_attachment(self.job_id, item["id"])
        with self.assertRaises((ValueError, storage.CorruptStorageError)):
            storage.delete_attachment(self.job_id, item["id"])
        path.unlink()
        path.write_bytes(b"original")
        for filename in ("index.json.tmp", "index.json.bak", "index.json.bak.tmp"):
            with self.subTest(filename=filename):
                link = self.directory() / filename
                link.symlink_to(target)
                with self.assertRaises(ValueError):
                    storage.add_attachments(self.job_id, [("another.txt", b"new")])
                link.unlink()
                self.assertEqual(target.read_bytes(), b"safe")
                self.assertEqual(len(storage.list_attachments(self.job_id)), 1)
        index = self.directory() / "index.json"
        index.unlink()
        index.symlink_to(target)
        with self.assertRaises(ValueError):
            storage.list_attachments(self.job_id)

    def test_corrupt_or_missing_index_without_backup_never_resets(self) -> None:
        item = storage.add_attachments(self.job_id, [("x.txt", b"original")])[0]
        index = self.directory() / "index.json"
        index.write_text("{broken", encoding="utf-8")
        with self.assertRaises(storage.CorruptStorageError):
            storage.list_attachments(self.job_id)
        with self.assertRaises(storage.CorruptStorageError):
            storage.add_attachments(self.job_id, [("y.txt", b"new")])
        self.assertEqual(index.read_text(), "{broken")
        index.unlink()
        with self.assertRaises(storage.CorruptStorageError):
            storage.list_attachments(self.job_id)
        self.assertFalse(index.exists())
        self.assertEqual((self.directory() / item["stored_filename"]).read_bytes(), b"original")

    def test_malformed_metadata_and_traversal_index_never_get_used(self) -> None:
        storage.add_attachments(self.job_id, [("x.txt", b"original")])
        document = self.read_index()
        for key, bad in (("stored_filename", "../../outside.txt"), ("id", "../bad"), ("size_bytes", -1), ("uploaded_at", "bad")):
            with self.subTest(key=key):
                malformed = json.loads(json.dumps(document))
                malformed["files"][0][key] = bad
                (self.directory() / "index.json").write_text(json.dumps(malformed))
                with self.assertRaises(storage.CorruptStorageError):
                    storage.list_attachments(self.job_id)

    def test_rolling_backup_recovers_without_writes_and_is_preserved(self) -> None:
        first = storage.add_attachments(self.job_id, [("first.txt", b"first")])[0]
        second = storage.add_attachments(self.job_id, [("second.txt", b"second")])[0]
        backup = self.directory() / "index.json.bak"
        backup_bytes = backup.read_bytes()
        self.assertEqual(json.loads(backup_bytes)["files"][0]["id"], first["id"])
        index = self.directory() / "index.json"
        index.write_text("{damaged")
        with self.assertWarns(storage.StorageRecoveryWarning):
            recovered = storage.list_attachments(self.job_id)
        self.assertEqual([item["id"] for item in recovered], [first["id"]])
        self.assertEqual(index.read_text(), "{damaged")
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", storage.StorageRecoveryWarning)
            storage.add_attachments(self.job_id, [("third.txt", b"third")])
        self.assertEqual(backup.read_bytes(), backup_bytes)
        self.assertEqual((self.directory() / second["stored_filename"]).read_bytes(), b"second")
        index.unlink()
        with self.assertWarns(storage.StorageRecoveryWarning):
            self.assertEqual(storage.list_attachments(self.job_id)[0]["id"], first["id"])
        self.assertFalse(index.exists())

    def test_both_corrupt_indexes_are_preserved(self) -> None:
        storage.add_attachments(self.job_id, [("first.txt", b"one")])
        storage.add_attachments(self.job_id, [("second.txt", b"two")])
        index = self.directory() / "index.json"
        backup = self.directory() / "index.json.bak"
        index.write_text("bad primary")
        backup.write_text("bad backup")
        with self.assertRaises(storage.CorruptStorageError):
            storage.add_attachments(self.job_id, [("third.txt", b"three")])
        self.assertEqual(index.read_text(), "bad primary")
        self.assertEqual(backup.read_text(), "bad backup")

    def test_failed_index_write_rolls_back_entire_upload_batch(self) -> None:
        item = storage.add_attachments(self.job_id, [("existing.txt", b"existing")])[0]
        before = {path.name: path.read_bytes() for path in self.directory().iterdir()}
        with patch.object(storage, "_write_attachment_index", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                storage.add_attachments(self.job_id, [("new.txt", b"one"), ("new.txt", b"two")])
        after = {path.name: path.read_bytes() for path in self.directory().iterdir()}
        self.assertEqual(after, before)
        self.assertEqual(storage.load_attachment(self.job_id, item["id"]), b"existing")

    def test_failed_second_file_write_rolls_back_first_file(self) -> None:
        write_bytes = storage._atomic_write_job_bytes
        writes = 0

        def fail_second(job_id, parts, data):
            nonlocal writes
            writes += 1
            if writes == 2:
                raise OSError("disk full")
            return write_bytes(job_id, parts, data)

        with patch.object(storage, "_atomic_write_job_bytes", side_effect=fail_second):
            with self.assertRaises(OSError):
                storage.add_attachments(self.job_id, [("one.txt", b"one"), ("two.txt", b"two")])
        self.assertEqual(list(self.directory().iterdir()), [])
        self.assertEqual(storage.list_attachments(self.job_id), [])

    def test_index_replace_failure_keeps_previous_index_and_files(self) -> None:
        original = storage.add_attachments(self.job_id, [("existing.txt", b"existing")])[0]
        before_index = (self.directory() / "index.json").read_bytes()
        replace = storage.os.replace

        def reject_primary(source, destination):
            if Path(destination) == self.directory().resolve() / "index.json":
                raise OSError("replace blocked")
            return replace(source, destination)

        with patch.object(storage.os, "replace", side_effect=reject_primary):
            with self.assertRaises(OSError):
                storage.add_attachments(self.job_id, [("new.txt", b"new")])
        self.assertEqual((self.directory() / "index.json").read_bytes(), before_index)
        self.assertEqual(storage.load_attachment(self.job_id, original["id"]), b"existing")
        self.assertEqual(len(list(self.directory().iterdir())), 3)
        self.assertEqual(list(self.directory().glob("*.tmp")), [])

    def test_delete_index_failure_keeps_selected_file(self) -> None:
        item = storage.add_attachments(self.job_id, [("x.txt", b"keep")])[0]
        with patch.object(storage, "_write_attachment_index", side_effect=OSError("read only")):
            with self.assertRaises(OSError):
                storage.delete_attachment(self.job_id, item["id"])
        self.assertEqual(storage.load_attachment(self.job_id, item["id"]), b"keep")

    def test_delete_file_failure_restores_index(self) -> None:
        item = storage.add_attachments(self.job_id, [("x.txt", b"keep")])[0]
        selected = storage.get_attachment_path(self.job_id, item["id"])
        unlink = Path.unlink

        def reject_selected(path, *args, **kwargs):
            if path == selected:
                raise PermissionError("cannot remove")
            return unlink(path, *args, **kwargs)

        with patch.object(Path, "unlink", reject_selected):
            with self.assertRaisesRegex(OSError, "file and index were preserved"):
                storage.delete_attachment(self.job_id, item["id"])
        self.assertEqual(storage.load_attachment(self.job_id, item["id"]), b"keep")
        self.assertEqual(len(storage.list_attachments(self.job_id)), 1)

    def test_missing_attachment_can_be_listed_and_removed_without_page_failure(self) -> None:
        item = storage.add_attachments(self.job_id, [("missing.txt", b"content")])[0]
        (self.directory() / item["stored_filename"]).unlink()
        self.assertEqual(storage.list_attachments(self.job_id)[0]["id"], item["id"])
        with self.assertRaises(FileNotFoundError):
            storage.load_attachment(self.job_id, item["id"])
        self.assertTrue(storage.delete_attachment(self.job_id, item["id"]))
        self.assertEqual(storage.list_attachments(self.job_id), [])


if __name__ == "__main__":
    unittest.main()
