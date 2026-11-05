"""Standard-library tests for the local job tracker storage layer."""

from __future__ import annotations

import json
import tempfile
import unittest
import uuid
import warnings
from pathlib import Path
from unittest.mock import patch

import storage


class StorageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.root = Path(self.temporary_directory.name) / "portable_job_tracker"
        self.data_dir = self.root / "data"
        self.applications_dir = self.root / "applications"
        self.backups_dir = self.root / "backups"
        self.jobs_file = self.data_dir / "jobs.json"
        self.settings_file = self.data_dir / "settings.json"
        self.path_patch = patch.multiple(
            storage,
            PROJECT_ROOT=self.root,
            DATA_DIR=self.data_dir,
            APPLICATIONS_DIR=self.applications_dir,
            BACKUPS_DIR=self.backups_dir,
            JOBS_FILE=self.jobs_file,
            SETTINGS_FILE=self.settings_file,
        )
        self.path_patch.start()
        self.addCleanup(self.path_patch.stop)

    @staticmethod
    def job_data(**overrides: object) -> dict[str, object]:
        data: dict[str, object] = {
            "status_id": "applied",
            "applied_date": "2026-09-01",
            "company": "Example Company",
            "job_title": "Quantitative Analyst",
            "location": "Chicago, IL",
            "job_url": "https://example.com/job/123",
            "account": "demo.applicant@example.com",
            "password": "plain-text-password",
            "custom_fields": {},
            "archived": False,
        }
        data.update(overrides)
        return data

    def test_first_initialisation_creates_directories_and_json(self) -> None:
        storage.ensure_storage()

        self.assertTrue(self.data_dir.is_dir())
        self.assertTrue(self.applications_dir.is_dir())
        self.assertTrue(self.backups_dir.is_dir())
        self.assertEqual(storage.load_jobs()["jobs"], [])
        settings = storage.load_settings()
        self.assertEqual(len(settings["statuses"]), 8)
        self.assertEqual(settings["custom_fields"], [])

    def test_initialisation_rejects_storage_root_symlink(self) -> None:
        self.root.mkdir()
        outside = Path(self.temporary_directory.name) / "outside-data"
        outside.mkdir()
        try:
            self.data_dir.symlink_to(outside, target_is_directory=True)
        except OSError as error:
            self.skipTest(f"此平台不允許建立符號連結：{error}")

        with self.assertRaises(ValueError):
            storage.ensure_storage()
        self.assertEqual(list(outside.iterdir()), [])

    def test_empty_jobs_document_loads(self) -> None:
        storage.ensure_storage()
        self.jobs_file.write_text(
            '{"schema_version": 1, "jobs": []}', encoding="utf-8"
        )

        self.assertEqual(storage.load_jobs(), {"schema_version": 1, "jobs": []})

    def test_created_job_can_be_reloaded_with_plain_text_password(self) -> None:
        created = storage.create_job(self.job_data())
        reloaded = storage.get_job_by_id(created["id"])

        self.assertIsNotNone(reloaded)
        self.assertEqual(reloaded["company"], "Example Company")
        self.assertEqual(reloaded["password"], "plain-text-password")
        on_disk = json.loads(self.jobs_file.read_text(encoding="utf-8"))
        self.assertEqual(on_disk["jobs"][0]["password"], "plain-text-password")

    def test_job_uuids_are_unique(self) -> None:
        first = storage.create_job(self.job_data(company="First"))
        second = storage.create_job(self.job_data(company="Second"))

        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(str(uuid.UUID(first["id"])), first["id"])
        self.assertEqual(str(uuid.UUID(second["id"])), second["id"])

    def test_update_preserves_uuid_and_creation_timestamp(self) -> None:
        created = storage.create_job(self.job_data())
        updated = storage.update_job(
            created["id"], {"id": str(uuid.uuid4()), "company": "Renamed Company"}
        )

        self.assertEqual(updated["id"], created["id"])
        self.assertEqual(updated["created_at"], created["created_at"])
        self.assertEqual(updated["company"], "Renamed Company")

    def test_custom_fields_round_trip_and_old_job_defaults(self) -> None:
        custom_fields = {
            "salary": "$100,000",
            "available_date": "2026-10-01",
            "visa_support": True,
        }
        created = storage.create_job(self.job_data(custom_fields=custom_fields))
        self.assertEqual(storage.get_job_by_id(created["id"])["custom_fields"], custom_fields)

        document = storage.load_jobs()
        document["jobs"][0].pop("job_url")
        document["jobs"][0].pop("archived")
        document["jobs"][0].pop("custom_fields")
        storage.save_jobs(document)
        old_job = storage.load_jobs()["jobs"][0]
        self.assertEqual(old_job["job_url"], "")
        self.assertFalse(old_job["archived"])
        self.assertEqual(old_job["custom_fields"], {})

    def test_atomic_json_write_is_valid_and_leaves_no_temp_file(self) -> None:
        storage.ensure_storage()
        payload = {"schema_version": 1, "jobs": [{"company": "台灣公司"}]}
        storage.atomic_write_json(self.jobs_file, payload)

        self.assertEqual(json.loads(self.jobs_file.read_text(encoding="utf-8")), payload)
        self.assertFalse(self.jobs_file.with_name("jobs.json.tmp").exists())

    def test_atomic_json_write_creates_one_backup_of_existing_file(self) -> None:
        storage.ensure_storage()
        previous = storage.load_jobs()
        replacement = {"schema_version": 1, "jobs": [{"id": "new"}]}
        storage.atomic_write_json(self.jobs_file, replacement)

        backup = self.backups_dir / "jobs.json.bak"
        self.assertTrue(backup.is_file())
        self.assertEqual(json.loads(backup.read_text(encoding="utf-8")), previous)
        self.assertEqual(json.loads(self.jobs_file.read_text(encoding="utf-8")), replacement)

    def test_json_temp_and_backup_symlinks_cannot_write_outside(self) -> None:
        storage.ensure_storage()
        outside = self.root / "outside.txt"
        outside.write_text("safe", encoding="utf-8")
        temporary = self.data_dir / "jobs.json.tmp"
        try:
            temporary.symlink_to(outside)
        except OSError as error:
            self.skipTest(f"此平台不允許建立符號連結：{error}")

        with self.assertRaises(ValueError):
            storage.atomic_write_json(self.jobs_file, {"schema_version": 1, "jobs": []})
        self.assertEqual(outside.read_text(encoding="utf-8"), "safe")
        temporary.unlink()

        backup = self.backups_dir / "jobs.json.bak"
        backup.symlink_to(outside)
        with self.assertRaises(ValueError):
            storage.atomic_write_json(self.jobs_file, {"schema_version": 1, "jobs": []})
        self.assertEqual(outside.read_text(encoding="utf-8"), "safe")

    def test_job_directory_is_directly_below_applications(self) -> None:
        created = storage.create_job(self.job_data())
        directory = storage.get_job_directory(created["id"])

        self.assertTrue(directory.is_dir())
        self.assertEqual(directory.parent, self.applications_dir.resolve())
        self.assertEqual(directory.name, created["id"])
        with self.assertRaises(ValueError):
            storage.get_job_directory("../../outside")

    def test_markdown_and_latex_use_independent_utf8_files(self) -> None:
        created = storage.create_job(self.job_data())
        directory = storage.get_job_directory(created["id"])
        notes = directory / "notes.md"
        latex = directory / "resume.tex"

        storage.save_text_file(notes, "# 面試筆記\n\n準備案例。")
        storage.save_text_file(latex, "\\documentclass{article}\n% 中文")

        self.assertEqual(storage.load_text_file(notes), "# 面試筆記\n\n準備案例。")
        self.assertEqual(storage.load_text_file(latex), "\\documentclass{article}\n% 中文")
        self.assertFalse((directory / "notes.md.tmp").exists())

    def test_delete_job_cannot_delete_outside_applications(self) -> None:
        created = storage.create_job(self.job_data())
        directory = storage.get_job_directory(created["id"])
        storage.save_text_file(directory / "notes.md", "keep scoped")
        outside = self.root / "do-not-delete.txt"
        outside.write_text("safe", encoding="utf-8")

        with self.assertRaises(ValueError):
            storage.delete_job("../do-not-delete.txt")
        self.assertTrue(outside.exists())

        storage.delete_job(created["id"])
        self.assertFalse(directory.exists())
        self.assertTrue(outside.exists())
        self.assertIsNone(storage.get_job_by_id(created["id"]))

    def test_delete_rejects_a_uuid_directory_symlink(self) -> None:
        created = storage.create_job(self.job_data())
        directory = storage.get_job_directory(created["id"])
        directory.rmdir()
        outside = self.root / "outside-directory"
        outside.mkdir()
        sentinel = outside / "keep.txt"
        sentinel.write_text("safe", encoding="utf-8")
        try:
            directory.symlink_to(outside, target_is_directory=True)
        except OSError as error:
            self.skipTest(f"此平台不允許建立符號連結：{error}")

        with self.assertRaises(ValueError):
            storage.delete_job(created["id"])

        self.assertTrue(sentinel.exists())
        self.assertIsNotNone(storage.get_job_by_id(created["id"]))

    def test_summary_groups_are_calculated_from_current_settings(self) -> None:
        settings = storage.load_settings()
        settings["statuses"].append(
            {
                "id": "second_interview",
                "label": "二面",
                "summary_group": "pending",
                "order": 45,
                "active": True,
            }
        )
        jobs = [
            {"status_id": "offer", "archived": False},
            {"status_id": "rejected", "archived": False},
            {"status_id": "second_interview", "archived": False},
            {"status_id": "applied", "archived": False},
            {"status_id": "offer", "archived": True},
        ]

        self.assertEqual(
            storage.calculate_summary_counts(jobs, settings),
            {"offer": 1, "rejected": 1, "pending": 2},
        )
        self.assertEqual(
            storage.calculate_summary_counts(jobs, settings, include_archived=True),
            {"offer": 2, "rejected": 1, "pending": 2},
        )

    def test_corrupt_primary_recovers_from_valid_backup(self) -> None:
        created = storage.create_job(self.job_data())
        # A second save makes the previous valid document the rolling backup.
        storage.update_job(created["id"], {"location": "New York, NY"})
        self.jobs_file.write_text("{broken", encoding="utf-8")

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            recovered = storage.load_jobs()

        self.assertEqual(recovered["jobs"][0]["id"], created["id"])
        self.assertTrue(
            any(item.category is storage.StorageRecoveryWarning for item in caught)
        )

    def test_missing_primary_is_restored_from_backup_instead_of_reset(self) -> None:
        created = storage.create_job(self.job_data())
        storage.update_job(created["id"], {"location": "New York, NY"})
        self.jobs_file.unlink()

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            recovered = storage.load_jobs()

        self.assertEqual(recovered["jobs"][0]["id"], created["id"])
        self.assertTrue(self.jobs_file.is_file())
        self.assertTrue(
            any(item.category is storage.StorageRecoveryWarning for item in caught)
        )

    def test_save_after_recovery_preserves_the_only_good_backup(self) -> None:
        created = storage.create_job(self.job_data())
        storage.update_job(created["id"], {"location": "New York, NY"})
        backup = self.backups_dir / "jobs.json.bak"
        good_backup = backup.read_bytes()
        self.jobs_file.write_text('{"not_jobs": []}', encoding="utf-8")

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", storage.StorageRecoveryWarning)
            recovered = storage.load_jobs()
        recovered["jobs"][0]["location"] = "Boston, MA"
        storage.save_jobs(recovered)

        self.assertEqual(backup.read_bytes(), good_backup)
        self.assertEqual(storage.load_jobs()["jobs"][0]["location"], "Boston, MA")

    def test_corrupt_primary_and_backup_raise_without_overwriting(self) -> None:
        storage.ensure_storage()
        self.jobs_file.write_text("{broken primary", encoding="utf-8")
        backup = self.backups_dir / "jobs.json.bak"
        backup.write_text("{broken backup", encoding="utf-8")

        with self.assertRaises(storage.CorruptStorageError):
            storage.load_jobs()
        self.assertEqual(self.jobs_file.read_text(encoding="utf-8"), "{broken primary")

    def test_pdf_validation_storage_metadata_and_deletion(self) -> None:
        created = storage.create_job(self.job_data())
        pdf_data = b"%PDF-1.7\nlocal test PDF\n%%EOF\n"

        path = storage.save_uploaded_pdf(created["id"], pdf_data)
        self.assertEqual(storage.load_resume_pdf(created["id"]), pdf_data)
        metadata = storage.get_resume_pdf_metadata(created["id"])
        self.assertEqual(metadata["filename"], "resume.pdf")
        self.assertEqual(metadata["size"], len(pdf_data))
        self.assertTrue(storage.delete_resume_pdf(created["id"]))
        self.assertFalse(storage.delete_resume_pdf(created["id"]))
        self.assertFalse(path.exists())

        with self.assertRaises(ValueError):
            storage.save_uploaded_pdf(created["id"], b"not a PDF")

    def test_application_temp_and_pdf_leaf_symlinks_are_rejected(self) -> None:
        created = storage.create_job(self.job_data())
        directory = storage.get_job_directory(created["id"])
        outside = self.root / "outside.txt"
        outside.write_text("safe", encoding="utf-8")
        notes_temporary = directory / "notes.md.tmp"
        try:
            notes_temporary.symlink_to(outside)
        except OSError as error:
            self.skipTest(f"此平台不允許建立符號連結：{error}")

        with self.assertRaises(ValueError):
            storage.save_text_file(directory / "notes.md", "overwrite")
        self.assertEqual(outside.read_text(encoding="utf-8"), "safe")
        notes_temporary.unlink()

        pdf_path = directory / "resume.pdf"
        pdf_path.symlink_to(outside)
        with self.assertRaises(ValueError):
            storage.load_resume_pdf(created["id"])
        self.assertEqual(outside.read_text(encoding="utf-8"), "safe")


if __name__ == "__main__":
    unittest.main()
