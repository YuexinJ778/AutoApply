"""Calendar/navigation AppTests; all persisted fixtures live in temporary folders.

The bundled calendar component is mocked at its Python boundary. These tests
exercise Streamlit callbacks and navigation, not browser rendering of FullCalendar.
"""

from __future__ import annotations

import copy
import importlib
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from streamlit.testing.v1 import AppTest

import storage


class CalendarUITests(unittest.TestCase):
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
        storage.save_settings({**settings, "local_timezone": "America/New_York"})
        self.app = importlib.import_module("app")
        self.component_payload: dict = {}
        self.component_calls: list[dict] = []

        def component(**kwargs):
            self.component_calls.append(copy.deepcopy(kwargs))
            return copy.deepcopy(self.component_payload)

        patcher = patch.object(self.app, "render_calendar", side_effect=component)
        self.component = patcher.start()
        self.addCleanup(patcher.stop)
        browser_timezone = patch.object(self.app, "_read_browser_timezone", return_value=None)
        self.browser_timezone = browser_timezone.start()
        self.addCleanup(browser_timezone.stop)
        compiler = patch.object(self.app, "compile_resume_latex")
        self.compiler = compiler.start()
        self.addCleanup(compiler.stop)

    @staticmethod
    def job_data(**updates) -> dict:
        return {
            "company": "Same Company", "job_title": "Same Title",
            "applied_date": "2026-10-06", "status_id": "applied",
            "email": "private-email@example.com", "account": "private-account",
            "password": "private-secret", "custom_fields": {"secret_field": "private-custom-value"},
            **updates,
        }

    @staticmethod
    def reminder_data(**updates) -> dict:
        return {
            "title": "Recruiter call", "kind": "interview",
            "start_at": "2026-10-06T14:00:00-04:00", "timezone": "America/New_York",
            **updates,
        }

    @staticmethod
    def by_label(elements, label):
        return next(element for element in elements if element.label == label)

    def assert_no_exception(self, at: AppTest) -> None:
        self.assertEqual([item.message for item in at.exception], [])

    def start(self, page="calendar", job_id=None) -> AppTest:
        at = AppTest.from_string("import app\napp.main()", default_timeout=15)
        at.session_state["page"] = page
        at.session_state["calendar_anchor"] = date(2026, 1, 31)
        if job_id:
            at.session_state["selected_job_id"] = job_id
        at.run()
        self.assert_no_exception(at)
        return at

    def snapshot(self) -> dict:
        return {
            str(path.relative_to(self.root)): (path.read_bytes(), path.stat().st_mtime_ns)
            for path in self.root.rglob("*") if path.is_file()
        }

    def click_event(self, at: AppTest, event_id: str) -> None:
        self.component_payload = {"callback": "eventClick", "eventClick": {"event": {"id": event_id}}}
        at.run()
        self.assert_no_exception(at)

    def test_empty_calendar_navigation_view_and_stable_rerun_state(self) -> None:
        at = self.start()
        self.assertEqual(self.component_calls[-1]["events"], [])
        self.assertTrue(any("No events to display" in item.value for item in at.info))
        self.assertEqual(self.component_calls[-1]["options"]["initialView"], "dayGridMonth")
        original_key = self.component_calls[-1]["key"]
        at.run()
        self.assertEqual(self.component_calls[-1]["key"], original_key)
        self.by_label(at.button, "Next").click().run()
        self.assertEqual(at.session_state["calendar_anchor"], date(2026, 2, 1))
        navigated_key = self.component_calls[-1]["key"]
        self.assertNotEqual(navigated_key, original_key)
        at.checkbox(key="calendar_show_applications_widget").uncheck().run()
        at.button(key="calendar_refresh").click().run()
        self.assertEqual(self.component_calls[-1]["key"], navigated_key)
        self.assertEqual(self.component_calls[-1]["options"]["initialDate"], "2026-02-01")
        at.selectbox(key="calendar_view_picker").set_value("Week").run()
        self.by_label(at.button, "Next").click().run()
        self.assertEqual(at.session_state["calendar_anchor"], date(2026, 2, 8))
        self.assertEqual(self.component_calls[-1]["options"]["initialView"], "timeGridWeek")
        at.button(key="nav_dashboard").click().run()
        at.button(key="nav_calendar").click().run()
        self.assert_no_exception(at)
        self.assertEqual(at.session_state["calendar_anchor"], date(2026, 2, 8))
        self.assertEqual(at.session_state["calendar_view"], "Week")
        self.assertFalse(at.checkbox(key="calendar_show_applications_widget").value)
        at.selectbox(key="calendar_view_picker").set_value("List").run()
        self.by_label(at.button, "Previous").click().run()
        self.assertEqual(self.component_calls[-1]["options"]["initialView"], "listMonth")
        self.assertEqual(at.session_state["calendar_anchor"], date(2026, 1, 1))
        self.assert_no_exception(at)

    def test_event_click_selects_then_explicit_open_uses_uuid_despite_same_titles(self) -> None:
        first = storage.create_job(self.job_data())
        target = storage.create_job(self.job_data())
        at = self.start()
        event_id = f"application:{target['id']}"
        self.click_event(at, event_id)
        self.assertEqual(at.session_state["page"], "calendar")
        self.assertEqual(at.session_state["calendar_selected_event"], event_id)
        self.assertEqual(at.session_state["calendar_selected_day"], date(2026, 10, 6))
        at.run()  # The retained callback must not perform navigation.
        self.assertEqual(at.session_state["page"], "calendar")
        at.button(key="calendar_detail_open").click().run()
        self.assert_no_exception(at)
        self.assertEqual(at.session_state["page"], "job_detail")
        self.assertEqual(at.session_state["selected_job_id"], target["id"])
        self.assertNotEqual(at.session_state["selected_job_id"], first["id"])
        self.assertEqual(at.session_state[f"job_tabs_{target['id']}"], "Details")
        at.button(key="nav_calendar").click().run()
        self.assertEqual(at.session_state["page"], "calendar")
        self.assertEqual(at.session_state["calendar_selected_event"], event_id)

    def test_view_in_calendar_uses_display_date_and_returns_to_reminders_tab(self) -> None:
        job = storage.create_job(self.job_data())
        reminder = storage.create_reminder(job["id"], self.reminder_data(
            start_at="2026-10-07T00:30:00+09:00", timezone="Asia/Tokyo", status="completed",
        ))
        at = self.start("job_detail", job["id"])
        at.button(key=f"reminder_{job['id']}_{reminder['id']}_calendar").click().run()
        self.assert_no_exception(at)
        self.assertEqual(at.session_state["page"], "calendar")
        self.assertEqual(at.session_state["calendar_anchor"], date(2026, 10, 6))
        self.assertEqual(at.session_state["calendar_selected_day"], date(2026, 10, 6))
        self.assertEqual(at.session_state["calendar_selected_event"], f"reminder:{job['id']}:{reminder['id']}")
        self.assertTrue(at.checkbox(key="calendar_show_inactive_widget").value)
        self.assertTrue(any("Asia/Tokyo" in item.value for item in at.text))
        at.button(key="calendar_detail_open").click().run()
        self.assert_no_exception(at)
        self.assertEqual(at.session_state["selected_job_id"], job["id"])
        self.assertEqual(at.session_state[f"job_tabs_{job['id']}"], "Reminders")

    def test_calendar_independent_of_dashboard_rejected_archived_filters(self) -> None:
        active = storage.create_job(self.job_data())
        rejected = storage.create_job(self.job_data(status_id="rejected"))
        archived = storage.create_job(self.job_data(status_id="rejected", archived=True))
        scheduled = storage.create_reminder(rejected["id"], self.reminder_data())
        completed = storage.create_reminder(archived["id"], self.reminder_data(status="completed"))
        at = self.start("dashboard")
        self.assertEqual(set(at.session_state["dashboard_visible_job_ids"]), {active["id"]})
        counts = [(item.label, item.value) for item in at.metric]
        before = self.snapshot()
        at.button(key="nav_calendar").click().run()
        ids = {event["id"] for event in self.component_calls[-1]["events"]}
        self.assertEqual(ids, {
            f"application:{active['id']}", f"application:{rejected['id']}", f"application:{archived['id']}",
            f"reminder:{rejected['id']}:{scheduled['id']}",
        })
        at.checkbox(key="calendar_show_inactive_widget").check().run()
        ids = {event["id"] for event in self.component_calls[-1]["events"]}
        self.assertIn(f"reminder:{archived['id']}:{completed['id']}", ids)
        self.click_event(at, f"application:{archived['id']}")
        self.assertTrue(any("Rejected" in item.value and "Archived" in item.value for item in at.caption))
        at.button(key="nav_dashboard").click().run()
        self.assertEqual(set(at.session_state["dashboard_visible_job_ids"]), {active["id"]})
        self.assertEqual([(item.label, item.value) for item in at.metric], counts)
        self.assertEqual(self.snapshot(), before)

    def test_corrupt_one_job_warns_without_hiding_other_job_events(self) -> None:
        broken = storage.create_job(self.job_data(company="Broken"))
        good = storage.create_job(self.job_data(company="Good"))
        storage.create_reminder(broken["id"], self.reminder_data())
        reminder = storage.create_reminder(good["id"], self.reminder_data())
        bad_path = storage.get_job_directory(broken["id"]) / "reminders.json"
        bad_path.write_text("{broken", encoding="utf-8")
        before = self.snapshot()
        at = self.start()
        ids = {event["id"] for event in self.component_calls[-1]["events"]}
        self.assertEqual(ids, {
            f"application:{broken['id']}", f"application:{good['id']}",
            f"reminder:{good['id']}:{reminder['id']}",
        })
        self.assertTrue(any("Broken" in item.value and "unavailable" in item.value for item in at.warning))
        self.assertEqual(self.snapshot(), before)

    def test_refresh_rereads_edits_clear_delete_and_job_delete_without_remount(self) -> None:
        job = storage.create_job(self.job_data())
        reminder = storage.create_reminder(job["id"], self.reminder_data())
        at = self.start()
        component_key = self.component_calls[-1]["key"]
        event_id = f"reminder:{job['id']}:{reminder['id']}"
        self.click_event(at, event_id)
        storage.update_job(job["id"], {"company": "Updated Company", "applied_date": "2026-10-08"})
        storage.update_reminder(job["id"], reminder["id"], {
            "title": "Revised call", "start_at": "2026-10-09T14:00:00-04:00", "notes": "Latest notes",
        })
        at.button(key="calendar_refresh").click().run()
        self.assert_no_exception(at)
        events = {event["id"]: event for event in self.component_calls[-1]["events"]}
        self.assertEqual(events[f"application:{job['id']}"]["start"], "2026-10-08")
        self.assertIn("Updated Company", events[f"application:{job['id']}"]["title"])
        self.assertIn("Revised call", events[event_id]["title"])
        self.assertEqual(events[event_id]["start"], "2026-10-09T14:00:00-04:00")
        self.assertTrue(any("Latest notes" == item.value for item in at.text))
        self.assertEqual(self.component_calls[-1]["key"], component_key)
        storage.update_job(job["id"], {"applied_date": ""})
        at.button(key="calendar_refresh").click().run()
        self.assertEqual([event["id"] for event in self.component_calls[-1]["events"]], [event_id])
        storage.delete_reminder(job["id"], reminder["id"])
        at.button(key="calendar_refresh").click().run()
        self.assertEqual(self.component_calls[-1]["events"], [])
        storage.create_reminder(job["id"], self.reminder_data())
        storage.delete_job(job["id"])
        at.button(key="calendar_refresh").click().run()
        self.assert_no_exception(at)
        self.assertEqual(self.component_calls[-1]["events"], [])

    def test_date_callback_uses_local_day_and_all_events_are_visible(self) -> None:
        first = storage.create_job(self.job_data())
        second = storage.create_job(self.job_data())
        late = storage.create_reminder(first["id"], self.reminder_data(title="Late", start_at="2026-10-06T22:30:00-04:00"))
        early = storage.create_reminder(second["id"], self.reminder_data(title="Early"))
        at = self.start()
        self.click_event(at, f"application:{first['id']}")
        self.component_payload = {"callback": "dateClick", "dateClick": {"date": "2026-10-07T02:00:00.000Z", "allDay": False}}
        at.run()
        self.assert_no_exception(at)
        self.assertEqual(at.session_state["calendar_selected_day"], date(2026, 10, 6))
        self.assertNotIn("calendar_selected_event", at.session_state)
        buttons = [item.key for item in at.button if item.key and item.key.startswith("calendar_day_")]
        self.assertEqual(len(buttons), 4)
        self.assertLess(buttons.index(f"calendar_day_reminder:{second['id']}:{early['id']}"), buttons.index(f"calendar_day_reminder:{first['id']}:{late['id']}"))
        self.assertEqual(sum("All day ·" in item.value for item in at.text), 2)

    def test_component_payload_is_minimal_and_unsupported_callbacks_do_not_write(self) -> None:
        job = storage.create_job(self.job_data())
        storage.create_reminder(job["id"], self.reminder_data(notes="Detailed private notes", location_or_url="https://meeting.example/private"))
        before = self.snapshot()
        at = self.start()
        args = self.component_calls[-1]
        serialized = json.dumps(args["events"])
        for private in ("private-email@example.com", "private-account", "private-secret", "private-custom-value", "Detailed private notes", "https://meeting.example/private"):
            self.assertNotIn(private, serialized)
        for event in args["events"]:
            self.assertTrue(set(event["extendedProps"]) <= {"job_id", "reminder_id", "kind", "status", "source"})
        self.assertFalse(args["options"]["editable"])
        self.assertFalse(args["options"]["eventStartEditable"])
        self.assertFalse(args["options"]["eventDurationEditable"])
        self.assertEqual(args["callbacks"], ["dateClick", "eventClick"])
        for payload in (
            {"callback": "eventsSet", "eventsSet": {"events": [{"id": "untrusted"}]}},
            {"callback": "eventClick", "eventClick": {"event": {"id": "application:not-a-job"}}},
            {"callback": "dateClick", "dateClick": {"date": "bad"}},
        ):
            self.component_payload = payload
            at.run()
            self.assert_no_exception(at)
            self.assertEqual(at.session_state["page"], "calendar")
            self.assertEqual(self.snapshot(), before)
        self.compiler.assert_not_called()

    def test_navigation_preserves_unsaved_latex_and_never_compiles_or_changes_files(self) -> None:
        job = storage.create_job(self.job_data())
        job_id = job["id"]
        tex = storage.get_job_directory(job_id) / "resume.tex"
        tex.write_text("disk source", encoding="utf-8")
        storage.add_uploaded_pdf_version(job_id, b"%PDF-1.7\nsaved PDF\n%%EOF\n", "Saved", "saved.pdf")
        storage.add_attachments(job_id, [("keep.txt", b"attachment sentinel")])
        reminder = storage.create_reminder(job_id, self.reminder_data())
        at = self.start("job_detail", job_id)
        before = self.snapshot()
        draft = "unsaved draft\n\\section{保持草稿} trailing spaces  \n"
        at.text_area(key=f"resume_tex_editor_{job_id}").set_value(draft)
        at.button(key="nav_calendar").click().run()
        self.assert_no_exception(at)
        self.assertEqual(at.session_state[f"resume_tex_draft_{job_id}"], draft)
        self.by_label(at.button, "Next").click().run()
        at.checkbox(key="calendar_show_applications_widget").uncheck().run()
        at.button(key="calendar_refresh").click().run()
        self.click_event(at, f"reminder:{job_id}:{reminder['id']}")
        at.button(key="calendar_detail_open").click().run()
        self.assert_no_exception(at)
        self.assertEqual(at.text_area(key=f"resume_tex_editor_{job_id}").value, draft)
        self.assertEqual(at.session_state[f"resume_tex_draft_{job_id}"], draft)
        self.assertEqual(self.snapshot(), before)
        self.compiler.assert_not_called()

    def test_browser_timezone_controls_clicks_day_list_and_view_in_calendar(self) -> None:
        self.browser_timezone.return_value = "America/Los_Angeles"
        job = storage.create_job(self.job_data())
        reminder = storage.create_reminder(job["id"], self.reminder_data(
            start_at="2026-10-06T01:30:00-04:00",
        ))
        later = storage.create_reminder(job["id"], self.reminder_data(
            title="Next browser day", start_at="2026-10-06T14:00:00-04:00",
        ))
        event_id = f"reminder:{job['id']}:{reminder['id']}"
        # Existing resume behavior initializes a library index on its first
        # visit. Establish that fixture before checking navigation-only writes.
        storage.list_pdf_versions(job["id"])
        before = self.snapshot()
        at = self.start()
        self.assertEqual(at.session_state["calendar_display_timezone"], "America/Los_Angeles")
        self.assertTrue(any("America/Los_Angeles" in item.value and "America/New_York" in item.value for item in at.info))
        self.click_event(at, event_id)
        self.assertEqual(at.session_state["calendar_selected_day"], date(2026, 10, 5))
        daily_keys = [item.key for item in at.button if item.key and item.key.startswith("calendar_day_")]
        self.assertEqual(daily_keys, [f"calendar_day_{event_id}"])
        self.assertNotIn(f"calendar_day_reminder:{job['id']}:{later['id']}", daily_keys)
        self.assertTrue(any("Local: 2026-10-05 22:30-07:00" in item.value for item in at.text))
        self.assertTrue(any("Original appointment: 2026-10-06T01:30:00-04:00 (America/New_York)" in item.value for item in at.text))
        self.component_payload = {"callback": "dateClick", "dateClick": {"date": "2026-10-06T06:00:00.000Z", "allDay": False}}
        at.run()
        self.assert_no_exception(at)
        self.assertEqual(at.session_state["calendar_selected_day"], date(2026, 10, 5))
        self.assertNotIn("calendar_selected_event", at.session_state)
        self.click_event(at, event_id)
        at.button(key="calendar_detail_open").click().run()
        self.assert_no_exception(at)
        self.component_payload = {}  # A remounted calendar has no retained click.
        at.button(key=f"reminder_{job['id']}_{reminder['id']}_calendar").click().run()
        self.assert_no_exception(at)
        self.assertEqual(at.session_state["calendar_anchor"], date(2026, 10, 5))
        self.assertEqual(at.session_state["calendar_selected_day"], date(2026, 10, 5))
        self.assertEqual(at.session_state["calendar_selected_event"], event_id)
        self.assertEqual(self.component_calls[-1]["options"]["initialDate"], "2026-10-05")
        self.assertEqual(self.snapshot(), before)

    def test_late_browser_timezone_repositions_the_focused_reminder(self) -> None:
        job = storage.create_job(self.job_data())
        reminder = storage.create_reminder(job["id"], self.reminder_data(start_at="2026-10-06T01:30:00-04:00"))
        at = self.start("job_detail", job["id"])
        at.button(key=f"reminder_{job['id']}_{reminder['id']}_calendar").click().run()
        self.assertEqual(at.session_state["calendar_anchor"], date(2026, 10, 6))
        initial_key = self.component_calls[-1]["key"]
        self.browser_timezone.return_value = "America/Los_Angeles"
        at.run()
        self.assert_no_exception(at)
        self.assertEqual(at.session_state["calendar_display_timezone"], "America/Los_Angeles")
        self.assertEqual(at.session_state["calendar_anchor"], date(2026, 10, 5))
        self.assertEqual(at.session_state["calendar_selected_day"], date(2026, 10, 5))
        self.assertEqual(at.session_state["calendar_selected_event"], f"reminder:{job['id']}:{reminder['id']}")
        self.assertNotEqual(self.component_calls[-1]["key"], initial_key)
        settled_key = self.component_calls[-1]["key"]
        at.run()
        self.assertEqual(self.component_calls[-1]["key"], settled_key)

    def test_details_selection_allows_reclicking_same_prior_component_event(self) -> None:
        first = storage.create_job(self.job_data(company="First"))
        second = storage.create_job(self.job_data(company="Second"))
        first_id = f"application:{first['id']}"
        second_id = f"application:{second['id']}"
        last_key = None

        def fresh_component_on_remount(**kwargs):
            nonlocal last_key
            self.component_calls.append(copy.deepcopy(kwargs))
            changed = kwargs["key"] != last_key
            last_key = kwargs["key"]
            return {} if changed else copy.deepcopy(self.component_payload)

        self.component.side_effect = fresh_component_on_remount
        at = self.start()
        at.selectbox(key="calendar_view_picker").set_value("Week").run()
        self.click_event(at, first_id)
        self.assertEqual(at.session_state["calendar_selected_event"], first_id)
        old_key = self.component_calls[-1]["key"]
        old_anchor = at.session_state["calendar_anchor"]
        at.button(key=f"calendar_day_{second_id}").click().run()
        self.assert_no_exception(at)
        self.assertEqual(at.session_state["calendar_selected_event"], second_id)
        self.assertNotEqual(self.component_calls[-1]["key"], old_key)
        self.assertEqual(at.session_state["calendar_anchor"], old_anchor)
        self.assertEqual(at.session_state["calendar_view"], "Week")
        self.assertEqual(at.session_state["page"], "calendar")
        # FullCalendar can now emit precisely the same event A payload again.
        self.click_event(at, first_id)
        self.assertEqual(at.session_state["calendar_selected_event"], first_id)
        self.assertEqual(at.session_state["page"], "calendar")
        at.button(key="calendar_detail_open").click().run()
        self.assert_no_exception(at)
        self.assertEqual(at.session_state["selected_job_id"], first["id"])

    def test_missing_or_invalid_timezone_requires_settings_without_guessing(self) -> None:
        for configured in (None, "Not/A_Timezone"):
            with self.subTest(configured=configured):
                settings = storage.load_settings()
                settings.pop("local_timezone", None)
                if configured is not None:
                    settings["local_timezone"] = configured
                storage.save_settings(settings)
                before = self.snapshot()
                self.component.reset_mock()
                with patch.object(self.app, "detect_local_timezone", return_value=None):
                    at = self.start()
                    self.assertTrue(any("could not be determined" in item.value for item in at.warning))
                    self.component.assert_not_called()
                    self.assertNotIn("calendar_display_timezone", at.session_state)
                    self.assertEqual(self.snapshot(), before)
                    at.button(key="calendar_timezone_settings").click().run()
                    self.assert_no_exception(at)
                    self.assertEqual(at.session_state["page"], "settings")

    def test_invalid_browser_zone_falls_back_to_confirmed_zone_and_settings_reject_invalid_entry(self) -> None:
        self.browser_timezone.return_value = "Invalid/Browser_Zone"
        at = self.start()
        self.assertEqual(at.session_state["calendar_display_timezone"], "America/New_York")
        at.button(key="nav_settings").click().run()
        before = self.snapshot()
        at.text_input(key="local_timezone_input").set_value("Not/A_Real_Zone")
        self.by_label(at.checkbox, "I confirm this matches my computer and browser's local time zone").check()
        self.by_label(at.button, "Save Time Zone").click().run()
        self.assert_no_exception(at)
        self.assertTrue(any("valid IANA time zone" in item.value for item in at.error))
        self.assertEqual(self.snapshot(), before)


if __name__ == "__main__":
    unittest.main()
