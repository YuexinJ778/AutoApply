"""Date Applied regressions against temporary tracker data, never real jobs."""

from __future__ import annotations

from datetime import date
import importlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from streamlit.testing.v1 import AppTest

import storage


class DetailsDateTests(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name) / "tracker"
        self.jobs_file = self.root / "data" / "jobs.json"
        paths = patch.multiple(
            storage,
            PROJECT_ROOT=self.root,
            DATA_DIR=self.root / "data",
            APPLICATIONS_DIR=self.root / "applications",
            BACKUPS_DIR=self.root / "backups",
            JOBS_FILE=self.jobs_file,
            SETTINGS_FILE=self.root / "data" / "settings.json",
        )
        paths.start()
        self.addCleanup(paths.stop)
        storage.ensure_storage()
        self.app = importlib.import_module("app")

    def create_job(self, **overrides: object) -> dict:
        values = {
            "company": "Stored Company",
            "job_title": "Stored Title",
            "status_id": "applied",
            "applied_date": "2024-02-29",
            "email": "stored@example.com",
            "account": "stored-login",
            "password": "stored password",
            "custom_fields": {},
        }
        values.update(overrides)
        return storage.create_job(values)

    def details_app(self, job_id: str) -> AppTest:
        tracker = AppTest.from_string(
            "import app, storage, streamlit as st\n"
            "app._render_basic_job_tab(\n"
            "    storage.get_job_by_id(st.session_state['test_job_id']),\n"
            "    storage.load_settings(),\n"
            ")\n",
            default_timeout=10,
        )
        tracker.session_state["test_job_id"] = job_id
        return tracker.run()

    def assert_no_exception(self, tracker: AppTest) -> None:
        self.assertEqual([error.message for error in tracker.exception], [])

    @staticmethod
    def by_label(elements, label: str):
        return next(element for element in elements if element.label == label)

    @staticmethod
    def date_key(job: dict) -> str:
        return f"edit_job_{job['id']}_date_picker"

    def disk_snapshot(self) -> tuple[bytes, int]:
        return self.jobs_file.read_bytes(), self.jobs_file.stat().st_mtime_ns

    def test_existing_empty_and_missing_dates_load_without_writes(self) -> None:
        jobs = [self.create_job(), self.create_job(applied_date=""), self.create_job()]
        document = json.loads(self.jobs_file.read_text(encoding="utf-8"))
        document["jobs"][-1].pop("applied_date")
        self.jobs_file.write_text(json.dumps(document), encoding="utf-8")
        snapshot = self.disk_snapshot()

        for job, expected in zip(jobs, [date(2024, 2, 29), None, None]):
            with self.subTest(job_id=job["id"]):
                tracker = self.details_app(job["id"])
                self.assert_no_exception(tracker)
                picker = tracker.date_input(key=self.date_key(job))
                self.assertEqual(picker.label, "Date Applied")
                self.assertEqual(picker.value, expected)
                self.assertEqual(picker.proto.format, "YYYY-MM-DD")
                self.assertLessEqual(picker.min, date(1900, 1, 1))
                self.assertGreaterEqual(picker.max, date(2100, 12, 31))
                self.assertFalse(picker.is_range)
                self.assertEqual(self.disk_snapshot(), snapshot)

    def test_today_uses_local_date_at_each_click_and_keeps_all_form_drafts(self) -> None:
        settings = storage.load_settings()
        settings["custom_fields"] = [{
            "id": "notes", "label": "Custom notes", "type": "text",
            "active": True, "order": 1,
        }]
        storage.save_settings(settings)
        job = self.create_job(custom_fields={"notes": "stored custom"})
        snapshot = self.disk_snapshot()

        class LocalDate(date):
            today = Mock(return_value=date(2032, 12, 31))

        with (
            patch.object(self.app, "date", LocalDate),
            patch.object(self.app, "update_job", wraps=self.app.update_job) as save,
        ):
            tracker = self.details_app(job["id"])
            self.assert_no_exception(tracker)
            LocalDate.today.assert_not_called()
            drafts = {
                "Company *": "Draft Company",
                "Job Title *": "Draft Title",
                "Location": "Draft Location",
                "Job URL": "https://example.com/draft",
                "Email": "draft@example.com",
                "Account": "draft-login",
                "Password": "draft password",
                "Custom notes": "draft custom",
            }
            for label, value in drafts.items():
                self.by_label(tracker.text_input, label).set_value(value)
            self.by_label(tracker.button, "Today").click().run()
            self.assert_no_exception(tracker)
            self.assertEqual(tracker.date_input[0].value, date(2032, 12, 31))
            LocalDate.today.assert_called_once_with()
            for label, value in drafts.items():
                self.assertEqual(self.by_label(tracker.text_input, label).value, value)
            self.assertEqual(self.disk_snapshot(), snapshot)
            save.assert_not_called()

            # A rerun keeps the current draft and does not recalculate "today".
            LocalDate.today.return_value = date(2033, 1, 1)
            tracker.run()
            self.assert_no_exception(tracker)
            self.assertEqual(tracker.date_input[0].value, date(2032, 12, 31))
            LocalDate.today.assert_called_once_with()
            self.by_label(tracker.button, "Today").click().run()
            self.assert_no_exception(tracker)
            self.assertEqual(tracker.date_input[0].value, date(2033, 1, 1))
            self.assertEqual(LocalDate.today.call_count, 2)
            for label, value in drafts.items():
                self.assertEqual(self.by_label(tracker.text_input, label).value, value)
            self.assertEqual(self.disk_snapshot(), snapshot)
            save.assert_not_called()

    def test_today_then_another_date_saves_iso_only_with_save_and_reopens(self) -> None:
        job = self.create_job(applied_date="")
        snapshot = self.disk_snapshot()
        tracker = self.details_app(job["id"])
        with patch.object(self.app, "update_job", wraps=self.app.update_job) as save:
            self.by_label(tracker.button, "Today").click().run()
            self.assert_no_exception(tracker)
            self.assertEqual(tracker.date_input[0].value, date.today())
            tracker.date_input[0].set_value(date(2021, 7, 19)).run()
            self.assert_no_exception(tracker)
            self.assertEqual(tracker.date_input[0].value, date(2021, 7, 19))
            self.assertEqual(self.disk_snapshot(), snapshot)
            save.assert_not_called()
            self.by_label(tracker.button, "Save Changes").click().run()
            self.assert_no_exception(tracker)
            save.assert_called_once()
            self.assertEqual(save.call_args.args[1]["applied_date"], "2021-07-19")
        saved = storage.get_job_by_id(job["id"])
        self.assertEqual(saved["applied_date"], "2021-07-19")
        self.assertIsInstance(saved["applied_date"], str)
        reopened = self.details_app(job["id"])
        self.assert_no_exception(reopened)
        self.assertEqual(reopened.date_input[0].value, date(2021, 7, 19))

    def test_clearing_date_only_persists_empty_string_after_save(self) -> None:
        job = self.create_job()
        snapshot = self.disk_snapshot()
        tracker = self.details_app(job["id"])
        tracker.date_input[0].set_value(None).run()
        self.assert_no_exception(tracker)
        self.assertIsNone(tracker.date_input[0].value)
        self.assertEqual(self.disk_snapshot(), snapshot)
        self.by_label(tracker.button, "Save Changes").click().run()
        self.assert_no_exception(tracker)
        self.assertEqual(storage.get_job_by_id(job["id"])["applied_date"], "")
        reopened = self.details_app(job["id"])
        self.assert_no_exception(reopened)
        self.assertIsNone(reopened.date_input[0].value)

    def test_rerun_preserves_selection_and_job_switches_do_not_mix_dates(self) -> None:
        first = self.create_job()
        second = self.create_job(applied_date="")
        third = self.create_job(applied_date="2018-06-03")
        snapshot = self.disk_snapshot()
        tracker = self.details_app(first["id"])
        tracker.date_input[0].set_value(date(2035, 11, 5)).run()
        tracker.run()
        self.assert_no_exception(tracker)
        self.assertEqual(tracker.date_input(key=self.date_key(first)).value, date(2035, 11, 5))
        self.assertEqual(self.disk_snapshot(), snapshot)

        tracker.session_state["test_job_id"] = second["id"]
        tracker.run()
        self.assert_no_exception(tracker)
        self.assertIsNone(tracker.date_input(key=self.date_key(second)).value)
        self.by_label(tracker.button, "Today").click().run()
        self.assert_no_exception(tracker)
        tracker.session_state["test_job_id"] = third["id"]
        tracker.run()
        self.assert_no_exception(tracker)
        self.assertEqual(tracker.date_input(key=self.date_key(third)).value, date(2018, 6, 3))
        self.assertEqual(self.disk_snapshot(), snapshot)

    def test_today_is_a_form_submit_with_enter_submission_disabled(self) -> None:
        job = self.create_job()
        tracker = self.details_app(job["id"])
        self.assert_no_exception(tracker)
        form = tracker.get("form")[0]
        self.assertFalse(form.proto.form.enter_to_submit)
        today = self.by_label(tracker.button, "Today")
        save = self.by_label(tracker.button, "Save Changes")
        self.assertTrue(today.proto.is_form_submitter)
        self.assertEqual(today.proto.form_id, tracker.date_input[0].form_id)
        self.assertEqual(save.proto.form_id, today.proto.form_id)

    def test_dashboard_iso_display_sorting_and_add_job_input_remain_unchanged(self) -> None:
        older = self.create_job(company="Older", applied_date="2009-03-04")
        empty = self.create_job(company="Empty", applied_date="")
        newest = self.create_job(company="Newest", applied_date="2026-01-09")
        tracker = self.details_app(older["id"])
        tracker.date_input[0].set_value(date(2020, 8, 1)).run()
        self.by_label(tracker.button, "Save Changes").click().run()
        self.assert_no_exception(tracker)

        dashboard = AppTest.from_string("import app\napp.main()", default_timeout=10).run()
        self.assert_no_exception(dashboard)
        self.assertEqual(
            dashboard.session_state["dashboard_visible_job_ids"],
            [newest["id"], older["id"], empty["id"]],
        )
        frame = dashboard.dataframe[0].value
        self.assertEqual(frame["Date Applied"].tolist(), ["2026-01-09", "2020-08-01", ""])
        self.assertEqual(frame["Company"].tolist(), ["Newest", "Older", "Empty"])

        add_job = AppTest.from_string("import app\napp.main()", default_timeout=10)
        add_job.session_state["page"] = "new_job"
        add_job.run()
        self.assert_no_exception(add_job)
        self.assertEqual(self.by_label(add_job.text_input, "Date Applied").value, "")
        self.assertEqual(len(add_job.date_input), 0)


if __name__ == "__main__":
    unittest.main()
