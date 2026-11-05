"""Reminder persistence tests using only isolated temporary project directories."""

from __future__ import annotations

import json
import tempfile
import unittest
import uuid
import warnings
from pathlib import Path
from unittest.mock import patch

import storage


class ReminderStorageTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "tracker"
        paths = patch.multiple(
            storage,
            PROJECT_ROOT=self.root,
            DATA_DIR=self.root / "data",
            APPLICATIONS_DIR=self.root / "applications",
            BACKUPS_DIR=self.root / "backups",
            JOBS_FILE=self.root / "data" / "jobs.json",
            SETTINGS_FILE=self.root / "data" / "settings.json",
        )
        paths.start()
        self.addCleanup(paths.stop)
        self.job_id = str(uuid.uuid4())

    def path(self, name: str = "reminders.json", job_id: str | None = None) -> Path:
        return self.root / "applications" / (job_id or self.job_id) / name

    @staticmethod
    def payload(**overrides: object) -> dict:
        data = {
            "title": "Technical interview",
            "kind": "interview",
            "start_at": "2026-10-06T14:00:00-04:00",
            "timezone": "America/New_York",
        }
        data.update(overrides)
        return data

    def test_missing_old_job_files_and_repeated_reads_create_nothing(self) -> None:
        for _ in range(3):
            self.assertEqual(storage.load_reminders(self.job_id), {"schema_version": 1, "reminders": []})
            self.assertEqual(storage.list_reminders(self.job_id), [])
        self.assertFalse(storage.delete_reminder(self.job_id, str(uuid.uuid4())))
        self.assertFalse(self.root.exists())

    def test_multiple_reminders_reload_utf8_and_do_not_duplicate_on_reads(self) -> None:
        first = storage.create_reminder(self.job_id, self.payload(title="面試 — 招募"))
        second = storage.create_reminder(self.job_id, self.payload(title="Assessment", kind="assessment"))
        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(str(uuid.UUID(first["id"])), first["id"])
        self.assertIsNone(first["end_at"])
        self.assertEqual(first["status"], "scheduled")
        original = self.path().read_bytes()
        modified = self.path().stat().st_mtime_ns
        self.assertIn("面試", original.decode("utf-8"))
        self.assertIn('\n  "reminders": [', original.decode("utf-8"))
        for _ in range(4):
            self.assertEqual({item["id"] for item in storage.list_reminders(self.job_id)}, {first["id"], second["id"]})
        self.assertEqual(self.path().read_bytes(), original)
        self.assertEqual(self.path().stat().st_mtime_ns, modified)
        self.assertFalse(storage.JOBS_FILE.exists())
        first["title"] = "changed return value"
        self.assertNotIn(first["title"], [item["title"] for item in storage.list_reminders(self.job_id)])

    def test_edit_preserves_identity_and_creation_timestamp(self) -> None:
        first = storage.create_reminder(self.job_id, self.payload())
        edited = storage.update_reminder(self.job_id, first["id"], {
            "title": "  Revised title  ",
            "start_at": "2026-11-06T14:00:00-05:00",
            "id": str(uuid.uuid4()), "created_at": "replace", "company": "Not duplicated",
        })
        self.assertEqual(edited["id"], first["id"])
        self.assertEqual(edited["created_at"], first["created_at"])
        self.assertEqual(edited["title"], "Revised title")
        self.assertEqual(edited["start_at"], "2026-11-06T14:00:00-05:00")
        self.assertNotIn("company", edited)
        self.assertEqual(storage.list_reminders(self.job_id), [edited])

    def test_status_changes_do_not_modify_jobs_or_other_job_files(self) -> None:
        job = storage.create_job({"company": "Example", "job_title": "Engineer", "status_id": "rejected", "archived": True, "password": "keep"})
        jobs_before = storage.JOBS_FILE.read_bytes()
        first = storage.create_reminder(job["id"], self.payload())
        for status in ("completed", "cancelled", "scheduled"):
            changed = storage.set_reminder_status(job["id"], first["id"], status)
            self.assertEqual(changed["status"], status)
            self.assertEqual(changed["id"], first["id"])
            self.assertEqual(storage.JOBS_FILE.read_bytes(), jobs_before)

    def test_job_scoping_and_targeted_deletion(self) -> None:
        first = storage.create_reminder(self.job_id, self.payload())
        keep = storage.create_reminder(self.job_id, self.payload(title="Keep"))
        other_id = str(uuid.uuid4())
        other = storage.create_reminder(other_id, self.payload(title="Other job"))
        other_bytes = self.path(job_id=other_id).read_bytes()
        with self.assertRaises(KeyError):
            storage.update_reminder(self.job_id, other["id"], {"title": "Wrong job"})
        self.assertFalse(storage.delete_reminder(self.job_id, other["id"]))
        self.assertTrue(storage.delete_reminder(self.job_id, first["id"]))
        self.assertFalse(storage.delete_reminder(self.job_id, first["id"]))
        self.assertEqual(storage.list_reminders(self.job_id), [keep])
        self.assertEqual(self.path(job_id=other_id).read_bytes(), other_bytes)

    def test_permanent_job_delete_removes_reminders_and_their_backup(self) -> None:
        job = storage.create_job({"company": "Example", "job_title": "Engineer"})
        first = storage.create_reminder(job["id"], self.payload())
        storage.update_reminder(job["id"], first["id"], {"title": "Updated"})
        self.assertTrue(self.path("reminders.json.bak", job["id"]).exists())
        storage.delete_job(job["id"])
        self.assertFalse(self.path(job_id=job["id"]).parent.exists())
        self.assertEqual(storage.list_reminders(job["id"]), [])
        self.assertFalse(self.path(job_id=job["id"]).parent.exists())

    def test_optional_end_cross_day_and_fall_dst_fold_compare_actual_instants(self) -> None:
        cross_day = storage.create_reminder(self.job_id, self.payload(
            start_at="2026-10-06T23:00:00-04:00", end_at="2026-10-07T01:00:00-04:00",
        ))
        self.assertEqual(cross_day["end_at"], "2026-10-07T01:00:00-04:00")
        fold = storage.create_reminder(self.job_id, self.payload(
            start_at="2026-11-01T01:45:00-04:00", end_at="2026-11-01T01:15:00-05:00",
        ))
        self.assertEqual(fold["end_at"], "2026-11-01T01:15:00-05:00")
        with self.assertRaisesRegex(ValueError, "later"):
            storage.update_reminder(self.job_id, fold["id"], {
                "start_at": "2026-11-01T01:15:00-05:00", "end_at": "2026-11-01T01:45:00-04:00",
            })

    def test_sorting_uses_utc_instants_not_offset_strings(self) -> None:
        later = storage.create_reminder(self.job_id, self.payload(
            start_at="2026-10-06T10:00:00-07:00", timezone="America/Los_Angeles",
        ))
        earlier = storage.create_reminder(self.job_id, self.payload(
            start_at="2026-10-06T12:00:00-04:00", timezone="America/New_York",
        ))
        self.assertEqual([item["id"] for item in storage.list_reminders(self.job_id)], [earlier["id"], later["id"]])

    def test_invalid_fields_never_write(self) -> None:
        cases = [
            {"title": "  "}, {"kind": "unknown"}, {"status": "overdue"},
            {"start_at": "2026-10-06T14:00:00"}, {"start_at": "2026-10-06"},
            {"timezone": "Not/AZone"}, {"timezone": ""},
            {"start_at": "2026-03-08T02:30:00-05:00"},  # nonexistent spring time
            {"start_at": "2026-10-06T14:00:00-05:00"},  # wrong season offset
            {"end_at": "2026-10-06T14:00:00-04:00"},
            {"end_at": "2026-10-06T13:59:00-04:00"},
            {"end_at": ""}, {"notes": None}, {"location_or_url": 123},
        ]
        for overrides in cases:
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                storage.create_reminder(self.job_id, self.payload(**overrides))
            self.assertFalse(self.root.exists())

    def test_corrupt_primary_without_backup_blocks_all_mutations(self) -> None:
        first = storage.create_reminder(self.job_id, self.payload())
        self.path().write_text("{broken", encoding="utf-8")
        actions = [
            lambda: storage.list_reminders(self.job_id),
            lambda: storage.create_reminder(self.job_id, self.payload()),
            lambda: storage.update_reminder(self.job_id, first["id"], {"title": "New"}),
            lambda: storage.delete_reminder(self.job_id, first["id"]),
        ]
        for action in actions:
            with self.assertRaises(storage.CorruptStorageError):
                action()
            self.assertEqual(self.path().read_text(), "{broken")
        self.assertFalse(self.path("reminders.json.bak").exists())

    def test_recovery_warns_keeps_damaged_primary_until_save_and_retains_backup(self) -> None:
        first = storage.create_reminder(self.job_id, self.payload())
        storage.update_reminder(self.job_id, first["id"], {"title": "Newer"})
        backup_bytes = self.path("reminders.json.bak").read_bytes()
        self.path().write_text("{broken", encoding="utf-8")
        with self.assertWarns(storage.StorageRecoveryWarning):
            recovered = storage.list_reminders(self.job_id)
        self.assertEqual(recovered, [first])
        self.assertEqual(self.path().read_text(), "{broken")
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", storage.StorageRecoveryWarning)
            saved = storage.update_reminder(self.job_id, first["id"], {"title": "Recovered edit"})
        self.assertEqual(storage.list_reminders(self.job_id), [saved])
        self.assertEqual(self.path("reminders.json.bak").read_bytes(), backup_bytes)

    def test_missing_primary_recovers_read_only_and_invalid_backup_is_not_empty(self) -> None:
        first = storage.create_reminder(self.job_id, self.payload())
        storage.update_reminder(self.job_id, first["id"], {"title": "Newer"})
        self.path().unlink()
        with self.assertWarns(storage.StorageRecoveryWarning):
            self.assertEqual(storage.list_reminders(self.job_id), [first])
        self.assertFalse(self.path().exists())
        self.path("reminders.json.bak").write_text('{"schema_version": 2, "reminders": []}')
        with self.assertRaises(storage.CorruptStorageError):
            storage.list_reminders(self.job_id)
        self.assertFalse(self.path().exists())

    def test_schema_and_duplicate_identity_damage_are_detected(self) -> None:
        item = storage.create_reminder(self.job_id, self.payload())
        for document in (
            {"schema_version": True, "reminders": []},
            {"schema_version": 1, "reminders": [item, item]},
            {"schema_version": 1, "reminders": [{**item, "start_at": "bad"}]},
            {"schema_version": 1, "reminders": [{**item, "created_at": "2026-10-01T01:00:00"}]},
        ):
            self.path().write_text(json.dumps(document))
            with self.subTest(document=document), self.assertRaises(storage.CorruptStorageError):
                storage.list_reminders(self.job_id)

    def test_invalid_uuid_and_symlink_paths_are_rejected(self) -> None:
        for invalid in ("../outside", "", self.job_id.upper()):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                storage.list_reminders(invalid)
        first = storage.create_reminder(self.job_id, self.payload())
        outside = self.root / "outside.txt"
        outside.write_bytes(b"sentinel")
        for filename in ("reminders.json.tmp", "reminders.json.bak", "reminders.json.bak.tmp"):
            path = self.path(filename)
            path.symlink_to(outside)
            with self.subTest(filename=filename), self.assertRaises(ValueError):
                storage.update_reminder(self.job_id, first["id"], {"title": "Unsafe"})
            path.unlink()
            self.assertEqual(outside.read_bytes(), b"sentinel")
            self.assertEqual(storage.list_reminders(self.job_id), [first])
        self.path().unlink()
        self.path().symlink_to(outside)
        with self.assertRaises(ValueError):
            storage.list_reminders(self.job_id)

    def test_symlink_job_directory_is_rejected(self) -> None:
        self.path().parent.parent.mkdir(parents=True)
        outside = self.root / "outside"
        outside.mkdir()
        self.path().parent.symlink_to(outside, target_is_directory=True)
        with self.assertRaises(ValueError):
            storage.list_reminders(self.job_id)
        with self.assertRaises(ValueError):
            storage.create_reminder(self.job_id, self.payload())
        self.assertEqual(list(outside.iterdir()), [])

    def test_uuid_collision_does_not_overwrite_existing_reminder(self) -> None:
        first = storage.create_reminder(self.job_id, self.payload())
        before = self.path().read_bytes()
        with patch.object(storage.uuid, "uuid4", return_value=uuid.UUID(first["id"])):
            with self.assertRaisesRegex(ValueError, "unique"):
                storage.create_reminder(self.job_id, self.payload(title="Collision"))
        self.assertEqual(self.path().read_bytes(), before)

    def test_failed_atomic_replace_preserves_primary_and_cleans_temporary(self) -> None:
        first = storage.create_reminder(self.job_id, self.payload())
        before = self.path().read_bytes()
        original_replace = storage.os.replace

        def fail_primary(source: Path, destination: Path) -> None:
            if Path(destination) == self.path().resolve():
                raise OSError("simulated replacement failure")
            original_replace(source, destination)

        with patch.object(storage.os, "replace", side_effect=fail_primary):
            with self.assertRaises(OSError):
                storage.update_reminder(self.job_id, first["id"], {"title": "Failed edit"})
        self.assertEqual(self.path().read_bytes(), before)
        self.assertFalse(self.path("reminders.json.tmp").exists())
        self.assertEqual(storage.list_reminders(self.job_id), [first])


if __name__ == "__main__":
    unittest.main()
