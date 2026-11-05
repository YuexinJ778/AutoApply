"""Dashboard view/export regressions with temporary storage and Streamlit AppTest.

Download bytes are captured at the native download widget boundary. Browser
downloads and dataframe button clicks require separate browser verification.
"""

from __future__ import annotations

import copy
import csv
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid

import storage

try:
    import streamlit as st
    from streamlit.testing.v1 import AppTest
except ImportError:
    AppTest = None


@unittest.skipIf(AppTest is None, "Run with .venv/bin/python for Streamlit AppTest")
class DashboardExportTests(unittest.TestCase):
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
        settings["custom_fields"] = [
            {"id": "source_a", "label": "Source", "type": "text", "show_in_table": True, "order": 10},
            {"id": "source_b", "label": "Source", "type": "text", "show_in_table": True, "order": 20},
            {"id": "company_note", "label": "Company", "type": "text", "show_in_table": True, "order": 30},
            {"id": "code", "label": "Job Code", "type": "text", "show_in_table": True, "order": 40},
            {"id": "follow_up", "label": "Follow-up", "type": "date", "show_in_table": True, "order": 50},
            {"id": "remote", "label": "Remote", "type": "checkbox", "show_in_table": True, "order": 60},
            {"id": "private", "label": "Hidden custom", "type": "text", "show_in_table": False, "order": 70},
        ]
        storage.save_settings(settings)
        specifications = [
            ("saved", "planning", "Alpha", "Taipei", "2026-09-22", False),
            ("applied", "applied", "Alpha", "Taipei", "2026-09-21", False),
            ("interview", "interviewing", "Alpha", "Taipei", "2026-09-20", False),
            ("assessment", "online_assessment", "Alpha", "Taipei", "2026-09-19", False),
            ("offer", "offer", "Beta", "Boston", "2026-09-18", False),
            ("rejected", "rejected", "Alpha", "Taipei", "2026-09-23", False),
            ("archived_saved", "planning", "Alpha", "Taipei", "2026-09-25", True),
            ("archived_applied", "applied", "Alpha", "Taipei", "2026-09-24", True),
            ("undated", "applied", "Alpha", "Taipei", "", False),
        ]
        self.jobs = []
        self.ids = {}
        for name, status, company, location, applied, archived in specifications:
            job_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"dashboard-export/{name}"))
            self.ids[name] = job_id
            self.jobs.append({
                "id": job_id, "status_id": status, "company": company,
                "job_title": f"Engineer {name}", "location": location,
                "applied_date": applied, "archived": archived,
                "job_url": f"https://example.com/jobs/{name}?source=完整網址&ref=001",
                "account": "0000123", "password": f"private-password-{name}",
                "resume_path": f"/private/resumes/{name}.pdf",
                "email": "hidden-email@example.com",
                "custom_fields": {
                    "source_a": '中文, "推薦"\n第二行', "source_b": "Other source",
                    "company_note": "Displayed custom company", "code": "000009",
                    "follow_up": "2026-10-01", "remote": True,
                    "private": "hidden-custom-sentinel",
                },
            })
        self.write_jobs()
        downloads = patch.object(st, "download_button", wraps=st.download_button)
        self.download_widget = downloads.start()
        self.addCleanup(downloads.stop)
        self.app_path = Path(__file__).with_name("app.py")

    def write_jobs(self) -> None:
        storage.JOBS_FILE.write_text(
            json.dumps({"schema_version": 1, "jobs": self.jobs}, ensure_ascii=False), encoding="utf-8"
        )

    def app(self):
        tracker = AppTest.from_string(f'''
import runpy
import streamlit as st
app = runpy.run_path({str(self.app_path)!r}, run_name="dashboard_export_test")
if st.session_state.pop("test_open_event", False):
    app["_handle_dashboard_open"]()
app["main"]()
''', default_timeout=15).run()
        self.assert_no_exception(tracker)
        return tracker

    def assert_no_exception(self, tracker) -> None:
        self.assertEqual([error.message for error in tracker.exception], [])

    def snapshot(self) -> dict:
        return {
            str(path.relative_to(self.root)): (path.read_bytes(), path.stat().st_mtime_ns)
            for path in self.root.rglob("*") if path.is_file()
        }

    @staticmethod
    def metrics(tracker) -> dict:
        return {metric.label: metric.value for metric in tracker.metric}

    def assert_rows(self, tracker, names) -> None:
        self.assert_no_exception(tracker)
        self.assertEqual(tracker.session_state["dashboard_visible_job_ids"], [self.ids[name] for name in names])
        self.assertEqual(len(tracker.dataframe), bool(names))
        if names:
            frame = tracker.dataframe[0].value
            self.assertEqual(frame["Job Title"].tolist(), [f"Engineer {name}" for name in names])
            self.assertEqual(frame.index.tolist(), list(range(len(names))))

    def download(self) -> dict:
        calls = [{**call.kwargs, "label": call.args[0] if call.args else call.kwargs["label"]}
                 for call in self.download_widget.call_args_list
                 if call.kwargs.get("key") == "dashboard_export_download"]
        self.assertTrue(calls, "Dashboard must render a native download button")
        return calls[-1]

    @staticmethod
    def data_bytes(download: dict) -> bytes:
        data = download["data"]
        return data if isinstance(data, bytes) else data.encode("utf-8")

    def export(self, tracker, format: str):
        tracker.selectbox(key="dashboard_export_format").set_value(format).run()
        self.assert_no_exception(tracker)
        if len(tracker.dataframe):
            tracker.button(key="dashboard_prepare_export").click().run()
            self.assert_no_exception(tracker)
        download = self.download()
        payload = self.data_bytes(download)
        self.assertRegex(download["file_name"], rf"^jobs_filtered_\d{{8}}_\d{{6}}\.{format.lower()}$")
        if format == "CSV":
            self.assertEqual(download["mime"], "text/csv")
            self.assertTrue(payload.startswith(b"\xef\xbb\xbf"))
            reader = csv.DictReader(io.StringIO(payload.decode("utf-8-sig"), newline=""))
            return list(reader), reader.fieldnames, payload
        self.assertEqual(download["mime"], "application/json")
        text = payload.decode("utf-8")
        rows = json.loads(text, parse_constant=lambda value: self.fail(f"Illegal JSON constant {value}"))
        self.assertIsInstance(rows, list)
        if rows:
            self.assertIn('\n  {\n    "', text)
        return rows, list(rows[0]) if rows else [], payload

    def assert_table_export(self, tracker, format: str):
        rows, columns, payload = self.export(tracker, format)
        frame = tracker.dataframe[0].value.drop(columns="Open")
        expected = frame.to_dict(orient="records")
        if format == "CSV":
            expected = [{key: str(value) if value is not None else "" for key, value in row.items()} for row in expected]
        self.assertEqual(columns, list(frame.columns))
        self.assertEqual(rows, expected)
        self.assertIn(f"{len(rows)} jobs", self.download()["label"])
        self.assertFalse(self.download().get("disabled", False))
        return rows, payload

    def test_saved_default_pending_statuses_dates_counts_and_session_defaults(self) -> None:
        before = self.snapshot()
        tracker = self.app()
        self.assertEqual([item.label for item in tracker.toggle], [
            "Show archived jobs", "Reveal passwords", "Show rejected", "Show saved jobs",
        ])
        self.assertTrue(all(item.value is False for item in tracker.toggle))
        self.assertEqual(tracker.selectbox(key="dashboard_export_format").value, "CSV")
        visible = ["applied", "interview", "assessment", "offer", "undated"]
        self.assert_rows(tracker, visible)
        self.assertEqual(self.metrics(tracker), {"Offers": "1", "Rejected": "1", "Pending": "5"})
        tracker.toggle(key="dashboard_show_saved").set_value(True).run()
        tracker.run()
        self.assert_rows(tracker, ["saved", *visible])
        self.assertEqual(self.metrics(tracker), {"Offers": "1", "Rejected": "1", "Pending": "5"})
        self.assertFalse(self.app().toggle(key="dashboard_show_saved").value)
        self.assertEqual(self.snapshot(), before)

    def test_saved_uses_status_id_and_applied_transition(self) -> None:
        settings = storage.load_settings()
        for status in settings["statuses"]:
            if status["id"] == "planning":
                status["label"] = "Renamed status"
            elif status["id"] == "applied":
                status["label"] = "Saved 已收藏"
        storage.save_settings(settings)
        tracker = self.app()
        visible = ["applied", "interview", "assessment", "offer", "undated"]
        self.assert_rows(tracker, visible)
        self.jobs[0]["status_id"] = "applied"
        self.write_jobs()
        before = self.snapshot()
        tracker.run()
        self.assert_rows(tracker, ["saved", *visible])
        self.assertFalse(tracker.toggle(key="dashboard_show_saved").value)
        self.assertEqual(self.snapshot(), before)

    def test_saved_archived_rejected_intersection_and_export(self) -> None:
        tracker = self.app()
        metrics = self.metrics(tracker)
        visible = ["applied", "interview", "assessment", "offer", "undated"]
        for archived, saved, expected in [
            (False, False, visible),
            (True, False, ["archived_applied", *visible]),
            (False, True, ["saved", *visible]),
            (True, True, ["archived_saved", "archived_applied", "saved", *visible]),
        ]:
            with self.subTest(archived=archived, saved=saved):
                tracker.toggle(key="dashboard_show_archived").set_value(archived)
                tracker.toggle(key="dashboard_show_saved").set_value(saved).run()
                self.assert_rows(tracker, expected)
                self.assert_table_export(tracker, "JSON")
                self.assertEqual(self.metrics(tracker), metrics)
        tracker.toggle(key="dashboard_show_rejected").set_value(True).run()
        self.assert_rows(tracker, ["archived_saved", "archived_applied", "rejected", "saved", *visible])
        self.assert_table_export(tracker, "CSV")

    def test_all_filters_export_updates_and_saved_only_remains_hidden(self) -> None:
        tracker = self.app()
        tracker.toggle(key="dashboard_show_saved").set_value(True)
        tracker.text_input(key="dashboard_keyword").set_value("  eNgInEeR  ")
        selections = {
            "dashboard_status_filter": ["planning", "applied"],
            "dashboard_company_filter": ["Alpha"],
            "dashboard_location_filter": ["Taipei"],
        }
        for key, value in selections.items():
            tracker.multiselect(key=key).set_value(value)
        tracker.run()
        self.assert_rows(tracker, ["saved", "applied", "undated"])
        self.assert_table_export(tracker, "CSV")
        self.assert_table_export(tracker, "JSON")
        tracker.text_input(key="dashboard_keyword").set_value("undated")
        tracker.button(key="dashboard_prepare_export").click().run()
        # The preparation click commits the current Search before offering bytes.
        current = json.loads(self.data_bytes(self.download()).decode("utf-8"))
        self.assertEqual([row["Job Title"] for row in current], ["Engineer undated"])
        self.assert_rows(tracker, ["undated"])
        self.assert_table_export(tracker, "CSV")
        tracker.text_input(key="dashboard_keyword").set_value("")
        tracker.multiselect(key="dashboard_status_filter").set_value(["planning"])
        tracker.toggle(key="dashboard_show_saved").set_value(False).run()
        self.assert_rows(tracker, [])
        self.assertFalse(tracker.toggle(key="dashboard_show_saved").value)
        self.assertEqual(tracker.multiselect(key="dashboard_status_filter").value, ["planning"])

    def test_filtered_open_mapping_and_saved_preference_survive_navigation(self) -> None:
        tracker = self.app()
        tracker.toggle(key="dashboard_show_saved").set_value(True)
        tracker.multiselect(key="dashboard_status_filter").set_value(["planning", "interviewing"]).run()
        self.assert_rows(tracker, ["saved", "interview"])
        for row, name in enumerate(["saved", "interview"]):
            tracker.session_state["dashboard_open_click"] = {"row": row}
            tracker.session_state["test_open_event"] = True
            tracker.run()
            self.assert_no_exception(tracker)
            self.assertEqual(tracker.session_state["selected_job_id"], self.ids[name])
            self.assertEqual(tracker.session_state["page"], "job_detail")
            tracker.button(key=f"detail_back_{self.ids[name]}").click().run()
            self.assertTrue(tracker.toggle(key="dashboard_show_saved").value)
            # Existing ordinary filter widgets may reset across detail navigation.
            tracker.multiselect(key="dashboard_status_filter").set_value(["planning", "interviewing"]).run()
            self.assert_rows(tracker, ["saved", "interview"])

    def test_exports_share_visible_columns_values_escaping_and_password_mask(self) -> None:
        full_company = '中文公司, "甲"\n' + "Full company name " * 20
        self.jobs[1]["company"] = full_company
        self.jobs[1]["job_title"] = '職稱, "資料分析師"\n第二行'
        self.write_jobs()
        before = self.snapshot()
        tracker = self.app()
        csv_rows, csv_payload = self.assert_table_export(tracker, "CSV")
        json_rows, json_payload = self.assert_table_export(tracker, "JSON")
        self.assertEqual(csv_rows, json_rows)
        columns = list(json_rows[0])
        self.assertEqual(len(columns), len(set(columns)))
        self.assertEqual(columns[-6:], [
            "Source (source_a)", "Source (source_b)", "Company (company_note)",
            "Job Code", "Follow-up", "Remote",
        ])
        first = json_rows[0]
        self.assertEqual(first["Company"], full_company)
        self.assertEqual(first["Job Title"], '職稱, "資料分析師"\n第二行')
        self.assertEqual(first["Status"], "Applied")
        self.assertEqual(first["Date Applied"], "2026-09-21")
        self.assertEqual(json_rows[-1]["Date Applied"], "")
        self.assertEqual(first["Account"], "0000123")
        self.assertEqual(first["Job Code"], "000009")
        self.assertEqual(first["Source (source_a)"], '中文, "推薦"\n第二行')
        self.assertEqual(first["Source (source_b)"], "Other source")
        self.assertEqual(first["Job URL"], self.jobs[1]["job_url"])
        self.assertIn("中文公司".encode("utf-8"), json_payload)
        for payload in (csv_payload, json_payload):
            for hidden in (b"private-password-", b"hidden-custom-sentinel", b"hidden-email@example.com", b"/private/resumes/"):
                self.assertNotIn(hidden, payload)
            for job_id in self.ids.values():
                self.assertNotIn(job_id.encode("utf-8"), payload)
        self.assertNotIn("Open", columns)
        self.assertNotIn("index", columns)
        self.assertNotIn("Hidden custom", columns)
        self.assertTrue(all(row["Password"] == "••••••••" for row in json_rows))
        self.assertFalse(any("Export includes visible passwords." in item.value for item in tracker.caption))
        tracker.toggle(key="dashboard_show_passwords").set_value(True).run()
        revealed, _ = self.assert_table_export(tracker, "JSON")
        self.assertEqual(revealed[0]["Password"], "private-password-applied")
        self.assertTrue(any("Export includes visible passwords." in item.value for item in [*tracker.caption, *tracker.warning]))
        self.assert_table_export(tracker, "CSV")
        self.assertEqual(self.snapshot(), before)

    def test_empty_export_is_disabled_and_never_reuses_previous_results(self) -> None:
        tracker = self.app()
        self.assert_table_export(tracker, "JSON")
        tracker.text_input(key="dashboard_keyword").set_value("no matching company").run()
        self.assert_rows(tracker, [])
        self.assertTrue(self.download()["disabled"])
        self.assertEqual(json.loads(self.data_bytes(self.download()).decode("utf-8")), [])
        self.assertTrue(any("No jobs to export" in item.value for item in [*tracker.info, *tracker.caption]))
        csv_rows, columns, _ = self.export(tracker, "CSV")
        self.assertEqual(csv_rows, [])
        self.assertIn("Company", columns)
        self.assertNotIn("Open", columns)
        self.assertTrue(self.download()["disabled"])
        tracker.session_state["dashboard_open_click"] = {"row": 0}
        tracker.session_state["test_open_event"] = True
        tracker.run()
        self.assertEqual(tracker.session_state["page"], "dashboard")
        self.assert_rows(tracker, [])

    def test_exports_all_rows_beyond_table_viewport_and_preserves_input(self) -> None:
        source = copy.deepcopy(self.jobs[1])
        self.jobs = []
        for index in range(45):
            job = copy.deepcopy(source)
            job["id"] = str(uuid.uuid5(uuid.NAMESPACE_URL, f"dashboard-export/large/{index}"))
            job["job_title"] = f"Engineer {index:03d}"
            self.jobs.append(job)
        self.write_jobs()
        before = self.snapshot()
        tracker = self.app()
        self.assertEqual(len(tracker.dataframe[0].value), 45)
        for format in ("CSV", "JSON"):
            rows, _ = self.assert_table_export(tracker, format)
            self.assertEqual(len(rows), 45)
            self.assertEqual(rows[-1]["Job Title"], "Engineer 044")
        self.assertEqual(self.snapshot(), before)
        original = copy.deepcopy(self.jobs)
        direct = AppTest.from_string(f'''
import runpy
import streamlit as st
app = runpy.run_path({str(self.app_path)!r}, run_name="dashboard_export_source_test")
app["_render_dashboard"](st.session_state["test_jobs"], st.session_state["test_settings"])
''', default_timeout=15)
        direct.session_state["test_jobs"] = self.jobs
        direct.session_state["test_settings"] = storage.load_settings()
        direct.run()
        for reveal in (True, False):
            direct.toggle(key="dashboard_show_passwords").set_value(reveal).run()
            self.assert_table_export(direct, "JSON")
            self.assertEqual(direct.session_state["test_jobs"], original)
            self.assertEqual(self.jobs, original)
        self.assertEqual(self.snapshot(), before)


if __name__ == "__main__":
    unittest.main()
