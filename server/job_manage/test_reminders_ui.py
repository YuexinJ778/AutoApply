"""Reminder forms and actions against isolated temporary tracker storage."""

from __future__ import annotations

from datetime import date, time
import importlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from streamlit.testing.v1 import AppTest

import storage


class ReminderUITests(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name) / "tracker"
        paths = patch.multiple(
            storage, PROJECT_ROOT=self.root, DATA_DIR=self.root / "data",
            APPLICATIONS_DIR=self.root / "applications", BACKUPS_DIR=self.root / "backups",
            JOBS_FILE=self.root / "data/jobs.json", SETTINGS_FILE=self.root / "data/settings.json",
        )
        paths.start()
        self.addCleanup(paths.stop)
        storage.ensure_storage()
        self.app = importlib.import_module("app")
        local_zone = patch.object(self.app, "_get_reminder_timezone", return_value="America/New_York", create=True)
        local_zone.start()
        self.addCleanup(local_zone.stop)
        self.job = storage.create_job({
            "company": "Test Company", "job_title": "Test Role", "status_id": "applied",
            "applied_date": "", "account": "untouched", "password": "also untouched",
        })

    def tracker(self) -> AppTest:
        tracker = AppTest.from_string(
            "import app, storage, streamlit as st\n"
            "app._render_reminders_tab(storage.get_job_by_id(st.session_state['test_job_id']), storage.load_settings())",
            default_timeout=10,
        )
        tracker.session_state["test_job_id"] = self.job["id"]
        return tracker.run()

    @staticmethod
    def by_label(elements, label):
        return next(element for element in elements if element.label == label)

    def assert_clean(self, tracker):
        self.assertEqual([item.message for item in tracker.exception], [])

    def fill(self, tracker, title="Test interview"):
        self.by_label(tracker.text_input, "Title *").set_value(title)
        self.by_label(tracker.date_input, "Date *").set_value(date(2026, 10, 6))
        self.by_label(tracker.time_input, "Time *").set_value(time(14, 0))
        self.by_label(tracker.checkbox, "I confirm the event time and time zone").check()

    def create(self, title="Stored reminder", **updates):
        data = {
            "title": title, "kind": "interview", "start_at": "2026-10-06T14:00:00-04:00",
            "end_at": None, "timezone": "America/New_York", "location_or_url": "", "notes": "",
        }
        data.update(updates)
        return storage.create_reminder(self.job["id"], data)

    def test_today_preserves_form_drafts_and_never_writes(self):
        tracker = self.tracker()
        self.assert_clean(tracker)
        self.assertIsNone(self.by_label(tracker.time_input, "Time *").value)
        self.by_label(tracker.text_input, "Title *").set_value("Draft title")
        self.by_label(tracker.text_input, "Location or meeting URL").set_value("Room A")
        self.by_label(tracker.text_area, "Reminder notes").set_value("Draft notes")
        with patch.object(storage, "create_reminder", wraps=storage.create_reminder) as create:
            self.by_label(tracker.button, "Today").click().run()
            self.assert_clean(tracker)
            self.assertIsNotNone(self.by_label(tracker.date_input, "Date *").value)
            self.assertEqual(self.by_label(tracker.text_input, "Title *").value, "Draft title")
            self.assertEqual(self.by_label(tracker.text_input, "Location or meeting URL").value, "Room A")
            self.assertEqual(self.by_label(tracker.text_area, "Reminder notes").value, "Draft notes")
            self.assertIsNone(self.by_label(tracker.time_input, "Time *").value)
            tracker.run()
            create.assert_not_called()
        self.assertFalse((storage.get_job_directory(self.job["id"]) / "reminders.json").exists())
        self.assertFalse(tracker.get("form")[0].proto.form.enter_to_submit)

    def test_explicit_time_and_confirmation_are_required_then_multiple_saves_are_unique(self):
        tracker = self.tracker()
        self.by_label(tracker.text_input, "Title *").set_value("First")
        self.by_label(tracker.date_input, "Date *").set_value(date(2026, 10, 6))
        self.by_label(tracker.button, "Save Reminder").click().run()
        self.assert_clean(tracker)
        self.assertIn("Choose both a date and a time", tracker.error[0].value)
        self.assertEqual(storage.list_reminders(self.job["id"]), [])
        self.by_label(tracker.time_input, "Time *").set_value(time(14))
        self.by_label(tracker.button, "Save Reminder").click().run()
        self.assertIn("Confirm the event time", tracker.error[0].value)
        self.fill(tracker, "First")
        self.by_label(tracker.button, "Save Reminder").click().run()
        self.assert_clean(tracker)
        first = storage.list_reminders(self.job["id"])[0]
        self.assertEqual(first["start_at"], "2026-10-06T14:00:00-04:00")
        self.assertIsNone(first["end_at"])
        tracker.run()
        tracker.run()
        self.assertEqual(len(storage.list_reminders(self.job["id"])), 1)
        self.fill(tracker, "Second")
        self.by_label(tracker.button, "Save Reminder").click().run()
        records = storage.list_reminders(self.job["id"])
        self.assertEqual(len(records), 2)
        self.assertEqual(len({item["id"] for item in records}), 2)
        self.assertEqual({item["title"] for item in records}, {"First", "Second"})

    def test_edit_preserves_id_and_stored_timezone(self):
        saved = self.create(timezone="Asia/Tokyo", start_at="2026-10-07T09:00:00+09:00")
        tracker = self.tracker()
        self.by_label(tracker.button, "Edit").click().run()
        self.assert_clean(tracker)
        self.assertEqual(self.by_label(tracker.text_input, "Time zone (IANA) *").value, "Asia/Tokyo")
        self.assertEqual(self.by_label(tracker.time_input, "Time *").value, time(9))
        self.by_label(tracker.text_input, "Title *").set_value("Updated title")
        self.by_label(tracker.date_input, "Date *").set_value(date(2026, 10, 9))
        self.by_label(tracker.checkbox, "I confirm the event time and time zone").check()
        self.by_label(tracker.button, "Save Reminder").click().run()
        self.assert_clean(tracker)
        updated = storage.list_reminders(self.job["id"])
        self.assertEqual(len(updated), 1)
        self.assertEqual(updated[0]["id"], saved["id"])
        self.assertEqual(updated[0]["created_at"], saved["created_at"])
        self.assertEqual(updated[0]["title"], "Updated title")
        self.assertEqual(updated[0]["start_at"], "2026-10-09T09:00:00+09:00")

    def test_status_actions_delete_confirmation_and_view_use_uuids(self):
        saved = self.create()
        other = self.create("Keep this")
        snapshot = storage.JOBS_FILE.read_bytes()
        tracker = self.tracker()
        prefix = f"reminder_{self.job['id']}_{saved['id']}"
        for suffix, expected in [("complete", "completed"), ("reopen", "scheduled"), ("cancel", "cancelled"), ("reopen", "scheduled")]:
            tracker.button(key=f"{prefix}_{suffix}").click().run()
            self.assert_clean(tracker)
            self.assertEqual(next(item for item in storage.list_reminders(self.job["id"]) if item["id"] == saved["id"])["status"], expected)
            self.assertEqual(storage.JOBS_FILE.read_bytes(), snapshot)
        with patch.object(self.app, "_view_reminder_in_calendar", create=True) as navigate:
            tracker.button(key=f"{prefix}_calendar").click().run()
            self.assert_clean(tracker)
            navigate.assert_called_once()
            self.assertEqual(navigate.call_args.args[0], self.job["id"])
            self.assertEqual(navigate.call_args.args[1]["id"], saved["id"])
        self.assertTrue(tracker.button(key=f"{prefix}_delete").disabled)
        tracker.checkbox(key=f"{prefix}_delete_confirm").check().run()
        self.assertFalse(tracker.button(key=f"{prefix}_delete").disabled)
        tracker.button(key=f"{prefix}_delete").click().run()
        self.assert_clean(tracker)
        self.assertEqual([item["id"] for item in storage.list_reminders(self.job["id"])], [other["id"]])
        self.assertEqual(storage.JOBS_FILE.read_bytes(), snapshot)

    def test_corrupt_source_disables_forms_without_replacing_bytes(self):
        path = storage.get_job_directory(self.job["id"]) / "reminders.json"
        path.write_text("{broken", encoding="utf-8")
        tracker = self.tracker()
        self.assert_clean(tracker)
        self.assertTrue(tracker.error)
        self.assertTrue(tracker.warning)
        self.assertFalse(any(item.label == "Save Reminder" for item in tracker.button))
        self.assertEqual(path.read_text(encoding="utf-8"), "{broken")

    def test_dst_and_optional_end_validation(self):
        base = {
            "title": "DST reminder", "kind": "interview", "timezone": "America/New_York",
            "start_date": date(2026, 11, 1), "start_time": time(1, 30), "confirmed": True,
        }
        with self.assertRaisesRegex(ValueError, "occurs twice"):
            self.app._reminder_form_payload(base)
        first = self.app._reminder_form_payload({**base, "start_fold": 0})
        second = self.app._reminder_form_payload({**base, "start_fold": 1})
        self.assertTrue(first["start_at"].endswith("-04:00"))
        self.assertTrue(second["start_at"].endswith("-05:00"))
        with self.assertRaisesRegex(ValueError, "does not exist"):
            self.app._reminder_form_payload({**base, "start_date": date(2026, 3, 8), "start_time": time(2, 30)})
        with self.assertRaisesRegex(ValueError, "both the end date"):
            self.app._reminder_form_payload({**base, "start_fold": 0, "end_date": date(2026, 11, 1)})
        # 01:15 after the rollback follows 01:30 before the rollback.
        repeated = self.app._reminder_form_payload({
            **base, "start_fold": 0, "end_date": date(2026, 11, 1), "end_time": time(1, 15), "end_fold": 1,
        })
        self.assertTrue(repeated["end_at"].endswith("-05:00"))
        with self.assertRaisesRegex(ValueError, "later than"):
            self.app._reminder_form_payload({
                **base, "start_fold": 1, "end_date": date(2026, 11, 1), "end_time": time(1, 45), "end_fold": 0,
            })


if __name__ == "__main__":
    unittest.main()
