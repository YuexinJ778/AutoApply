"""Import/navigation AppTests with every data path isolated in temporary storage.

AppTest cannot upload browser files or click dataframe ButtonColumns. File
uploads are supplied at the Streamlit widget boundary and Open events use the
production callback. Clipboard behavior requires the separate browser check.
"""

from __future__ import annotations

import importlib
import io
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
class ImportUITests(unittest.TestCase):
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
        settings = storage.load_settings()
        settings["local_timezone"] = "Asia/Taipei"
        settings["custom_fields"] = [
            {"id": "source", "label": "來源說明", "type": "text", "active": True, "show_in_table": True},
            {"id": "follow_up", "label": "追蹤日期", "type": "date", "active": True},
            {"id": "channel", "label": "管道", "type": "select", "options": ["官網", "推薦"], "active": True},
            {"id": "remote", "label": "遠端", "type": "checkbox", "active": True},
            {"id": "retired", "label": "已停用", "type": "text", "active": False},
        ]
        storage.save_settings(settings)
        self.existing = storage.create_job({
            "company": "Existing Inc", "job_title": "Analyst Original",
            "status_id": "planning", "location": "Taipei", "applied_date": "",
            "email": "existing-private@example.com", "account": "existing-account-sentinel",
            "password": "existing-password-sentinel", "custom_fields": {},
        })
        self.app = importlib.import_module("app")

    def start(self, *, import_page: bool = True):
        tracker = AppTest.from_string('''
import app
import streamlit as st
if st.session_state.pop("test_open_event", False):
    app._handle_dashboard_open()
app.main()
''', default_timeout=15).run()
        self.assert_no_exception(tracker)
        if import_page:
            tracker.button(key="nav_import_json").click().run()
            self.assertEqual(tracker.session_state["page"], "import_jobs")
            self.assert_no_exception(tracker)
        return tracker

    def assert_no_exception(self, tracker) -> None:
        self.assertEqual([item.message for item in tracker.exception], [])

    def snapshot(self) -> dict:
        return {
            str(path.relative_to(self.root)): (
                path.read_bytes(), path.stat().st_mtime_ns
            ) if path.is_file() else None
            for path in self.root.rglob("*")
        }

    @staticmethod
    def job(**updates) -> dict:
        return {
            "company": '中文公司, "甲"', "job_title": "資料分析師\n第二行",
            "status_id": "planning", "applied_date": "", "location": "台北",
            "job_url": "https://example.com/jobs/1", "email": "email@example.com",
            "account": "separate-account", "password": "  private\npassword  ",
            "custom_fields": {
                "source": '中文, "推薦"\n備註', "follow_up": "2026-10-01",
                "channel": "推薦", "remote": True,
            },
            **updates,
        }

    @staticmethod
    def payload(jobs: list[dict]) -> str:
        return json.dumps({"jobs": jobs}, ensure_ascii=False)

    def paste(self, tracker, text: str) -> None:
        generation = tracker.session_state["import_generation"]
        tracker.text_area(key=f"import_paste_{generation}").set_value(text).run()
        self.assert_no_exception(tracker)

    def assert_no_submit(self, tracker) -> None:
        self.assertFalse(any(item.key == "import_submit" and not item.disabled for item in tracker.button))

    @staticmethod
    def template(tracker) -> dict:
        return json.loads(next(item.value for item in tracker.code if '"jobs"' in item.value))

    def test_preview_tracks_current_input_without_writes_or_passwords(self) -> None:
        before = self.snapshot()
        tracker = self.start()
        template_text = json.dumps(self.template(tracker), ensure_ascii=False)
        for private in (self.existing["company"], self.existing["account"], self.existing["password"]):
            self.assertNotIn(private, template_text)
        self.paste(tracker, self.payload([self.job(), self.job(), self.job()]))
        self.assertEqual(tracker.button(key="import_submit").label, "Import 3 Jobs")
        self.assertEqual(len(tracker.dataframe[0].value), 3)
        preview = tracker.dataframe[0].value.to_json(force_ascii=False)
        self.assertNotIn("private", preview)
        self.assertEqual(self.snapshot(), before)
        self.paste(tracker, self.payload([self.job(company="Updated preview")]))
        self.assertEqual(tracker.button(key="import_submit").label, "Import 1 Jobs")
        self.assertIn("Updated preview", tracker.dataframe[0].value.to_json())
        tracker.run()
        self.assert_no_exception(tracker)
        self.assertEqual(self.snapshot(), before)

        self.paste(tracker, self.payload([self.job(), self.job(applied_date="2026-02-30")]))
        errors = " ".join(item.value for item in tracker.error)
        self.assertIn("2", errors)
        self.assertIn("applied_date", errors)
        self.assert_no_submit(tracker)
        self.assertEqual(len(tracker.dataframe), 0)
        self.assertEqual(self.snapshot(), before)
        self.paste(tracker, "")
        self.assert_no_submit(tracker)
        self.assertEqual(len(tracker.dataframe), 0)
        self.assertEqual(self.snapshot(), before)

    def test_import_appends_duplicates_resets_input_and_only_explicitly_reimports(self) -> None:
        tracker = self.start()
        jobs = [self.job(), self.job(), self.job(company="Third", status_id="applied", applied_date="2026-09-10")]
        text = self.payload(jobs)
        self.paste(tracker, text)
        tracker.button(key="import_submit").click().run()
        self.assert_no_exception(tracker)
        saved = storage.load_jobs()["jobs"]
        self.assertEqual(saved[0], self.existing)
        self.assertEqual(len(saved), 4)
        self.assertEqual(len({job["id"] for job in saved}), 4)
        for job in saved[1:]:
            self.assertEqual(str(uuid.UUID(job["id"])), job["id"])
            self.assertTrue(storage.get_job_directory(job["id"]).is_dir())
            self.assertEqual(job["email"], "email@example.com")
            self.assertEqual(job["account"], "separate-account")
            self.assertEqual(job["password"], "  private\npassword  ")
            self.assertEqual(job["custom_fields"], jobs[0]["custom_fields"])
        self.assertEqual(saved[1]["company"], jobs[0]["company"])
        self.assertEqual(saved[1]["job_title"], jobs[0]["job_title"])
        self.assertEqual(tracker.session_state["import_generation"], 1)
        self.assertEqual(tracker.text_area(key="import_paste_1").value, "")
        self.assertTrue(any("Imported 3 jobs" in item.value for item in tracker.success))
        self.assert_no_submit(tracker)
        after = self.snapshot()
        tracker.run()
        self.assert_no_exception(tracker)
        self.assertEqual(self.snapshot(), after)
        self.assertTrue(any("Imported 3 jobs" in item.value for item in tracker.success))

        self.paste(tracker, text)
        self.assertEqual(len(storage.load_jobs()["jobs"]), 4)
        tracker.button(key="import_submit").click().run()
        self.assert_no_exception(tracker)
        self.assertEqual(len(storage.load_jobs()["jobs"]), 7)
        self.assertEqual(len({job["id"] for job in storage.load_jobs()["jobs"]}), 7)

    def test_upload_uses_selected_source_and_new_widget_key_discards_old_file(self) -> None:
        uploaded_text = self.payload([self.job(company="Uploaded A"), self.job(company="Uploaded B")])
        files = {"import_upload_0": io.BytesIO(uploaded_text.encode("utf-8"))}
        with patch("streamlit.file_uploader", side_effect=lambda *args, **kwargs: files.get(kwargs["key"])) as uploader:
            before = self.snapshot()
            tracker = self.start()
            self.paste(tracker, "invalid stale paste")
            tracker.radio(key="import_source").set_value("Upload JSON").run()
            self.assert_no_exception(tracker)
            self.assertEqual(tracker.button(key="import_submit").label, "Import 2 Jobs")
            self.assertEqual(self.snapshot(), before)
            tracker.run()
            self.assertEqual(self.snapshot(), before)
            tracker.button(key="import_submit").click().run()
            self.assert_no_exception(tracker)
            self.assertEqual([job["company"] for job in storage.load_jobs()["jobs"]][1:], ["Uploaded A", "Uploaded B"])
            self.assertEqual(tracker.session_state["import_generation"], 1)
            self.assertEqual(uploader.call_args.kwargs["key"], "import_upload_1")
            self.assert_no_submit(tracker)
            after = self.snapshot()
            tracker.run()
            self.assert_no_exception(tracker)
            self.assertEqual(self.snapshot(), after)
            tracker.radio(key="import_source").set_value("Paste JSON").run()
            self.assertEqual(tracker.text_area(key="import_paste_1").value, "")
            self.assertEqual(self.snapshot(), after)

    def test_filled_template_paste_and_upload_save_equivalent_jobs(self) -> None:
        tracker = self.start()
        document = self.template(tracker)
        document["jobs"] = [self.job(), self.job(company="Second", applied_date="2026-09-09", status_id="applied")]
        text = json.dumps(document, ensure_ascii=False)
        settings_before = storage.SETTINGS_FILE.read_bytes()
        self.paste(tracker, text)
        tracker.button(key="import_submit").click().run()
        self.assert_no_exception(tracker)
        pasted = storage.load_jobs()["jobs"][1:]
        files = {"import_upload_1": io.BytesIO(text.encode("utf-8"))}
        with patch("streamlit.file_uploader", side_effect=lambda *args, **kwargs: files.get(kwargs["key"])):
            tracker.radio(key="import_source").set_value("Upload JSON").run()
            self.assert_no_exception(tracker)
            tracker.button(key="import_submit").click().run()
            self.assert_no_exception(tracker)
        uploaded = storage.load_jobs()["jobs"][3:]
        def remove_generated(job):
            return {key: value for key, value in job.items() if key not in {"id", "created_at", "updated_at"}}
        self.assertEqual([remove_generated(job) for job in pasted], [remove_generated(job) for job in uploaded])
        self.assertEqual(storage.SETTINGS_FILE.read_bytes(), settings_before)
        self.assertTrue(all("_help" not in job for job in storage.load_jobs()["jobs"]))

    def test_inactive_upload_does_not_replace_invalid_paste(self) -> None:
        files = {"import_upload_0": io.BytesIO(self.payload([self.job(company="Upload only")]).encode("utf-8"))}
        with patch("streamlit.file_uploader", side_effect=lambda *args, **kwargs: files.get(kwargs["key"])):
            before = self.snapshot()
            tracker = self.start()
            tracker.radio(key="import_source").set_value("Upload JSON").run()
            self.assertEqual(tracker.button(key="import_submit").label, "Import 1 Jobs")
            tracker.radio(key="import_source").set_value("Paste JSON").run()
            self.paste(tracker, "not json")
            self.assertTrue(tracker.error)
            self.assert_no_submit(tracker)
            self.assertEqual(len(tracker.dataframe), 0)
            self.assertEqual(self.snapshot(), before)

    def test_upload_invalid_utf8_and_save_failure_do_not_claim_success(self) -> None:
        tracker = self.start()
        before = self.snapshot()
        with patch("streamlit.file_uploader", return_value=io.BytesIO(b"\xff\xfe\x80")):
            tracker.radio(key="import_source").set_value("Upload JSON").run()
            self.assert_no_exception(tracker)
            self.assertTrue(tracker.error)
            self.assert_no_submit(tracker)
            self.assertEqual(self.snapshot(), before)
        tracker.radio(key="import_source").set_value("Paste JSON").run()
        self.paste(tracker, self.payload([self.job()]))
        with patch.object(self.app, "create_jobs_batch", side_effect=OSError("Simulated disk failure")):
            tracker.button(key="import_submit").click().run()
        self.assert_no_exception(tracker)
        self.assertTrue(any("Simulated disk failure" in item.value for item in tracker.error))
        self.assertFalse(tracker.success)
        self.assertEqual(tracker.session_state["import_generation"], 0)
        self.assertEqual(self.snapshot(), before)

    def test_reopening_template_reflects_current_settings_without_existing_data(self) -> None:
        tracker = self.start()
        original = self.template(tracker)
        self.assertNotIn("retired", original["jobs"][0]["custom_fields"])
        tracker.button(key="nav_settings").click().run()
        settings = storage.load_settings()
        settings["statuses"].append({
            "id": "new_status", "label": "新增的狀態", "summary_group": "offer", "active": True,
        })
        settings["custom_fields"].append({
            "id": "new_field", "label": "新增的欄位", "type": "select", "options": ["甲", "乙"], "active": True,
        })
        storage.save_settings(settings)
        before = self.snapshot()
        tracker.button(key="nav_import_json").click().run()
        self.assert_no_exception(tracker)
        document = self.template(tracker)
        new_status = next(item for item in document["_help"]["statuses"] if item["id"] == "new_status")
        self.assertIn("新增的狀態", new_status.values())
        self.assertEqual(new_status["summary_group"], "offer")
        field = next(item for item in document["_help"]["custom_fields"] if item["id"] == "new_field")
        self.assertEqual(field["options"], ["甲", "乙"])
        self.assertIn("new_field", document["jobs"][0]["custom_fields"])
        self.assertEqual(document["jobs"][0]["company"], "")
        self.assertEqual(document["jobs"][0]["password"], "")
        self.assertEqual(self.snapshot(), before)

    def test_saved_batch_folder_error_retains_result_and_prevents_duplicate_retry(self) -> None:
        tracker = self.start()
        self.paste(tracker, self.payload([self.job(company="Saved A"), self.job(company="Saved B")]))
        get_directory = storage.get_job_directory
        creation_attempts = []

        def fail_first_directory(job_id, create=False):
            if create:
                creation_attempts.append(job_id)
                if len(creation_attempts) == 1:
                    raise OSError("Simulated folder failure")
            return get_directory(job_id, create=create)

        with patch.object(storage, "get_job_directory", side_effect=fail_first_directory):
            tracker.button(key="import_submit").click().run()
        self.assert_no_exception(tracker)
        saved = storage.load_jobs()["jobs"]
        self.assertEqual(len(saved), 3)
        self.assertEqual(creation_attempts, [job["id"] for job in saved[1:]])
        self.assertFalse(get_directory(saved[1]["id"]).exists())
        self.assertTrue(get_directory(saved[2]["id"]).is_dir())
        errors = " ".join(item.value for item in tracker.error)
        self.assertIn("Saved 2 jobs", errors)
        self.assertIn("Simulated folder failure", errors)
        self.assertFalse(tracker.success)
        self.assertEqual(tracker.session_state["import_result"]["count"], 2)
        self.assertEqual(tracker.session_state["import_generation"], 1)
        self.assertEqual(tracker.text_area(key="import_paste_1").value, "")
        self.assert_no_submit(tracker)
        after = self.snapshot()
        tracker.run()
        self.assert_no_exception(tracker)
        self.assertEqual(self.snapshot(), after)
        self.assertTrue(any("Saved 2 jobs" in item.value for item in tracker.error))

    def test_import_keeps_dashboard_filters_and_open_targets_imported_uuid(self) -> None:
        tracker = self.start(import_page=False)
        tracker.toggle(key="dashboard_show_archived").set_value(True)
        tracker.toggle(key="dashboard_show_saved").set_value(True)
        tracker.text_input(key="dashboard_keyword").set_value("Analyst")
        filters = {
            "dashboard_status_filter": ["planning", "rejected"],
            "dashboard_company_filter": ["Existing Inc"],
            "dashboard_location_filter": ["Taipei"],
        }
        for key, value in filters.items():
            tracker.multiselect(key=key).set_value(value)
        tracker.run()
        tracker.button(key="nav_import_json").click().run()
        matching = self.job(company="Existing Inc", job_title="Analyst Imported", location="Taipei", applied_date="2026-09-15")
        rejected = {**matching, "status_id": "rejected", "applied_date": "2026-09-16"}
        self.paste(tracker, self.payload([matching, rejected, self.job(company="Other")]))
        tracker.button(key="import_submit").click().run()
        self.assert_no_exception(tracker)
        saved = storage.load_jobs()["jobs"]
        imported_id = saved[1]["id"]
        tracker.button(key="import_back_dashboard").click().run()
        self.assert_no_exception(tracker)
        self.assertTrue(tracker.toggle(key="dashboard_show_archived").value)
        self.assertTrue(tracker.toggle(key="dashboard_show_saved").value)
        self.assertFalse(tracker.toggle(key="dashboard_show_rejected").value)
        self.assertEqual(tracker.text_input(key="dashboard_keyword").value, "Analyst")
        for key, value in filters.items():
            self.assertEqual(tracker.multiselect(key=key).value, value)
        self.assertEqual(tracker.session_state["dashboard_visible_job_ids"], [imported_id, self.existing["id"]])
        self.assertEqual({item.label: item.value for item in tracker.metric}, {"Offers": "0", "Rejected": "1", "Pending": "3"})
        tracker.session_state["dashboard_open_click"] = {"row": 0}
        tracker.session_state["test_open_event"] = True
        tracker.run()
        self.assert_no_exception(tracker)
        self.assertEqual(tracker.session_state["page"], "job_detail")
        self.assertEqual(tracker.session_state["selected_job_id"], imported_id)

        before = self.snapshot()
        with patch.object(self.app, "render_calendar", return_value={}) as calendar:
            with patch.object(self.app, "_read_browser_timezone", return_value=None):
                tracker.button(key="nav_calendar").click().run()
        self.assert_no_exception(tracker)
        events = {item["id"]: item for item in calendar.call_args.kwargs["events"]}
        self.assertEqual(set(events), {f"application:{saved[1]['id']}", f"application:{saved[2]['id']}"})
        self.assertEqual(events[f"application:{imported_id}"]["start"], "2026-09-15")
        self.assertTrue(events[f"application:{imported_id}"]["allDay"])
        self.assertEqual(self.snapshot(), before)


if __name__ == "__main__":
    unittest.main()
