"""Companies page regressions; every persisted fixture lives in a temporary root."""

from __future__ import annotations

from datetime import date
import csv
import importlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from streamlit.testing.v1 import AppTest

import storage


class CompaniesUITests(unittest.TestCase):
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
        self.companies_file = storage.DATA_DIR / "companies.csv"
        self.app = importlib.import_module("app")

    @staticmethod
    def by_label(elements, label: str):
        return next(element for element in elements if element.label == label)

    def assert_no_exception(self, tracker: AppTest) -> None:
        self.assertEqual([error.message for error in tracker.exception], [])

    def start(self, page: str = "companies") -> AppTest:
        tracker = AppTest.from_string("import app\napp.main()", default_timeout=15)
        tracker.session_state["page"] = page
        tracker.run()
        self.assert_no_exception(tracker)
        return tracker

    def snapshot(self) -> dict:
        return {
            str(path.relative_to(self.root)): (path.read_bytes(), path.stat().st_mtime_ns)
            for path in self.root.rglob("*") if path.is_file()
        }

    def company_snapshot(self):
        if not self.companies_file.exists():
            return None
        return self.companies_file.read_bytes(), self.companies_file.stat().st_mtime_ns

    @staticmethod
    def company(company_name: str = "Target Company", fetched: str = "") -> dict:
        return storage.create_company({
            "company_name": company_name, "last_fetched_date": fetched,
        })

    def edit(self, tracker: AppTest, company_id: str) -> None:
        tracker.selectbox(key="companies_selected_id").set_value(company_id).run()
        self.assert_no_exception(tracker)

    def save(self, tracker: AppTest) -> None:
        self.by_label(tracker.button, "Save").click().run()
        self.assert_no_exception(tracker)

    def add_column(
        self, tracker: AppTest, label: str, field_type: str = "text", options: str = "",
    ) -> dict:
        tracker.button(key="companies_add_column").click().run()
        self.assert_no_exception(tracker)
        tracker.text_input(key="companies_column_name").set_value(label)
        tracker.selectbox(key="companies_column_type").set_value(field_type).run()
        if field_type == "select":
            tracker.text_area(key="companies_column_options").set_value(options)
        tracker.button(key="companies_column_submit").click().run()
        self.assert_no_exception(tracker)
        self.assertFalse(tracker.error)
        self.assertTrue(any("column" in message.value.lower() for message in tracker.success))
        return storage.load_company_columns()[-1]

    def manage_column(self, tracker: AppTest, column_id: str) -> None:
        tracker.button(key="companies_manage_columns").click().run()
        tracker.selectbox(key="companies_column_selected").set_value(column_id).run()
        self.assert_no_exception(tracker)

    def save_column(self, tracker: AppTest) -> None:
        tracker.button(key="companies_column_save").click().run()
        self.assert_no_exception(tracker)

    def test_sidebar_entry_order_empty_page_and_reruns_do_not_write(self) -> None:
        tracker = self.start("dashboard")
        navigation = [button.label for button in tracker.sidebar.button
                      if button.key and button.key.startswith("nav_")]
        self.assertEqual(navigation, ["Dashboard", "Calendar", "Companies", "Prompts", "Import JSON", "Settings"])
        tracker.button(key="nav_companies").click().run()
        self.assert_no_exception(tracker)
        self.assertEqual(tracker.session_state["page"], "companies")
        self.assertEqual(tracker.title[0].value, "Companies")
        self.assertIn("No companies added yet", [item.value for item in tracker.info])
        self.assertFalse(tracker.button(key="companies_add").disabled)
        before = self.snapshot()
        tracker.run()
        tracker.button(key="nav_dashboard").click().run()
        tracker.button(key="nav_companies").click().run()
        self.assert_no_exception(tracker)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(storage.load_companies(), [])

    def test_empty_list_add_requires_trimmed_name_and_allows_empty_date(self) -> None:
        tracker = self.start()
        tracker.button(key="companies_add").click().run()
        self.assert_no_exception(tracker)
        picker = self.by_label(tracker.date_input, "Last Fetched Date")
        self.assertIsNone(picker.value)
        self.assertEqual(picker.proto.format, "YYYY-MM-DD")
        before = self.snapshot()
        self.by_label(tracker.text_input, "Company Name *").set_value("   ")
        self.save(tracker)
        self.assertTrue(any("name" in error.value.lower() for error in tracker.error))
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(storage.load_companies(), [])

        name = '台灣公司, "Target"'
        self.by_label(tracker.text_input, "Company Name *").set_value(f"  {name}  ")
        self.save(tracker)
        companies = storage.load_companies()
        self.assertEqual(len(companies), 1)
        self.assertEqual(companies[0]["company_name"], name)
        self.assertEqual(companies[0]["last_fetched_date"], "")
        self.assertEqual(list(tracker.dataframe[0].value.columns), ["Company Name", "Last Fetched Date"])
        self.assertEqual(tracker.dataframe[0].value.to_dict("records"), [{
            "Company Name": name, "Last Fetched Date": "Never fetched",
        }])
        saved = self.snapshot()
        tracker.run()
        reopened = self.start()
        self.edit(reopened, companies[0]["id"])
        self.assertEqual(self.by_label(reopened.text_input, "Company Name *").value, name)
        self.assertIsNone(reopened.date_input[0].value)
        self.assertEqual(self.snapshot(), saved)

    def test_today_uses_each_click_local_date_and_preserves_unsaved_name(self) -> None:
        existing = self.company(fetched="2024-02-29")
        before = self.snapshot()

        class LocalDate(date):
            today = Mock(return_value=date(2032, 12, 31))

        with (
            patch.object(self.app, "date", LocalDate),
            patch.object(self.app, "update_company", wraps=self.app.update_company) as save,
        ):
            tracker = self.start()
            self.edit(tracker, existing["id"])
            LocalDate.today.assert_not_called()
            self.by_label(tracker.text_input, "Company Name *").set_value("Draft 公司")
            self.by_label(tracker.button, "Today").click().run()
            self.assert_no_exception(tracker)
            self.assertEqual(tracker.date_input[0].value, date(2032, 12, 31))
            self.assertEqual(self.by_label(tracker.text_input, "Company Name *").value, "Draft 公司")
            LocalDate.today.assert_called_once_with()
            LocalDate.today.return_value = date(2033, 1, 1)
            tracker.run()
            self.assertEqual(tracker.date_input[0].value, date(2032, 12, 31))
            LocalDate.today.assert_called_once_with()
            self.by_label(tracker.button, "Today").click().run()
            self.assertEqual(tracker.date_input[0].value, date(2033, 1, 1))
            self.assertEqual(LocalDate.today.call_count, 2)
            self.assertEqual(self.by_label(tracker.text_input, "Company Name *").value, "Draft 公司")
            self.assertEqual(self.snapshot(), before)
            save.assert_not_called()

            self.assertFalse(tracker.get("form")[0].proto.form.enter_to_submit)
            today = self.by_label(tracker.button, "Today")
            self.assertTrue(today.proto.is_form_submitter)
            self.assertEqual(today.proto.form_id, tracker.date_input[0].form_id)
            self.save(tracker)
            save.assert_called_once()
        self.assertEqual(storage.load_companies(), [{
            "id": existing["id"], "company_name": "Draft 公司", "last_fetched_date": "2033-01-01",
        }])

    def test_date_selection_modification_name_only_edit_and_clear_require_save(self) -> None:
        existing = self.company()
        tracker = self.start()
        self.edit(tracker, existing["id"])
        for chosen in (date(2020, 8, 1), date(2025, 11, 12)):
            before = self.snapshot()
            tracker.date_input[0].set_value(chosen).run()
            self.assert_no_exception(tracker)
            self.assertEqual(self.snapshot(), before)
            self.save(tracker)
            stored = storage.load_companies()[0]
            self.assertEqual(stored["id"], existing["id"])
            self.assertEqual(stored["last_fetched_date"], chosen.isoformat())

        self.by_label(tracker.text_input, "Company Name *").set_value("Renamed only")
        self.save(tracker)
        self.assertEqual(storage.load_companies()[0]["last_fetched_date"], "2025-11-12")
        before = self.snapshot()
        self.by_label(tracker.button, "Clear date").click().run()
        self.assert_no_exception(tracker)
        self.assertIsNone(tracker.date_input[0].value)
        self.assertEqual(self.snapshot(), before)
        self.save(tracker)
        self.assertEqual(storage.load_companies(), [{
            "id": existing["id"], "company_name": "Renamed only", "last_fetched_date": "",
        }])
        reopened = self.start()
        self.edit(reopened, existing["id"])
        self.assertIsNone(reopened.date_input[0].value)

    def test_add_and_cancel_discard_existing_company_drafts(self) -> None:
        existing = self.company("Existing", "2020-01-01")
        tracker = self.start()
        self.edit(tracker, existing["id"])
        self.by_label(tracker.text_input, "Company Name *").set_value("Unsaved rename")
        self.by_label(tracker.button, "Today").click().run()
        before = self.snapshot()
        tracker.button(key="companies_add").click().run()
        self.assert_no_exception(tracker)
        self.assertEqual(self.by_label(tracker.text_input, "Company Name *").value, "")
        self.assertIsNone(tracker.date_input[0].value)
        self.by_label(tracker.text_input, "Company Name *").set_value("Unsaved add")
        tracker.button(key="companies_cancel").click().run()
        self.assert_no_exception(tracker)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(storage.load_companies(), [existing])
        tracker.button(key="companies_add").click().run()
        self.assertEqual(self.by_label(tracker.text_input, "Company Name *").value, "")
        self.assertIsNone(tracker.date_input[0].value)

    def test_navigation_back_keeps_selector_and_editor_on_the_same_uuid(self) -> None:
        self.company("Another Company")
        existing = self.company("Chosen Company", "2020-01-01")
        tracker = self.start()
        self.edit(tracker, existing["id"])
        before = self.snapshot()
        tracker.button(key="nav_dashboard").click().run()
        tracker.button(key="nav_companies").click().run()
        self.assert_no_exception(tracker)
        self.assertEqual(tracker.selectbox(key="companies_selected_id").value, existing["id"])
        self.assertEqual(self.by_label(tracker.text_input, "Company Name *").value, "Chosen Company")
        self.assertEqual(tracker.date_input[0].value, date(2020, 1, 1))
        self.assertEqual(self.snapshot(), before)

    def test_saved_name_and_date_push_updated_picker_labels_to_the_browser(self) -> None:
        existing = self.company("Original Company", "2020-01-01")
        tracker = self.start()
        self.edit(tracker, existing["id"])
        previous_label = tracker.selectbox(key="companies_selected_id").proto.raw_value
        changes = [
            ("name", "Renamed Company", "Renamed Company · 2020-01-01"),
            ("date", date(2025, 2, 3), "Renamed Company · 2025-02-03"),
        ]
        for field, value, expected_label in changes:
            with self.subTest(field=field):
                if field == "name":
                    self.by_label(tracker.text_input, "Company Name *").set_value(value)
                else:
                    tracker.date_input[0].set_value(value)
                self.save(tracker)
                picker = tracker.selectbox(key="companies_selected_id")
                self.assertTrue(picker.proto.set_value, "Save must refresh the client selection")
                self.assertEqual(picker.proto.raw_value, expected_label)
                self.assertIn(picker.proto.raw_value, picker.proto.options)
                self.assertNotIn(previous_label, picker.proto.options)
                self.assertEqual(picker.value, existing["id"])
                self.assertEqual(tracker.session_state["companies_selected_id"], existing["id"])
                self.assertEqual(tracker.session_state["companies_editor_id"], existing["id"])
                tracker.run()
                self.assert_no_exception(tracker)
                self.assertEqual(tracker.selectbox(key="companies_selected_id").value, existing["id"])
                previous_label = expected_label

    def test_identical_name_and_date_records_have_distinct_picker_labels_and_uuid_edits(self) -> None:
        first = self.company("Same Company", "2020-01-01")
        second = self.company("Same Company", "2020-01-01")
        tracker = self.start()
        picker = tracker.selectbox(key="companies_selected_id")
        self.assertEqual(len(picker.proto.options), 2)
        self.assertEqual(len(set(picker.proto.options)), 2)
        for existing in (first, second):
            self.edit(tracker, existing["id"])
            picker = tracker.selectbox(key="companies_selected_id")
            self.assertEqual(picker.value, existing["id"])
            self.assertEqual(tracker.session_state["companies_editor_id"], existing["id"])
            self.assertIn(picker.proto.raw_value, picker.proto.options)

        tracker.date_input[0].set_value(date(2025, 2, 3))
        self.save(tracker)
        records = {item["id"]: item for item in storage.load_companies()}
        self.assertEqual(records[first["id"]], first)
        self.assertEqual(records[second["id"]]["last_fetched_date"], "2025-02-03")
        self.edit(tracker, first["id"])
        self.by_label(tracker.text_input, "Company Name *").set_value("Renamed first")
        self.save(tracker)
        records = {item["id"]: item for item in storage.load_companies()}
        self.assertEqual(records[first["id"]], {**first, "company_name": "Renamed first"})
        self.assertEqual(records[second["id"]], {**second, "last_fetched_date": "2025-02-03"})

    def test_table_sorts_unfetched_then_date_then_name_and_hides_uuid(self) -> None:
        for name, fetched in [
            ("Newest", "2026-10-31"), ("beta", ""), ("Zebra", "2020-01-01"),
            ("Alpha", ""), ("apple", "2020-01-01"),
        ]:
            self.company(name, fetched)
        before = self.snapshot()
        tracker = self.start()
        frame = tracker.dataframe[0].value
        self.assertEqual(list(frame.columns), ["Company Name", "Last Fetched Date"])
        self.assertEqual(frame["Company Name"].tolist(), ["Alpha", "beta", "apple", "Zebra", "Newest"])
        self.assertEqual(frame["Last Fetched Date"].tolist(), [
            "Never fetched", "Never fetched", "2020-01-01", "2020-01-01", "2026-10-31",
        ])
        tracker.run()
        self.assertEqual(self.snapshot(), before)

    def test_duplicate_names_edit_and_delete_by_uuid_without_affecting_jobs(self) -> None:
        first = self.company("Same Company")
        target = self.company("Same Company", "2020-01-01")
        job = storage.create_job({"company": "Same Company", "job_title": "Engineer"})
        jobs_snapshot = storage.JOBS_FILE.read_bytes(), storage.JOBS_FILE.stat().st_mtime_ns
        tracker = self.start()
        self.edit(tracker, target["id"])
        self.by_label(tracker.text_input, "Company Name *").set_value("Edited target")
        self.save(tracker)
        records = {item["id"]: item for item in storage.load_companies()}
        self.assertEqual(records[first["id"]], first)
        self.assertEqual(records[target["id"]]["company_name"], "Edited target")
        self.assertEqual(records[target["id"]]["last_fetched_date"], "2020-01-01")

        tracker.button(key="companies_delete").click().run()
        self.assert_no_exception(tracker)
        self.assertIn(
            "Delete this company from the tracking list?\nExisting job applications will not be affected.",
            [warning.value for warning in tracker.warning],
        )
        self.assertEqual(len(storage.load_companies()), 2)
        tracker.button(key="companies_cancel_delete").click().run()
        self.assertEqual(len(storage.load_companies()), 2)
        tracker.button(key="companies_delete").click().run()
        tracker.button(key="companies_confirm_delete").click().run()
        self.assert_no_exception(tracker)
        self.assertEqual(storage.load_companies(), [first])
        self.assertEqual(storage.get_job_by_id(job["id"])["company"], "Same Company")
        self.assertEqual((storage.JOBS_FILE.read_bytes(), storage.JOBS_FILE.stat().st_mtime_ns), jobs_snapshot)
        before = self.snapshot()
        tracker.run()
        self.assertEqual(self.snapshot(), before)

    def test_job_crud_and_dashboard_bulk_delete_leave_companies_unchanged(self) -> None:
        self.company("Same Company", "2020-01-01")
        before = self.company_snapshot()
        job = storage.create_job({"company": "Untracked Company", "job_title": "Engineer"})
        storage.update_job(job["id"], {"company": "Same Company", "status_id": "applied"})
        self.assertEqual(self.company_snapshot(), before)
        tracker = self.start("dashboard")
        tracker.button(key="dashboard_select_all").click().run()
        tracker.button(key="dashboard_delete_selected").click().run()
        tracker.checkbox(key="dashboard_confirm_delete").check().run()
        tracker.button(key="dashboard_execute_delete").click().run()
        self.assert_no_exception(tracker)
        self.assertIsNone(storage.get_job_by_id(job["id"]))
        self.assertEqual(self.company_snapshot(), before)
        tracker.button(key="nav_companies").click().run()
        self.assert_no_exception(tracker)
        self.assertEqual(tracker.dataframe[0].value["Company Name"].tolist(), ["Same Company"])
        self.assertEqual(self.company_snapshot(), before)

    def test_corrupt_company_file_is_reported_and_cannot_be_overwritten_from_empty_form(self) -> None:
        self.company()
        self.companies_file.write_text('wrong,header\nexisting,important\n', encoding="utf-8")
        before = self.snapshot()
        tracker = self.start()
        self.assertTrue(tracker.error)
        self.assertNotIn("No companies added yet", [item.value for item in tracker.info])
        self.assertFalse(any(button.key == "companies_add" and not button.disabled for button in tracker.button))
        self.assertEqual(len(tracker.text_input), 0)
        tracker.run()
        self.assert_no_exception(tracker)
        self.assertEqual(self.snapshot(), before)

    def test_column_creation_requires_confirmation_and_does_not_repeat_on_rerun(self) -> None:
        self.company()
        tracker = self.start()
        actions = [button.label for button in tracker.button
                   if button.key in ("companies_add", "companies_add_column")]
        self.assertEqual(actions, ["Add Company", "Add Column"])
        before = self.snapshot()
        tracker.button(key="companies_add_column").click().run()
        self.assert_no_exception(tracker)
        self.assertEqual(tracker.selectbox(key="companies_column_type").value, "text")
        self.assertFalse(any(item.key == "companies_column_options" for item in tracker.text_area))
        tracker.text_input(key="companies_column_name").set_value("Country")
        tracker.selectbox(key="companies_column_type").set_value("select").run()
        self.assertIsNotNone(tracker.text_area(key="companies_column_options"))
        tracker.text_area(key="companies_column_options").set_value("Taiwan\nUS")
        tracker.run()
        tracker.selectbox(key="companies_column_type").set_value("text").run()
        tracker.button(key="companies_column_cancel").click().run()
        self.assert_no_exception(tracker)
        self.assertEqual(storage.load_company_columns(), [])
        self.assertEqual(self.snapshot(), before)

        created = self.add_column(tracker, "  所在國家 Country  ")
        self.assertEqual(created["label"], "所在國家 Country")
        self.assertEqual(created["type"], "text")
        self.assertTrue(created["id"].startswith("custom_"))
        self.assertEqual(list(tracker.dataframe[0].value.columns), [
            "Company Name", "Last Fetched Date", "所在國家 Country",
        ])
        self.assertFalse(any(button.key == "companies_column_submit" for button in tracker.button))
        saved = self.snapshot()
        tracker.run()
        tracker.run()
        self.assertEqual(storage.load_company_columns(), [created])
        self.assertEqual(self.snapshot(), saved)

    def test_column_validation_and_ordered_nonempty_select_options(self) -> None:
        existing = storage.add_company_column("Country")
        tracker = self.start()
        tracker.button(key="companies_add_column").click().run()
        before = self.snapshot()
        for invalid_label in ("   ", "Company Name", "Last Fetched Date", " Country "):
            with self.subTest(label=invalid_label):
                tracker.text_input(key="companies_column_name").set_value(invalid_label)
                tracker.button(key="companies_column_submit").click().run()
                self.assert_no_exception(tracker)
                self.assertTrue(tracker.error)
                self.assertEqual(storage.load_company_columns(), [existing])
                self.assertEqual(self.snapshot(), before)

        tracker.text_input(key="companies_column_name").set_value("Priority")
        tracker.selectbox(key="companies_column_type").set_value("select").run()
        tracker.text_area(key="companies_column_options").set_value(" \n\n   ")
        tracker.button(key="companies_column_submit").click().run()
        self.assert_no_exception(tracker)
        self.assertTrue(tracker.error)
        self.assertEqual(self.snapshot(), before)
        tracker.text_area(key="companies_column_options").set_value("  Later \n\n First \n  中間  \n")
        tracker.button(key="companies_column_submit").click().run()
        self.assert_no_exception(tracker)
        self.assertFalse(tracker.error)
        self.assertEqual(storage.load_company_columns()[1]["options"], ["Later", "First", "中間"])

    def test_all_custom_types_appear_in_table_add_edit_and_fresh_session(self) -> None:
        old = self.company("Existing 公司", "2024-02-29")
        tracker = self.start()
        fields = {
            "Notes": self.add_column(tracker, "Notes"),
            "Follow-up": self.add_column(tracker, "Follow-up", "date"),
            "Country": self.add_column(tracker, "Country", "select", "Taiwan\nUS"),
            "Reviewed": self.add_column(tracker, "Reviewed", "checkbox"),
        }
        self.assertEqual(list(tracker.dataframe[0].value.columns), [
            "Company Name", "Last Fetched Date", *fields,
        ])
        stored_old = storage.load_companies()[0]
        for built_in, value in old.items():
            self.assertEqual(stored_old[built_in], value)
        for label, field in fields.items():
            self.assertEqual(stored_old[field["id"]], False if label == "Reviewed" else "")

        self.edit(tracker, old["id"])
        self.assertEqual(self.by_label(tracker.text_input, "Notes").value, "")
        self.assertIsNone(self.by_label(tracker.date_input, "Follow-up").value)
        self.assertIn(self.by_label(tracker.selectbox, "Country").value, (None, ""))
        self.assertFalse(self.by_label(tracker.checkbox, "Reviewed").value)
        tracker.button(key="companies_add").click().run()
        self.by_label(tracker.text_input, "Company Name *").set_value("New 公司")
        self.by_label(tracker.text_input, "Notes").set_value('Taipei, "Research"')
        self.by_label(tracker.date_input, "Follow-up").set_value(date(2027, 4, 5))
        self.by_label(tracker.selectbox, "Country").set_value("Taiwan")
        self.by_label(tracker.checkbox, "Reviewed").check()
        self.save(tracker)
        records = {company["company_name"]: company for company in storage.load_companies()}
        new = records["New 公司"]
        expected = {
            fields["Notes"]["id"]: 'Taipei, "Research"',
            fields["Follow-up"]["id"]: "2027-04-05",
            fields["Country"]["id"]: "Taiwan",
            fields["Reviewed"]["id"]: True,
        }
        for field_id, value in expected.items():
            self.assertEqual(new[field_id], value)
        self.assertEqual(records[old["company_name"]], stored_old)
        displayed = tracker.dataframe[0].value.set_index("Company Name").loc["New 公司"]
        self.assertEqual(displayed["Notes"], 'Taipei, "Research"')
        self.assertEqual(displayed["Follow-up"], date(2027, 4, 5))
        self.assertEqual(displayed["Country"], "Taiwan")
        self.assertTrue(displayed["Reviewed"])

        reopened = self.start()
        self.edit(reopened, new["id"])
        self.assertEqual(self.by_label(reopened.text_input, "Notes").value, 'Taipei, "Research"')
        self.assertEqual(self.by_label(reopened.date_input, "Follow-up").value, date(2027, 4, 5))
        self.assertEqual(self.by_label(reopened.selectbox, "Country").value, "Taiwan")
        self.assertTrue(self.by_label(reopened.checkbox, "Reviewed").value)
        self.by_label(reopened.text_input, "Company Name *").set_value("Renamed 公司")
        self.by_label(reopened.date_input, "Follow-up").set_value(None)
        self.by_label(reopened.selectbox, "Country").set_value("")
        self.by_label(reopened.checkbox, "Reviewed").uncheck()
        self.save(reopened)
        saved = next(company for company in storage.load_companies() if company["id"] == new["id"])
        self.assertEqual(saved["company_name"], "Renamed 公司")
        self.assertEqual(saved[fields["Notes"]["id"]], 'Taipei, "Research"')
        self.assertEqual(saved[fields["Follow-up"]["id"]], "")
        self.assertEqual(saved[fields["Country"]["id"]], "")
        self.assertIs(saved[fields["Reviewed"]["id"]], False)

    def test_adding_another_column_keeps_existing_values_and_unsaved_editor_draft(self) -> None:
        notes = storage.add_company_column("Notes")
        existing = storage.create_company({
            "company_name": "Original", "last_fetched_date": "2020-01-01",
            notes["id"]: "Saved notes",
        })
        tracker = self.start()
        self.edit(tracker, existing["id"])
        note_key = self.by_label(tracker.text_input, "Notes").key
        self.assertIn(existing["id"], note_key)
        self.assertIn(notes["id"], note_key)
        self.by_label(tracker.text_input, "Company Name *").set_value("Draft 公司")
        self.by_label(tracker.date_input, "Last Fetched Date").set_value(date(2030, 2, 3))
        self.by_label(tracker.text_input, "Notes").set_value("Unsaved notes")
        country = self.add_column(tracker, "Country", "select", "Taiwan\nUS")
        self.assertEqual(self.by_label(tracker.text_input, "Company Name *").value, "Draft 公司")
        self.assertEqual(self.by_label(tracker.date_input, "Last Fetched Date").value, date(2030, 2, 3))
        self.assertEqual(self.by_label(tracker.text_input, "Notes").value, "Unsaved notes")
        self.assertEqual(self.by_label(tracker.text_input, "Notes").key, note_key)
        self.assertIn(self.by_label(tracker.selectbox, "Country").value, (None, ""))
        self.assertEqual(storage.load_companies(), [{**existing, country["id"]: ""}])
        self.by_label(tracker.selectbox, "Country").set_value("US")
        self.save(tracker)
        self.assertEqual(storage.load_companies(), [{
            **existing, "company_name": "Draft 公司", "last_fetched_date": "2030-02-03",
            notes["id"]: "Unsaved notes", country["id"]: "US",
        }])

    def test_custom_company_widget_values_are_isolated_and_date_actions_and_delete_still_work(self) -> None:
        notes = storage.add_company_column("Notes")
        reviewed = storage.add_company_column("Reviewed", "checkbox")
        first = storage.create_company({
            "company_name": "First", notes["id"]: "First notes", reviewed["id"]: True,
        })
        second = storage.create_company({
            "company_name": "Second", notes["id"]: "Second notes", reviewed["id"]: False,
        })
        tracker = self.start()
        self.edit(tracker, first["id"])
        first_key = self.by_label(tracker.text_input, "Notes").key
        self.by_label(tracker.text_input, "Notes").set_value("First unsaved")
        self.by_label(tracker.checkbox, "Reviewed").uncheck()
        self.edit(tracker, second["id"])
        second_key = self.by_label(tracker.text_input, "Notes").key
        self.assertNotEqual(first_key, second_key)
        self.assertIn(first["id"], first_key)
        self.assertIn(second["id"], second_key)
        self.assertEqual(self.by_label(tracker.text_input, "Notes").value, "Second notes")
        self.assertFalse(self.by_label(tracker.checkbox, "Reviewed").value)
        self.by_label(tracker.text_input, "Notes").set_value("Second edited")
        self.by_label(tracker.checkbox, "Reviewed").check()
        self.by_label(tracker.button, "Today").click().run()
        self.assert_no_exception(tracker)
        self.assertEqual(self.by_label(tracker.date_input, "Last Fetched Date").value, date.today())
        self.assertEqual(self.by_label(tracker.text_input, "Notes").value, "Second edited")
        self.assertTrue(self.by_label(tracker.checkbox, "Reviewed").value)
        self.by_label(tracker.button, "Clear date").click().run()
        self.assertIsNone(self.by_label(tracker.date_input, "Last Fetched Date").value)
        self.save(tracker)
        records = {company["id"]: company for company in storage.load_companies()}
        self.assertEqual(records[first["id"]], first)
        self.assertEqual(records[second["id"]], {
            **second, notes["id"]: "Second edited", reviewed["id"]: True,
        })
        tracker.button(key="companies_delete").click().run()
        tracker.button(key="companies_confirm_delete").click().run()
        self.assert_no_exception(tracker)
        self.assertEqual(storage.load_companies(), [first])

    def test_column_and_company_save_errors_are_visible_without_success_or_data_loss(self) -> None:
        notes = storage.add_company_column("Notes")
        existing = storage.create_company({"company_name": "Existing", notes["id"]: "Saved"})
        tracker = self.start()
        tracker.button(key="companies_add_column").click().run()
        tracker.text_input(key="companies_column_name").set_value("Failed column")
        before = self.snapshot()
        with patch.object(self.app, "add_company_column", side_effect=OSError("disk unavailable")):
            tracker.button(key="companies_column_submit").click().run()
        self.assert_no_exception(tracker)
        self.assertTrue(any("disk unavailable" in error.value for error in tracker.error))
        self.assertFalse(tracker.success)
        self.assertEqual(tracker.text_input(key="companies_column_name").value, "Failed column")
        self.assertFalse(tracker.button(key="companies_column_submit").disabled)
        self.assertEqual(self.snapshot(), before)
        tracker.button(key="companies_column_cancel").click().run()
        self.edit(tracker, existing["id"])
        self.by_label(tracker.text_input, "Notes").set_value("Unsaved")
        with patch.object(self.app, "update_company", side_effect=OSError("disk unavailable")):
            self.save(tracker)
        self.assertTrue(any("disk unavailable" in error.value for error in tracker.error))
        self.assertFalse(tracker.success)
        self.assertEqual(self.by_label(tracker.text_input, "Notes").value, "Unsaved")
        self.assertEqual(self.snapshot(), before)

    def test_company_columns_leave_dashboard_job_fields_and_import_template_unchanged(self) -> None:
        settings = storage.load_settings()
        settings["custom_fields"] = [{
            "id": "job_only", "label": "Job-only detail", "type": "text",
            "options": [], "show_in_table": True, "order": 0, "active": True,
        }]
        storage.save_settings(settings)
        job = storage.create_job({
            "company": "Existing", "job_title": "Engineer", "status_id": "applied",
            "custom_fields": {"job_only": "Keep job value"},
        })
        self.company("Existing")
        jobs_before = storage.JOBS_FILE.read_bytes(), storage.JOBS_FILE.stat().st_mtime_ns
        template_before = self.app.build_import_template(storage.load_settings())
        tracker = self.start("dashboard")
        columns_before = list(tracker.dataframe[0].value.columns)
        self.assertIn("Job-only detail", columns_before)
        tracker.button(key="nav_companies").click().run()
        self.add_column(tracker, "Company-only detail")
        self.assertEqual(storage.load_settings()["custom_fields"], settings["custom_fields"])
        self.assertEqual(self.app.build_import_template(storage.load_settings()), template_before)
        self.assertEqual(storage.get_job_by_id(job["id"])["custom_fields"], {"job_only": "Keep job value"})
        self.assertEqual((storage.JOBS_FILE.read_bytes(), storage.JOBS_FILE.stat().st_mtime_ns), jobs_before)
        tracker.button(key="nav_dashboard").click().run()
        self.assert_no_exception(tracker)
        self.assertEqual(list(tracker.dataframe[0].value.columns), columns_before)
        tracker.button(key="nav_import_json").click().run()
        self.assert_no_exception(tracker)
        self.assertNotIn("Company-only detail", tracker.code[0].value)

    def test_rename_column_keeps_id_order_values_and_company_drafts_and_updates_all_views(self) -> None:
        notes = storage.add_company_column("Notes")
        country = storage.add_company_column("Country", "select", ["Taiwan", "US"])
        existing = storage.create_company({
            "company_name": "Original", "last_fetched_date": "2020-01-01",
            notes["id"]: "Saved notes", country["id"]: "Taiwan",
        })
        tracker = self.start()
        self.edit(tracker, existing["id"])
        notes_key = self.by_label(tracker.text_input, "Notes").key
        self.by_label(tracker.text_input, "Company Name *").set_value("Draft company")
        self.by_label(tracker.text_input, "Notes").set_value("Draft notes")
        self.manage_column(tracker, notes["id"])
        tracker.text_input(key="companies_column_name").set_value("  摘要 Notes  ")
        self.save_column(tracker)
        self.assertFalse(tracker.error)
        self.assertTrue(tracker.success)
        self.assertEqual(storage.load_company_columns(), [{**notes, "label": "摘要 Notes"}, country])
        self.assertEqual(storage.load_companies(), [existing])
        self.assertEqual(list(tracker.dataframe[0].value.columns), [
            "Company Name", "Last Fetched Date", "摘要 Notes", "Country",
        ])
        self.assertEqual(tracker.dataframe[0].value.iloc[0]["摘要 Notes"], "Saved notes")
        self.assertEqual(self.by_label(tracker.text_input, "Company Name *").value, "Draft company")
        self.assertEqual(self.by_label(tracker.text_input, "摘要 Notes").value, "Draft notes")
        self.assertEqual(self.by_label(tracker.text_input, "摘要 Notes").key, notes_key)
        self.save(tracker)
        self.assertEqual(storage.load_companies(), [{
            **existing, "company_name": "Draft company", notes["id"]: "Draft notes",
        }])
        reopened = self.start()
        self.edit(reopened, existing["id"])
        self.assertEqual(self.by_label(reopened.text_input, "摘要 Notes").value, "Draft notes")
        reopened.button(key="companies_add").click().run()
        self.assertEqual(self.by_label(reopened.text_input, "摘要 Notes").value, "")

    def test_column_type_edits_convert_saved_values_and_refresh_typed_inputs(self) -> None:
        fields = {label: storage.add_company_column(label) for label in ("Reminder", "Reviewed", "Country", "Notes")}
        first = storage.create_company({
            "company_name": "First", fields["Reminder"]["id"]: "2028-02-29",
            fields["Reviewed"]["id"]: "false", fields["Country"]["id"]: "US",
            fields["Notes"]["id"]: "Saved notes",
        })
        second = storage.create_company({"company_name": "Second"})
        tracker = self.start()
        self.edit(tracker, first["id"])
        notes_key = self.by_label(tracker.text_input, "Notes").key
        self.by_label(tracker.text_input, "Notes").set_value("Keep draft")
        for label, field_type in (("Reminder", "date"), ("Reviewed", "checkbox"), ("Country", "select")):
            with self.subTest(field_type=field_type):
                self.manage_column(tracker, fields[label]["id"])
                tracker.selectbox(key="companies_column_type").set_value(field_type).run()
                if field_type == "select":
                    tracker.text_area(key="companies_column_options").set_value("US\nTaiwan")
                self.save_column(tracker)
                self.assertFalse(tracker.error)
                self.assertEqual(self.by_label(tracker.text_input, "Notes").value, "Keep draft")
                self.assertEqual(self.by_label(tracker.text_input, "Notes").key, notes_key)
        records = {company["id"]: company for company in storage.load_companies()}
        self.assertEqual(records[first["id"]][fields["Reminder"]["id"]], "2028-02-29")
        self.assertIs(records[first["id"]][fields["Reviewed"]["id"]], False)
        self.assertEqual(records[first["id"]][fields["Country"]["id"]], "US")
        self.assertEqual(records[second["id"]][fields["Reminder"]["id"]], "")
        self.assertIs(records[second["id"]][fields["Reviewed"]["id"]], False)
        self.assertEqual(records[second["id"]][fields["Country"]["id"]], "")
        self.assertEqual(self.by_label(tracker.date_input, "Reminder").value, date(2028, 2, 29))
        self.assertFalse(self.by_label(tracker.checkbox, "Reviewed").value)
        self.assertEqual(self.by_label(tracker.selectbox, "Country").value, "US")
        self.by_label(tracker.checkbox, "Reviewed").check()
        self.save(tracker)
        reopened = self.start()
        self.edit(reopened, first["id"])
        self.assertEqual(self.by_label(reopened.date_input, "Reminder").value, date(2028, 2, 29))
        self.assertTrue(self.by_label(reopened.checkbox, "Reviewed").value)
        self.assertEqual(self.by_label(reopened.selectbox, "Country").value, "US")
        self.assertEqual(self.by_label(reopened.text_input, "Notes").value, "Keep draft")

    def test_invalid_column_edits_and_removing_used_select_options_do_not_change_storage(self) -> None:
        notes = storage.add_company_column("Notes")
        country = storage.add_company_column("Country", "select", ["US", "Taiwan"])
        self.company("Target")
        existing = storage.load_companies()[0]
        storage.update_company(existing["id"], {notes["id"]: "not a date", country["id"]: "US"})
        tracker = self.start()
        self.manage_column(tracker, notes["id"])
        before = self.snapshot()
        for label in (" ", "Company Name", "Last Fetched Date", "Country"):
            with self.subTest(label=label):
                tracker.text_input(key="companies_column_name").set_value(label)
                self.save_column(tracker)
                self.assertTrue(tracker.error)
                self.assertFalse(tracker.success)
                self.assertEqual(self.snapshot(), before)
        tracker.text_input(key="companies_column_name").set_value("Notes")
        tracker.selectbox(key="companies_column_type").set_value("date").run()
        self.save_column(tracker)
        self.assertTrue(tracker.error)
        self.assertEqual(self.snapshot(), before)
        tracker.selectbox(key="companies_column_type").set_value("checkbox").run()
        self.save_column(tracker)
        self.assertTrue(tracker.error)
        self.assertEqual(self.snapshot(), before)
        tracker.selectbox(key="companies_column_selected").set_value(country["id"]).run()
        tracker.text_area(key="companies_column_options").set_value("Taiwan")
        self.save_column(tracker)
        self.assertTrue(tracker.error)
        self.assertEqual(self.snapshot(), before)
        tracker.text_area(key="companies_column_options").set_value("   \n")
        self.save_column(tracker)
        self.assertTrue(tracker.error)
        self.assertEqual(self.snapshot(), before)
        tracker.text_area(key="companies_column_options").set_value(" Taiwan \nUS\nJapan\n\n")
        self.save_column(tracker)
        self.assertFalse(tracker.error)
        self.assertEqual(storage.load_company_columns()[1]["options"], ["Taiwan", "US", "Japan"])
        self.assertEqual(storage.load_companies()[0][country["id"]], "US")

    def test_manage_column_cancel_rerun_and_column_selection_do_not_save(self) -> None:
        notes = storage.add_company_column("Notes")
        country = storage.add_company_column("Country", "select", ["US", "Taiwan"])
        self.company()
        tracker = self.start()
        before = self.snapshot()
        self.manage_column(tracker, country["id"])
        self.assertEqual(tracker.text_input(key="companies_column_name").value, "Country")
        self.assertEqual(tracker.selectbox(key="companies_column_type").value, "select")
        tracker.text_input(key="companies_column_name").set_value("Unsaved country")
        tracker.text_area(key="companies_column_options").set_value("US\nJapan")
        tracker.run()
        self.assertEqual(tracker.text_input(key="companies_column_name").value, "Unsaved country")
        self.assertEqual(tracker.text_area(key="companies_column_options").value, "US\nJapan")
        tracker.selectbox(key="companies_column_type").set_value("checkbox").run()
        self.assertEqual(self.snapshot(), before)
        tracker.selectbox(key="companies_column_type").set_value("select").run()
        self.assertEqual(tracker.text_area(key="companies_column_options").value, "US\nJapan")
        self.assertEqual(self.snapshot(), before)
        tracker.button(key="companies_column_cancel").click().run()
        self.assert_no_exception(tracker)
        self.assertEqual(self.snapshot(), before)
        self.manage_column(tracker, country["id"])
        self.assertEqual(tracker.text_input(key="companies_column_name").value, "Country")
        self.assertEqual(tracker.selectbox(key="companies_column_type").value, "select")
        self.assertEqual(tracker.text_area(key="companies_column_options").value, "US\nTaiwan")
        tracker.selectbox(key="companies_column_selected").set_value(notes["id"]).run()
        self.assertEqual(tracker.text_input(key="companies_column_name").value, "Notes")
        self.assertEqual(tracker.selectbox(key="companies_column_type").value, "text")
        self.assertEqual(self.snapshot(), before)

    def test_delete_column_requires_confirmation_removes_csv_values_and_keeps_other_drafts(self) -> None:
        notes = storage.add_company_column("Notes")
        obsolete = storage.add_company_column("Obsolete", "checkbox")
        existing = storage.create_company({
            "company_name": "Existing", "last_fetched_date": "2025-03-04",
            notes["id"]: "Saved notes", obsolete["id"]: True,
        })
        tracker = self.start()
        self.edit(tracker, existing["id"])
        self.by_label(tracker.text_input, "Company Name *").set_value("Draft name")
        self.by_label(tracker.text_input, "Notes").set_value("Draft notes")
        self.manage_column(tracker, obsolete["id"])
        before = self.snapshot()
        tracker.button(key="companies_column_delete").click().run()
        self.assert_no_exception(tracker)
        self.assertTrue(tracker.warning)
        self.assertEqual(self.snapshot(), before)
        tracker.run()
        self.assertEqual(self.snapshot(), before)
        tracker.button(key="companies_column_cancel_delete").click().run()
        self.assertEqual(self.snapshot(), before)
        tracker.button(key="companies_column_delete").click().run()
        tracker.button(key="companies_column_confirm_delete").click().run()
        self.assert_no_exception(tracker)
        self.assertFalse(tracker.error)
        self.assertTrue(tracker.success)
        self.assertEqual(storage.load_company_columns(), [notes])
        expected = {key: value for key, value in existing.items() if key != obsolete["id"]}
        self.assertEqual(storage.load_companies(), [expected])
        with self.companies_file.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            self.assertEqual(reader.fieldnames, ["id", "company_name", "last_fetched_date", notes["id"]])
            self.assertEqual(list(reader)[0][notes["id"]], "Saved notes")
        self.assertEqual(self.by_label(tracker.text_input, "Company Name *").value, "Draft name")
        self.assertEqual(self.by_label(tracker.text_input, "Notes").value, "Draft notes")
        self.assertNotIn("Obsolete", list(tracker.dataframe[0].value.columns))
        self.assertFalse(any(element.label == "Obsolete" for element in tracker.checkbox))
        self.save(tracker)
        reopened = self.start()
        self.edit(reopened, existing["id"])
        self.assertEqual(self.by_label(reopened.text_input, "Notes").value, "Draft notes")
        self.assertNotIn("Obsolete", list(reopened.dataframe[0].value.columns))
        self.assertEqual(storage.load_companies(), [{
            **expected, "company_name": "Draft name", notes["id"]: "Draft notes",
        }])

    def test_column_update_and_delete_failures_show_error_and_preserve_storage(self) -> None:
        notes = storage.add_company_column("Notes")
        self.company()
        tracker = self.start()
        self.manage_column(tracker, notes["id"])
        tracker.text_input(key="companies_column_name").set_value("New name")
        before = self.snapshot()
        with patch.object(self.app, "update_company_column", side_effect=OSError("disk unavailable")):
            self.save_column(tracker)
        self.assertTrue(any("disk unavailable" in error.value for error in tracker.error))
        self.assertFalse(tracker.success)
        self.assertEqual(tracker.text_input(key="companies_column_name").value, "New name")
        self.assertEqual(self.snapshot(), before)
        tracker.button(key="companies_column_delete").click().run()
        with patch.object(self.app, "delete_company_column", side_effect=OSError("disk unavailable")):
            tracker.button(key="companies_column_confirm_delete").click().run()
        self.assert_no_exception(tracker)
        self.assertTrue(any("disk unavailable" in error.value for error in tracker.error))
        self.assertFalse(tracker.success)
        self.assertEqual(self.snapshot(), before)


if __name__ == "__main__":
    unittest.main()
