"""Dashboard filter regressions using AppTest and isolated temporary data.

ButtonColumn events are supplied to the existing callback in a testing wrapper;
these tests do not claim to exercise browser clicks or visual alignment.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid

import storage

try:
    from streamlit.testing.v1 import AppTest
except ImportError:
    AppTest = None


@unittest.skipIf(AppTest is None, "Run with .venv/bin/python for Streamlit AppTest")
class DashboardRejectedTests(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name) / "tracker"
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
        settings = storage.load_settings()
        settings["statuses"].extend([
            {"id": "resume_failed", "label": "履歷未通過", "summary_group": "rejected", "active": True, "order": 90},
            {"id": "interview_failed", "label": "面試未通過", "summary_group": "rejected", "active": False, "order": 100},
        ])
        storage.save_settings(settings)
        specifications = [
            ("pending", "applied", "Alpha", "New York", "2024-01-02", False),
            ("rejected", "rejected", "Alpha", "New York", "2024-01-05", False),
            ("offer", "offer", "Beta", "Seattle", "2024-01-03", False),
            ("custom", "resume_failed", "Alpha", "New York", "2024-01-04", False),
            ("inactive", "interview_failed", "Gamma", "Boston", "2024-01-06", False),
            ("archived_rejected", "rejected", "Archive", "Boston", "2024-01-07", True),
            ("archived_pending", "applied", "Archive", "Boston", "2024-01-08", True),
            ("unknown", "unknown_status", "Delta", "Austin", "", False),
            ("missing", None, "Echo", "Austin", "legacy-invalid-date", False),
        ]
        self.jobs = []
        self.ids = {}
        for name, status, company, location, applied_date, archived in specifications:
            job_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"tracker-test/{name}"))
            self.ids[name] = job_id
            job = {
                "id": job_id, "status_id": status, "company": company,
                "job_title": f"Analyst {name}", "location": location,
                "applied_date": applied_date, "archived": archived,
                "account": f"account-{name}", "password": f"secret-{name}",
                "custom_fields": {},
            }
            if status is None:
                del job["status_id"]
            self.jobs.append(job)
        # Write only temporary fixture data, retaining a genuinely missing
        # status and legacy date so the normal application load path handles it.
        storage.JOBS_FILE.write_text(
            json.dumps({"schema_version": 1, "jobs": self.jobs}), encoding="utf-8"
        )
        self.app_path = Path(__file__).with_name("app.py")

    def app(self):
        script = f'''
import runpy
import streamlit as st
app = runpy.run_path({str(self.app_path)!r}, run_name="dashboard_test")
if st.session_state.pop("test_open_event", False):
    app["_handle_dashboard_open"]()
app["main"]()
'''
        tracker = AppTest.from_string(script, default_timeout=10).run()
        self.assert_no_exception(tracker)
        return tracker

    def assert_no_exception(self, tracker) -> None:
        self.assertEqual([error.message for error in tracker.exception], [])

    def snapshot(self):
        return {
            str(path.relative_to(self.root)): (path.read_bytes(), path.stat().st_mtime_ns)
            for path in self.root.rglob("*") if path.is_file()
        }

    @staticmethod
    def metrics(tracker):
        return {metric.label: metric.value for metric in tracker.metric}

    def assert_rows(self, tracker, names) -> None:
        self.assert_no_exception(tracker)
        self.assertEqual(
            tracker.session_state["dashboard_visible_job_ids"],
            [self.ids[name] for name in names],
        )
        self.assertEqual(len(tracker.dataframe), bool(names))
        if names:
            frame = tracker.dataframe[0].value
            self.assertEqual(frame["Job Title"].tolist(), [f"Analyst {name}" for name in names])
            self.assertEqual(frame["Open"].tolist(), ["Open"] * len(names))
            self.assertEqual(frame.index.tolist(), list(range(len(names))))

    @staticmethod
    def ancestor_blocks(block, target, ancestors=()):
        if block is target:
            return ancestors
        for child in getattr(block, "children", {}).values():
            found = DashboardRejectedTests.ancestor_blocks(child, target, (*ancestors, block))
            if found is not None:
                return found
        return None

    def test_default_toggle_group_filter_counts_and_existing_toggle_defaults(self) -> None:
        tracker = self.app()
        self.assertEqual([item.label for item in tracker.toggle], [
            "Show archived jobs", "Reveal passwords", "Show rejected", "Show saved jobs",
        ])
        self.assertTrue(all(item.value is False for item in tracker.toggle))
        # All four native toggles occupy sibling columns in the same row.
        ancestors = [self.ancestor_blocks(tracker.main, item) for item in tracker.toggle]
        self.assertTrue(all(path[-1].type == "column" for path in ancestors))
        self.assertTrue(all(path[-2] is ancestors[0][-2] for path in ancestors))
        visible = ["offer", "pending", "unknown", "missing"]
        self.assert_rows(tracker, visible)
        counts = {"Offers": "1", "Rejected": "3", "Pending": "3"}
        self.assertEqual(self.metrics(tracker), counts)
        tracker.toggle(key="dashboard_show_rejected").set_value(True).run()
        self.assert_rows(tracker, ["inactive", "rejected", "custom", *visible])
        self.assertEqual(self.metrics(tracker), counts)
        tracker.toggle(key="dashboard_show_rejected").set_value(False).run()
        self.assert_rows(tracker, visible)
        self.assertEqual(self.metrics(tracker), counts)

    def test_status_group_not_id_or_display_name_controls_rejection(self) -> None:
        settings = storage.load_settings()
        for status in settings["statuses"]:
            if status["id"] == "rejected":
                status["summary_group"] = "pending"
            elif status["id"] == "applied":
                status["label"] = "Rejected"
        storage.save_settings(settings)
        tracker = self.app()
        # The built-in rejected ID and a pending status named Rejected remain
        # visible; both custom rejected group statuses, including inactive, hide.
        self.assert_rows(tracker, ["rejected", "offer", "pending", "unknown", "missing"])
        self.assertEqual(self.metrics(tracker)["Rejected"], "2")

    def test_archived_rejected_requires_both_toggles_and_counts_ignore_archived(self) -> None:
        tracker = self.app()
        counts = self.metrics(tracker)
        combinations = [
            (True, False, ["archived_pending", "offer", "pending", "unknown", "missing"]),
            (True, True, ["archived_pending", "archived_rejected", "inactive", "rejected", "custom", "offer", "pending", "unknown", "missing"]),
            (False, True, ["inactive", "rejected", "custom", "offer", "pending", "unknown", "missing"]),
            (False, False, ["offer", "pending", "unknown", "missing"]),
        ]
        for archived, rejected, expected in combinations:
            with self.subTest(archived=archived, rejected=rejected):
                tracker.toggle(key="dashboard_show_archived").set_value(archived)
                tracker.toggle(key="dashboard_show_rejected").set_value(rejected).run()
                self.assert_rows(tracker, expected)
                self.assertEqual(self.metrics(tracker), counts)

    def test_existing_filters_and_search_are_preserved_when_toggling(self) -> None:
        tracker = self.app()
        tracker.text_input(key="dashboard_keyword").set_value("  aNaLYst  ")
        selections = {
            "dashboard_status_filter": ["applied", "resume_failed"],
            "dashboard_company_filter": ["Alpha"],
            "dashboard_location_filter": ["New York"],
        }
        for key, value in selections.items():
            tracker.multiselect(key=key).set_value(value)
        tracker.run()
        for rejected, expected in [(False, ["pending"]), (True, ["custom", "pending"]), (False, ["pending"])]:
            tracker.toggle(key="dashboard_show_rejected").set_value(rejected).run()
            self.assert_rows(tracker, expected)
            self.assertEqual(tracker.text_input(key="dashboard_keyword").value, "  aNaLYst  ")
            for key, value in selections.items():
                self.assertEqual(tracker.multiselect(key=key).value, value)
        # Searching account text continues to combine with all three filters.
        tracker.text_input(key="dashboard_keyword").set_value("account-custom")
        tracker.toggle(key="dashboard_show_rejected").set_value(True).run()
        self.assert_rows(tracker, ["custom"])

    def test_rejected_only_selection_empty_state_and_stale_open_mapping(self) -> None:
        tracker = self.app()
        tracker.multiselect(key="dashboard_status_filter").set_value(["rejected"]).run()
        self.assert_rows(tracker, [])
        self.assertFalse(tracker.toggle(key="dashboard_show_rejected").value)
        messages = [item.value for item in [*tracker.info, *tracker.caption]]
        self.assertTrue(any("No jobs match the current filters." in value for value in messages))
        self.assertTrue(any('Turn on "Show rejected"' in value for value in messages))
        self.assertEqual(len(tracker.metric), 3)
        self.assertEqual(len(tracker.toggle), 4)
        self.assertEqual(len(tracker.multiselect), 3)
        self.assertEqual(len(tracker.text_input), 1)
        tracker.session_state["dashboard_open_click"] = {"row": 0}
        tracker.session_state["test_open_event"] = True
        tracker.run()
        self.assertEqual(tracker.session_state["page"], "dashboard")
        self.assert_rows(tracker, [])
        tracker.toggle(key="dashboard_show_rejected").set_value(True).run()
        self.assert_rows(tracker, ["rejected"])
        tracker.toggle(key="dashboard_show_rejected").set_value(False).run()
        self.assert_rows(tracker, [])
        self.assertEqual(tracker.multiselect(key="dashboard_status_filter").value, ["rejected"])
        tracker.text_input(key="dashboard_keyword").set_value("does not exist").run()
        self.assert_rows(tracker, [])
        self.assertFalse(any('Turn on "Show rejected"' in item.value for item in [*tracker.info, *tracker.caption]))

    def test_every_sorted_open_row_after_toggles_and_navigation_persistence(self) -> None:
        tracker = self.app()
        for rejected, names in [
            (True, ["inactive", "rejected", "custom", "offer", "pending", "unknown", "missing"]),
            (False, ["offer", "pending", "unknown", "missing"]),
        ]:
            tracker.toggle(key="dashboard_show_rejected").set_value(rejected).run()
            self.assert_rows(tracker, names)
            for row, name in enumerate(names):
                with self.subTest(rejected=rejected, row=row, job=name):
                    # AppTest has no native dataframe ButtonColumn click API.
                    # Feed its event shape into the production Open callback.
                    tracker.session_state["dashboard_open_click"] = {"row": row}
                    tracker.session_state["test_open_event"] = True
                    tracker.run()
                    self.assert_no_exception(tracker)
                    self.assertEqual(tracker.session_state["page"], "job_detail")
                    self.assertEqual(tracker.session_state["selected_job_id"], self.ids[name])
                    self.assertNotIn("dashboard_show_rejected", tracker.session_state)
                    self.assertEqual(tracker.session_state["dashboard_show_rejected_preference"], rejected)
                    tracker.button(key=f"detail_back_{self.ids[name]}").click().run()
                    self.assertEqual(tracker.toggle(key="dashboard_show_rejected").value, rejected)
                    self.assert_rows(tracker, names)

    def test_passwords_reruns_new_session_and_no_data_writes(self) -> None:
        before = self.snapshot()
        tracker = self.app()
        self.assertEqual(self.snapshot(), before)
        for show_passwords, show_rejected in [(True, False), (True, True), (False, True), (False, False)]:
            tracker.toggle(key="dashboard_show_passwords").set_value(show_passwords)
            tracker.toggle(key="dashboard_show_rejected").set_value(show_rejected).run()
            tracker.run()
            self.assert_no_exception(tracker)
            self.assertEqual(tracker.toggle(key="dashboard_show_passwords").value, show_passwords)
            self.assertEqual(tracker.toggle(key="dashboard_show_rejected").value, show_rejected)
            frame = tracker.dataframe[0].value
            for _, row in frame.iterrows():
                name = row["Job Title"].removeprefix("Analyst ")
                self.assertEqual(row["Password"], f"secret-{name}" if show_passwords else "••••••••")
            self.assertEqual(self.snapshot(), before)
        tracker.toggle(key="dashboard_show_rejected").set_value(True).run()
        fresh = self.app()
        self.assertFalse(fresh.toggle(key="dashboard_show_rejected").value)
        self.assertEqual(self.snapshot(), before)

    def test_render_preserves_original_job_list_and_handles_all_rejected(self) -> None:
        tracker = AppTest.from_string(f'''
import runpy
import streamlit as st
app = runpy.run_path({str(self.app_path)!r}, run_name="dashboard_source_test")
app["_render_dashboard"](st.session_state["test_jobs"], st.session_state["test_settings"])
''', default_timeout=10)
        rejected_jobs = [job for job in self.jobs if job.get("status_id") in {"rejected", "resume_failed", "interview_failed"} and not job["archived"]]
        original = copy.deepcopy(rejected_jobs)
        tracker.session_state["test_jobs"] = rejected_jobs
        tracker.session_state["test_settings"] = storage.load_settings()
        tracker.run()
        self.assert_rows(tracker, [])
        self.assertEqual(self.metrics(tracker), {"Offers": "0", "Rejected": "3", "Pending": "0"})
        for value, expected in [(True, ["inactive", "rejected", "custom"]), (False, [])]:
            tracker.toggle(key="dashboard_show_rejected").set_value(value).run()
            self.assert_rows(tracker, expected)
            self.assertEqual(tracker.session_state["test_jobs"], original)
            self.assertEqual(rejected_jobs, original)
            self.assertEqual(self.metrics(tracker)["Rejected"], "3")


if __name__ == "__main__":
    unittest.main()
