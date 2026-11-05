"""Calendar conversion and timezone boundaries using only in-memory fixtures."""

from __future__ import annotations

import copy
from datetime import date, datetime, time, timezone
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

import calendar_utils as cal


class CalendarUtilsTests(unittest.TestCase):
    def job(self, job_id="job-one", **overrides):
        result = {
            "id": job_id, "company": "Company", "job_title": "Engineer",
            "applied_date": "2026-10-06", "status_id": "rejected", "archived": True,
            "account": "private account", "password": "private password",
        }
        result.update(overrides)
        return result

    def reminder(self, reminder_id="reminder-one", **overrides):
        result = {
            "id": reminder_id, "title": "Interview", "kind": "interview",
            "start_at": "2026-10-06T14:00:00-04:00", "end_at": None,
            "timezone": "America/New_York", "status": "scheduled",
            "location_or_url": "https://example.test/meeting", "notes": "Private notes",
        }
        result.update(overrides)
        return result

    def test_existing_applications_share_date_without_id_collisions(self):
        events, issues = cal.build_calendar_events([self.job(), self.job("job-two")], {})
        self.assertEqual(issues, [])
        self.assertEqual([event["start"] for event in events], ["2026-10-06"] * 2)
        self.assertEqual({event["id"] for event in events}, {"application:job-one", "application:job-two"})
        self.assertTrue(all(event["allDay"] for event in events))
        self.assertTrue(all("end" not in event for event in events))

    def test_date_and_title_are_derived_from_current_job_each_time(self):
        job = self.job()
        original, _ = cal.build_calendar_events([job], {})
        job.update(applied_date="2027-01-01", company="Updated", job_title="New role")
        changed, _ = cal.build_calendar_events([job], {})
        self.assertEqual(len(changed), 1)
        self.assertEqual(changed[0]["id"], original[0]["id"])
        self.assertEqual(changed[0]["start"], "2027-01-01")
        self.assertEqual(changed[0]["title"], "[Applied] Updated — New role")
        job["applied_date"] = ""
        self.assertEqual(cal.build_calendar_events([job], {}), ([], []))

    def test_missing_date_never_falls_back_to_creation_or_today(self):
        for applied in (None, ""):
            events, issues = cal.build_calendar_events([
                self.job(applied_date=applied, created_at="2026-10-06T12:00:00Z")
            ], {})
            self.assertEqual((events, issues), ([], []))
        job = self.job()
        del job["applied_date"]
        self.assertEqual(cal.build_calendar_events([job], {}), ([], []))

    def test_invalid_dates_warn_without_hiding_valid_jobs_or_reminders(self):
        for invalid in ("2026-02-30", "20261006", "2026-W41-2", "2026-10-06T00:00:00Z", 123):
            with self.subTest(invalid=invalid):
                events, issues = cal.build_calendar_events(
                    [self.job(applied_date=invalid), self.job("job-two")],
                    {"job-one": [self.reminder()]},
                )
                self.assertEqual(len(issues), 1)
                self.assertEqual({item["id"] for item in events}, {
                    "reminder:job-one:reminder-one", "application:job-two",
                })

    def test_all_day_dates_do_not_shift_between_timezones(self):
        events, _ = cal.build_calendar_events([self.job()], {})
        for zone in ("Pacific/Kiritimati", "America/Los_Angeles", "Asia/Taipei", "UTC"):
            self.assertEqual(cal.event_local_date(events[0], zone), date(2026, 10, 6))
            self.assertEqual(cal.events_for_day(events, date(2026, 10, 6), zone), events)

    def test_reminders_rebuild_with_stable_ids_without_mutating_sources(self):
        jobs = [self.job()]
        reminders = {"job-one": [self.reminder(), self.reminder("reminder-two")]}
        snapshot = copy.deepcopy((jobs, reminders))
        first, issues = cal.build_calendar_events(jobs, reminders)
        self.assertEqual(issues, [])
        self.assertEqual(cal.build_calendar_events(jobs, reminders)[0], first)
        self.assertEqual((jobs, reminders), snapshot)
        reminders["job-one"][0].update(title="Changed title", start_at="2026-10-07T16:00:00-04:00")
        revised, _ = cal.build_calendar_events(jobs, reminders)
        self.assertEqual({event["id"] for event in first}, {event["id"] for event in revised})
        event = next(event for event in revised if event["id"] == "reminder:job-one:reminder-one")
        self.assertIn("Changed title", event["title"])
        self.assertEqual(event["start"], "2026-10-07T16:00:00-04:00")

    def test_only_current_jobs_produce_events_no_orphans(self):
        reminders = {"job-one": [self.reminder()], "deleted-job": [self.reminder()]}
        events, _ = cal.build_calendar_events([self.job()], reminders)
        self.assertEqual({event["extendedProps"]["job_id"] for event in events}, {"job-one"})
        self.assertEqual(cal.build_calendar_events([], reminders), ([], []))

    def test_rejected_and_archived_jobs_are_included_and_filters_do_not_mutate(self):
        jobs = [self.job()]
        reminders = {"job-one": [self.reminder(), self.reminder("done", status="completed"), self.reminder("cancelled", status="cancelled")]}
        before = copy.deepcopy((jobs, reminders))
        self.assertEqual(len(cal.build_calendar_events(jobs, reminders)[0]), 2)
        self.assertEqual(len(cal.build_calendar_events(jobs, reminders, show_inactive=True)[0]), 4)
        self.assertEqual(len(cal.build_calendar_events(jobs, reminders, show_applications=False)[0]), 1)
        self.assertEqual(len(cal.build_calendar_events(jobs, reminders, show_reminders=False)[0]), 1)
        self.assertEqual((jobs, reminders), before)

    def test_event_payload_does_not_include_job_secrets_or_reminder_details(self):
        events, _ = cal.build_calendar_events([self.job()], {"job-one": [self.reminder()]})
        payload = repr(events)
        for private in ("private account", "private password", "Private notes", "example.test"):
            self.assertNotIn(private, payload)
        for event in events:
            self.assertLessEqual(set(event["extendedProps"]), {"job_id", "reminder_id", "kind"})

    def test_point_deadline_has_no_invented_end(self):
        events, _ = cal.build_calendar_events([self.job(applied_date="")], {
            "job-one": [self.reminder(kind="deadline", title="Due")],
        })
        self.assertNotIn("end", events[0])
        self.assertFalse(events[0]["allDay"])
        self.assertTrue(events[0]["title"].startswith("[Deadline]"))
        self.assertIsNotNone(cal.parse_aware_datetime(events[0]["start"]).utcoffset())

    def test_invalid_reminder_does_not_hide_other_reminders(self):
        for invalid in (
            {"start_at": "2026-10-06T14:00:00"},
            {"end_at": "2026-10-06T13:00:00-04:00"},
            {"kind": "unknown"}, {"status": "unknown"}, {"id": ""},
        ):
            with self.subTest(invalid=invalid):
                events, issues = cal.build_calendar_events([self.job(applied_date="")], {
                    "job-one": [self.reminder(**invalid), self.reminder("valid")],
                })
                self.assertEqual(len(issues), 1)
                self.assertEqual([event["id"] for event in events], ["reminder:job-one:valid"])

    def test_callback_timestamp_uses_display_zone_and_date_only_is_preserved(self):
        self.assertEqual(cal.calendar_date("2026-10-07T02:30:00Z", "America/New_York"), date(2026, 10, 6))
        self.assertEqual(cal.calendar_date("2026-10-07", "America/New_York"), date(2026, 10, 7))
        with self.assertRaises(ValueError):
            cal.calendar_date("2026-10-07T02:30:00", "America/New_York")

    def test_cross_day_events_include_both_days_and_exclude_midnight_end(self):
        reminders = {"job-one": [self.reminder(
            start_at="2026-10-06T23:30:00-04:00", end_at="2026-10-08T00:00:00-04:00",
        )]}
        events, _ = cal.build_calendar_events([self.job(applied_date="")], reminders)
        self.assertEqual(len(cal.events_for_day(events, date(2026, 10, 6), "America/New_York")), 1)
        self.assertEqual(len(cal.events_for_day(events, date(2026, 10, 7), "America/New_York")), 1)
        self.assertEqual(cal.events_for_day(events, date(2026, 10, 8), "America/New_York"), [])

    def test_local_day_list_is_all_day_then_actual_time_order(self):
        reminders = {"job-one": [
            self.reminder("late", start_at="2026-10-07T02:00:00Z"),
            self.reminder("early", start_at="2026-10-06T10:00:00-04:00"),
        ]}
        events, _ = cal.build_calendar_events([self.job()], reminders)
        selected = cal.events_for_day(events, date(2026, 10, 6), "America/New_York")
        self.assertEqual([event["id"] for event in selected], [
            "application:job-one", "reminder:job-one:early", "reminder:job-one:late",
        ])

    def test_dst_date_rules_determine_offset_instead_of_current_offset(self):
        winter = cal.resolve_local_datetime(date(2026, 1, 6), time(14), "America/New_York")
        summer = cal.resolve_local_datetime(date(2026, 7, 6), time(14), "America/New_York")
        self.assertTrue(winter.isoformat().endswith("-05:00"))
        self.assertTrue(summer.isoformat().endswith("-04:00"))

    def test_nonexistent_time_is_rejected_instead_of_shifted(self):
        self.assertEqual(cal.local_time_options(date(2026, 3, 8), time(2, 30), "America/New_York"), [])
        with self.assertRaises(cal.NonexistentTimeError):
            cal.resolve_local_datetime(date(2026, 3, 8), time(2, 30), "America/New_York")

    def test_repeated_time_requires_choice_and_preserves_selected_instant(self):
        with self.assertRaises(cal.AmbiguousTimeError):
            cal.resolve_local_datetime(date(2026, 11, 1), time(1, 30), "America/New_York")
        first = cal.resolve_local_datetime(date(2026, 11, 1), time(1, 30), "America/New_York", fold=0)
        second = cal.resolve_local_datetime(date(2026, 11, 1), time(1, 30), "America/New_York", fold=1)
        self.assertTrue(first.isoformat().endswith("-04:00"))
        self.assertTrue(second.isoformat().endswith("-05:00"))
        self.assertEqual(second.timestamp() - first.timestamp(), 3600)

    def test_no_dst_zone_has_one_option_not_two(self):
        options = cal.local_time_options(date(2026, 11, 1), time(1, 30), "Asia/Taipei")
        self.assertEqual(len(options), 1)
        self.assertTrue(options[0].isoformat().endswith("+08:00"))

    def test_detect_local_timezone_requires_real_detection(self):
        with patch.dict(sys.modules, {"tzlocal": SimpleNamespace(get_localzone_name=lambda: "America/Indiana/Indianapolis")}):
            self.assertEqual(cal.detect_local_timezone(), "America/Indiana/Indianapolis")
        with patch.dict(sys.modules, {"tzlocal": SimpleNamespace(get_localzone_name=lambda: "Not/AZone")}):
            self.assertIsNone(cal.detect_local_timezone())
        def failed_detection():
            import warnings
            warnings.warn("Can not find any timezone configuration, defaulting to UTC.")
            return "UTC"
        with patch.dict(sys.modules, {"tzlocal": SimpleNamespace(get_localzone_name=failed_detection)}):
            self.assertIsNone(cal.detect_local_timezone())

    def test_summary_boundary_days_and_exact_now(self):
        now = datetime(2026, 10, 6, 12, tzinfo=ZoneInfo("America/New_York"))
        timestamps = {
            "yesterday": "2026-10-05T23:59:59-04:00",
            "midnight": "2026-10-06T00:00:00-04:00",
            "now": "2026-10-06T12:00:00-04:00",
            "tonight": "2026-10-06T23:59:59-04:00",
            "tomorrow": "2026-10-07T00:00:00-04:00",
            "day_seven": "2026-10-13T23:59:59-04:00",
            "day_eight": "2026-10-14T00:00:00-04:00",
        }
        summary = cal.reminder_summary([self.job()], {
            "job-one": [self.reminder(name, start_at=instant) for name, instant in reversed(timestamps.items())]
        }, "America/New_York", now=now)
        self.assertEqual([row["reminder_id"] for row in summary["today"]], ["midnight", "now", "tonight"])
        self.assertEqual([row["reminder_id"] for row in summary["upcoming"]], ["tomorrow", "day_seven"])
        self.assertEqual([row["reminder_id"] for row in summary["past"]], ["yesterday", "midnight"])
        self.assertEqual(summary["updated_at"], now)

    def test_summary_ignores_inactive_and_applied_records(self):
        reminders = {"job-one": [
            self.reminder("done", status="completed"),
            self.reminder("cancelled", status="cancelled"),
        ]}
        summary = cal.reminder_summary([self.job()], reminders, "UTC", now=datetime(2026, 10, 6, 19, tzinfo=timezone.utc))
        self.assertTrue(all(summary[name] == [] for name in ("today", "upcoming", "past")))

    def test_summary_compares_repeated_hour_as_actual_instants(self):
        now = datetime(2026, 11, 1, 1, 15, tzinfo=ZoneInfo("America/New_York"), fold=1)
        reminders = {"job-one": [
            self.reminder("second", start_at="2026-11-01T01:30:00-05:00"),
            self.reminder("first", start_at="2026-11-01T01:30:00-04:00"),
        ]}
        summary = cal.reminder_summary([self.job()], reminders, "America/New_York", now=now)
        self.assertEqual([row["reminder_id"] for row in summary["today"]], ["first", "second"])
        self.assertEqual([row["reminder_id"] for row in summary["past"]], ["first"])

    def test_summary_uses_display_timezone_for_local_day(self):
        summary = cal.reminder_summary([self.job()], {"job-one": [
            self.reminder(start_at="2026-10-07T00:30:00Z"),
        ]}, "America/New_York", now=datetime(2026, 10, 6, 22, tzinfo=timezone.utc))
        self.assertEqual(len(summary["today"]), 1)
        self.assertEqual(summary["upcoming"], [])
        with self.assertRaises(ValueError):
            cal.reminder_summary([], {}, "UTC", now=datetime(2026, 10, 6))


if __name__ == "__main__":
    unittest.main()
