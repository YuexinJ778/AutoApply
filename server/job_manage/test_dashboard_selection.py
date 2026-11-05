"""Dashboard selection/delete regressions using only temporary fixture storage.

AppTest cannot click native dataframe row checkboxes or ButtonColumn cells.
The wrapper supplies their documented event shapes to production callbacks;
these tests do not claim to exercise browser interactions or client sorting.
"""

from __future__ import annotations

import csv
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid

from calendar_utils import build_calendar_events
import storage

try:
    import streamlit as st
    from streamlit.testing.v1 import AppTest
except ImportError:
    AppTest = None


@unittest.skipIf(AppTest is None, "Run with .venv/bin/python for Streamlit AppTest")
class DashboardSelectionTests(unittest.TestCase):
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
        storage.ensure_storage()
        self.jobs = []
        self.ids = {}
        for index in range(23):
            name = f"visible-{index:02d}" if index < 20 else ("archived", "rejected", "saved")[index - 20]
            job_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"dashboard-selection/{name}"))
            self.ids[name] = job_id
            self.jobs.append({
                "id": job_id,
                "company": "Alpha" if index % 2 == 0 else "Beta",
                "job_title": f"Engineer {name}",
                "location": "Taipei" if index % 2 == 0 else "Seattle",
                "status_id": "rejected" if index == 21 else "planning" if index == 22 else "applied" if index % 2 == 0 else "interviewing",
                "applied_date": f"2026-09-{index + 1:02d}",
                "archived": index == 20,
                "account": f"account-{name}",
                "password": f"secret-{name}",
                "custom_fields": {},
            })
        self.write_jobs()
        self.attachments = {}
        for job in self.jobs:
            job_id = job["id"]
            attachment = storage.add_attachments(job_id, [("evidence.txt", f"attachment:{job_id}".encode())])[0]
            self.attachments[job_id] = attachment["id"]
            (storage.get_job_directory(job_id) / "notes.md").write_text(f"Notes: {job_id}", encoding="utf-8")
        # Companies are independent of job selection/deletion. Preserve any
        # existing company storage even in checkouts without a Companies UI.
        self.companies = storage.DATA_DIR / "companies.json"
        self.companies.write_text('{"companies":[{"name":"Alpha"},{"name":"Beta"}]}', encoding="utf-8")
        self.backup = storage.BACKUPS_DIR / "existing-snapshot.json"
        self.backup.write_text('{"backup":"keep unchanged"}', encoding="utf-8")
        self.app_path = Path(__file__).with_name("app.py")
        downloads = patch.object(st, "download_button", wraps=st.download_button)
        self.download_widget = downloads.start()
        self.addCleanup(downloads.stop)

    def write_jobs(self) -> None:
        storage.JOBS_FILE.write_text(json.dumps({"schema_version": 1, "jobs": self.jobs}), encoding="utf-8")

    def app(self):
        tracker = AppTest.from_string(f'''
import runpy
import streamlit as st
app = runpy.run_path({str(self.app_path)!r}, run_name="dashboard_selection_test")
if "test_selection_rows" in st.session_state:
    rows = st.session_state.pop("test_selection_rows")
    st.session_state["dashboard_jobs_table"] = {{"selection": {{"rows": rows, "columns": [], "cells": []}}}}
    app["_handle_dashboard_selection"]()
if st.session_state.pop("test_open_event", False):
    app["_handle_dashboard_open"]()
app["main"]()
''', default_timeout=15).run()
        self.assert_no_exception(tracker)
        self.assertEqual(len(self.visible_ids(tracker)), 20)
        return tracker

    def assert_no_exception(self, tracker) -> None:
        self.assertEqual([error.message for error in tracker.exception], [])

    @staticmethod
    def visible_ids(tracker):
        return tracker.session_state["dashboard_visible_job_ids"]

    @staticmethod
    def selected_ids(tracker):
        return tracker.session_state["selected_job_ids"]

    def select(self, tracker, rows):
        tracker.session_state["test_selection_rows"] = rows
        tracker.run()
        self.assert_no_exception(tracker)
        return tracker

    def assert_selection(self, tracker, ids) -> None:
        self.assert_no_exception(tracker)
        self.assertEqual(set(self.selected_ids(tracker)), set(ids))
        self.assertEqual(len(self.selected_ids(tracker)), len(ids))
        visible_ids = self.visible_ids(tracker)
        state = tracker.session_state["dashboard_jobs_table"]
        self.assertEqual(state["selection"]["rows"], [row for row, job_id in enumerate(visible_ids) if job_id in ids])
        self.assertEqual(tracker.button(key="dashboard_delete_selected").label, f"Delete selected ({len(ids)})")
        self.assertEqual(tracker.button(key="dashboard_delete_selected").disabled, not bool(ids))
        self.assertIn(f"Showing {len(visible_ids)} jobs · {len(ids)} selected", [caption.value for caption in tracker.caption])

    def snapshot(self, directory=None):
        directory = directory or self.root
        return {str(path.relative_to(directory)): (path.read_bytes(), path.stat().st_mtime_ns)
                for path in directory.rglob("*") if path.is_file()}

    def persisted_ids(self):
        return {job["id"] for job in storage.load_jobs()["jobs"]}

    def begin_delete(self, tracker, ids):
        tracker.button(key="dashboard_delete_selected").click().run()
        self.assert_no_exception(tracker)
        self.assertEqual(set(tracker.session_state["dashboard_pending_delete_ids"]), set(ids))
        self.assertFalse(tracker.checkbox(key="dashboard_confirm_delete").value)
        self.assertTrue(tracker.button(key="dashboard_execute_delete").disabled)
        confirmation_rows = [item.value for item in tracker.text if any(job_id in item.value for job_id in self.ids.values())]
        self.assertEqual(len(confirmation_rows), len(ids))
        self.assertTrue(all(any(job_id in row for row in confirmation_rows) for job_id in ids))

    def confirm_delete(self, tracker):
        tracker.checkbox(key="dashboard_confirm_delete").check().run()
        tracker.button(key="dashboard_execute_delete").click().run()
        self.assert_no_exception(tracker)
        self.assertFalse(tracker.session_state.filtered_state.get("dashboard_pending_delete_ids", []))

    def test_select_three_deletes_only_three_and_preserves_other_data_and_calendar(self):
        tracker = self.app()
        visible = self.visible_ids(tracker)
        selected = [visible[index] for index in (0, 7, 19)]
        survivors = self.persisted_ids() - set(selected)
        original_records = {job["id"]: job for job in storage.load_jobs()["jobs"]}
        remaining_folders = {job_id: self.snapshot(storage.get_job_directory(job_id)) for job_id in survivors}
        unrelated = {path: (path.read_bytes(), path.stat().st_mtime_ns) for path in (self.companies, self.backup, storage.SETTINGS_FILE)}
        self.select(tracker, [0, 7, 19])
        self.assert_selection(tracker, selected)
        self.assertEqual(tracker.session_state["page"], "dashboard")
        self.begin_delete(tracker, selected)
        self.confirm_delete(tracker)
        self.assertEqual(self.persisted_ids(), survivors)
        self.assertEqual(set(self.visible_ids(tracker)), set(visible) - set(selected))
        self.assert_selection(tracker, [])
        for job_id in selected:
            self.assertFalse(storage.get_job_directory(job_id).exists())
        for job_id in survivors:
            self.assertEqual(storage.get_job_by_id(job_id), original_records[job_id])
            self.assertEqual(self.snapshot(storage.get_job_directory(job_id)), remaining_folders[job_id])
            self.assertEqual(storage.load_attachment(job_id, self.attachments[job_id]), f"attachment:{job_id}".encode())
        for path, value in unrelated.items():
            self.assertEqual((path.read_bytes(), path.stat().st_mtime_ns), value)
        orphan_reminders = {job_id: [{"id": "orphan", "title": "Interview", "kind": "interview", "start_at": "2026-10-06T14:00:00Z", "timezone": "UTC", "status": "scheduled"}] for job_id in selected}
        events, issues = build_calendar_events(storage.load_jobs()["jobs"], orphan_reminders)
        self.assertEqual(issues, [])
        self.assertEqual({event["extendedProps"]["job_id"] for event in events}, survivors)
        self.assertTrue(any("3" in item.value and "delet" in item.value.lower() for item in tracker.success))
        after = self.snapshot()
        tracker.run()
        self.assertEqual(self.snapshot(), after, "Ordinary rerun must not repeat deletion")

    def test_select_all_twenty_then_deselect_two_deletes_eighteen(self):
        tracker = self.app()
        visible = self.visible_ids(tracker)
        before = self.snapshot()
        tracker.button(key="dashboard_select_all").click().run()
        self.assert_selection(tracker, visible)
        self.assertEqual(self.snapshot(), before, "Select all changes session state only")
        self.assertTrue(set(self.ids[name] for name in ("archived", "rejected", "saved")).isdisjoint(self.selected_ids(tracker)))
        self.select(tracker, list(range(2, 20)))
        self.assert_selection(tracker, visible[2:])
        self.begin_delete(tracker, visible[2:])
        self.confirm_delete(tracker)
        self.assertEqual(self.persisted_ids(), {self.ids[name] for name in ("archived", "rejected", "saved")} | set(visible[:2]))
        self.assertEqual(self.visible_ids(tracker), visible[:2])

    def test_clear_selection_disables_delete_and_never_writes_data(self):
        tracker = self.app()
        self.assert_selection(tracker, [])
        selection_buttons = [button.label for button in tracker.button if button.key in {
            "dashboard_select_all", "dashboard_delete_selected", "dashboard_clear_selection",
        }]
        self.assertEqual(selection_buttons, ["Select all", "Delete selected (0)", "Clear selection"])
        before = self.snapshot()
        tracker.button(key="dashboard_select_all").click().run()
        tracker.button(key="dashboard_clear_selection").click().run()
        self.assert_selection(tracker, [])
        self.assertEqual(self.snapshot(), before)
        self.assertFalse(any("Delete filtered jobs" in button.label for button in tracker.button))

    def test_each_scope_filter_clears_selection_and_pending_confirmation(self):
        cases = [
            ("text_input", "dashboard_keyword", "visible-01"),
            ("multiselect", "dashboard_status_filter", ["applied"]),
            ("multiselect", "dashboard_company_filter", ["Alpha"]),
            ("multiselect", "dashboard_location_filter", ["Taipei"]),
            ("toggle", "dashboard_show_archived", True),
            ("toggle", "dashboard_show_rejected", True),
            ("toggle", "dashboard_show_saved", True),
        ]
        before = self.snapshot()
        for kind, key, value in cases:
            with self.subTest(filter=key):
                tracker = self.app()
                self.select(tracker, [0, 1])
                self.begin_delete(tracker, self.visible_ids(tracker)[:2])
                getattr(tracker, kind)(key=key).set_value(value).run()
                self.assert_selection(tracker, [])
                self.assertFalse(tracker.session_state.filtered_state.get("dashboard_pending_delete_ids", []))
                self.assertEqual(len([button for button in tracker.button if button.key == "dashboard_execute_delete"]), 0)
                self.assertEqual(self.snapshot(), before)

    def test_select_all_uses_combined_search_status_company_location_and_toggles(self):
        tracker = self.app()
        tracker.toggle(key="dashboard_show_archived").set_value(True)
        tracker.toggle(key="dashboard_show_rejected").set_value(True)
        tracker.toggle(key="dashboard_show_saved").set_value(True)
        tracker.text_input(key="dashboard_keyword").set_value("Engineer visible")
        tracker.multiselect(key="dashboard_status_filter").set_value(["applied"])
        tracker.multiselect(key="dashboard_company_filter").set_value(["Alpha"])
        tracker.multiselect(key="dashboard_location_filter").set_value(["Taipei"]).run()
        expected = [self.ids[f"visible-{index:02d}"] for index in reversed(range(0, 20, 2))]
        self.assertEqual(self.visible_ids(tracker), expected)
        tracker.button(key="dashboard_select_all").click().run()
        self.assert_selection(tracker, expected)
        self.begin_delete(tracker, expected)
        self.confirm_delete(tracker)
        self.assert_selection(tracker, [])
        self.assertEqual(self.visible_ids(tracker), [])
        self.assertEqual(tracker.text_input(key="dashboard_keyword").value, "Engineer visible")
        for key, expected_value in (
            ("dashboard_status_filter", ["applied"]),
            ("dashboard_company_filter", ["Alpha"]),
            ("dashboard_location_filter", ["Taipei"]),
        ):
            self.assertEqual(tracker.multiselect(key=key).value, expected_value)
        for key in ("dashboard_show_archived", "dashboard_show_rejected", "dashboard_show_saved"):
            self.assertTrue(tracker.toggle(key=key).value)

    def test_ordinary_rerun_passwords_and_export_format_preserve_selection(self):
        tracker = self.app()
        selected = self.visible_ids(tracker)[:3]
        before = self.snapshot()
        self.select(tracker, [0, 1, 2])
        tracker.run()
        self.assert_selection(tracker, selected)
        tracker.toggle(key="dashboard_show_passwords").set_value(True).run()
        self.assert_selection(tracker, selected)
        tracker.selectbox(key="dashboard_export_format").set_value("JSON").run()
        self.assert_selection(tracker, selected)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.selected_ids(self.app()), [])

    def test_reordered_source_and_date_sort_preserve_uuid_selection_and_open_mapping(self):
        tracker = self.app()
        original_visible = self.visible_ids(tracker)
        self.assertNotEqual(original_visible[0], self.jobs[0]["id"])
        self.select(tracker, [0, 7, 19])
        selected = [original_visible[index] for index in (0, 7, 19)]
        self.jobs.reverse()
        next(job for job in self.jobs if job["id"] == original_visible[19])["applied_date"] = "2026-10-01"
        self.write_jobs()
        tracker.run()
        self.assert_selection(tracker, selected)
        self.assertEqual(self.visible_ids(tracker)[0], original_visible[19])
        row = 3
        expected_open = self.visible_ids(tracker)[row]
        before_records = storage.JOBS_FILE.read_bytes()
        tracker.session_state["dashboard_open_click"] = {"row": row}
        tracker.session_state["test_open_event"] = True
        tracker.run()
        self.assert_no_exception(tracker)
        self.assertEqual(tracker.session_state["page"], "job_detail")
        self.assertEqual(tracker.session_state["selected_job_id"], expected_open)
        self.assertEqual(set(self.selected_ids(tracker)), set(selected))
        self.assertEqual(storage.JOBS_FILE.read_bytes(), before_records)
        for job_id, attachment_id in self.attachments.items():
            self.assertEqual(storage.load_attachment(job_id, attachment_id), f"attachment:{job_id}".encode())

    def test_empty_results_disable_delete_and_do_not_keep_stale_targets(self):
        tracker = self.app()
        self.select(tracker, [0, 1, 2])
        self.begin_delete(tracker, self.visible_ids(tracker)[:3])
        before = self.snapshot()
        tracker.text_input(key="dashboard_keyword").set_value("no matching fixture").run()
        self.assertEqual(self.visible_ids(tracker), [])
        self.assert_selection(tracker, [])
        self.assertTrue(tracker.button(key="dashboard_select_all").disabled)
        self.assertFalse(tracker.session_state.filtered_state.get("dashboard_pending_delete_ids", []))
        self.assertEqual(self.snapshot(), before)

    def test_cancel_confirmation_preserves_records_and_files(self):
        tracker = self.app()
        selected = self.visible_ids(tracker)[:3]
        before = self.snapshot()
        self.select(tracker, [0, 1, 2])
        self.begin_delete(tracker, selected)
        tracker.button(key="dashboard_cancel_delete").click().run()
        self.assert_no_exception(tracker)
        self.assertFalse(tracker.session_state.filtered_state.get("dashboard_pending_delete_ids", []))
        self.assertEqual(self.snapshot(), before)

    def test_confirmation_keeps_frozen_uuid_targets_when_selection_changes(self):
        tracker = self.app()
        selected = self.visible_ids(tracker)[:3]
        all_ids = self.persisted_ids()
        self.select(tracker, [0, 1, 2])
        self.begin_delete(tracker, selected)
        self.select(tracker, [4])
        self.assertEqual(set(tracker.session_state["dashboard_pending_delete_ids"]), set(selected))
        self.confirm_delete(tracker)
        self.assertEqual(self.persisted_ids(), all_ids - set(selected))

    def test_partial_storage_failures_report_completed_deletes_and_incomplete_file_cleanup(self):
        tracker = self.app()
        selected = self.visible_ids(tracker)[:3]
        all_ids = self.persisted_ids()
        real_delete = storage.delete_job

        def failing_delete(job_id):
            if job_id == selected[1]:
                with patch.object(storage.shutil, "rmtree", side_effect=OSError("fixture folder failure")):
                    return real_delete(job_id)
            if job_id == selected[2]:
                raise OSError("fixture record failure")
            return real_delete(job_id)

        self.select(tracker, [0, 1, 2])
        self.begin_delete(tracker, selected)
        with patch.object(storage, "delete_job", side_effect=failing_delete) as delete_mock:
            self.confirm_delete(tracker)
            self.assertEqual([call.args[0] for call in delete_mock.call_args_list], selected)
            messages = "\n".join(item.value for item in tracker.warning)
            self.assertIn("Deleted 1 of 3 selected jobs", messages)
            self.assertIn(f"{selected[1]}: job record is absent; file cleanup did not complete", messages)
            self.assertIn(f"{selected[2]}: not deleted", messages)
            self.assertEqual(len(tracker.success), 0)
            tracker.run()
            self.assertEqual(delete_mock.call_count, 3, "Failures must not trigger automatic retries")
        self.assertEqual(self.persisted_ids(), all_ids - set(selected[:2]))
        self.assertFalse(storage.get_job_directory(selected[0]).exists())
        self.assertTrue(storage.get_job_directory(selected[1]).exists())
        self.assertTrue(storage.get_job_directory(selected[2]).exists())
        self.assert_selection(tracker, [selected[2]])

    def test_csv_json_export_all_twenty_filtered_rows_with_only_three_selected(self):
        tracker = self.app()
        selected = self.visible_ids(tracker)[:3]
        before = self.snapshot()
        self.select(tracker, [0, 1, 2])
        expected = tracker.dataframe[0].value.drop(columns="Open").to_dict(orient="records")
        for export_format in ("JSON", "CSV"):
            tracker.selectbox(key="dashboard_export_format").set_value(export_format).run()
            tracker.button(key="dashboard_prepare_export").click().run()
            self.assert_no_exception(tracker)
            calls = [call for call in self.download_widget.call_args_list if call.kwargs.get("key") == "dashboard_export_download"]
            payload = calls[-1].kwargs["data"]
            text = payload.decode("utf-8-sig") if isinstance(payload, bytes) else payload
            rows = json.loads(text) if export_format == "JSON" else list(csv.DictReader(io.StringIO(text)))
            self.assertEqual(rows, expected)
            self.assertEqual(len(rows), 20)
            self.assertNotIn("selected_job_ids", text)
            self.assertTrue(all("selection" not in column.casefold() for column in rows[0]))
            self.assert_selection(tracker, selected)
        self.assertEqual(self.snapshot(), before)


if __name__ == "__main__":
    unittest.main()
