"""Tracker action integration uses actual local storage and Calendar conversion."""

import pytest

from calendar_utils import build_calendar_events
import storage
from test_api import AUTH, client as client, create_job


ZONE = "America/Indianapolis"


def call(name, **args):
    return {"name": name, "args": {"company": "Example Labs", **args}}


def submit(client, calls, timezone=ZONE):
    return client.post("/api/actions", headers=AUTH, json={"functionCalls": calls, "timezone": timezone})


def success(client, calls, timezone=ZONE):
    response = submit(client, calls, timezone)
    assert response.status_code == 200, response.text
    assert response.json()["ok"] is True, response.text
    return response.json()["results"]


def snapshot():
    return {str(path.relative_to(storage.PROJECT_ROOT)): path.read_bytes()
            for path in storage.PROJECT_ROOT.rglob("*") if path.is_file()}


def reminder(job_id, **changes):
    return storage.create_reminder(job_id, {
        "title": "Interview", "kind": "interview", "start_at": "2026-11-12T10:00:00-05:00",
        "timezone": ZONE, **changes,
    })


def test_status_and_reminder_batch_updates_dashboard_data_and_calendar(client):
    job = create_job(client)
    storage.update_job(job["id"], {"account": "secret-account", "password": "secret-password"})
    results = success(client, [
        call("setJobStatus", status="Interviewing"),
        call("addReminder", kind="interview", datetime="2026-11-12T10:00", title="Technical interview"),
    ])
    saved = storage.get_job_by_id(job["id"])
    assert saved["status_id"] == "interviewing"
    assert saved["applied_date"] == ""
    saved_reminders = storage.list_reminders(job["id"])
    assert saved_reminders == [results[1]["reminder"]]
    assert saved_reminders[0]["start_at"] == "2026-11-12T10:00:00-05:00"
    events, issues = build_calendar_events([saved], {job["id"]: saved_reminders})
    assert issues == []
    assert events[0]["start"] == "2026-11-12T10:00:00-05:00"
    assert "Technical interview" in events[0]["title"]
    for result in results:
        assert "account" not in result["job"]
        assert "password" not in result["job"]


def test_trimmed_casefold_company_title_and_custom_status_label_or_id(client):
    settings = storage.load_settings()
    settings["statuses"].append({"id": "custom_review", "label": "Portfolio Review", "summary_group": "pending", "order": 90, "active": True})
    storage.save_settings(settings)
    job = create_job(client)
    for status in [" portfolio REVIEW ", " CUSTOM_REVIEW "]:
        results = success(client, [call("setJobStatus", company="  example LABS ", jobTitle=" ENGINEER ", status=status)])
        assert results[0]["job"]["id"] == job["id"]
        assert results[0]["job"]["status_id"] == "custom_review"


def test_multiple_jobs_return_candidates_and_optional_title_resolves(client):
    first = create_job(client)
    second = storage.create_job({"company": "Example Labs", "job_title": "Designer"})
    before = snapshot()
    response = submit(client, [call("setJobStatus", status="Offer")])
    assert response.status_code == 200
    assert response.json()["code"] == "AMBIGUOUS"
    assert response.json()["candidates"] == [
        {"company": "Example Labs", "jobTitle": "Engineer"},
        {"company": "Example Labs", "jobTitle": "Designer"},
    ]
    assert snapshot() == before
    success(client, [call("setJobStatus", jobTitle="Designer", status="Offer")])
    assert storage.get_job_by_id(first["id"])["status_id"] == "planning"
    assert storage.get_job_by_id(second["id"])["status_id"] == "offer"


def test_archived_jobs_are_excluded_from_resolution(client):
    active = create_job(client)
    archived = storage.create_job({"company": "Example Labs", "job_title": "Engineer", "archived": True})
    results = success(client, [call("setJobStatus", status="Offer")])
    assert results[0]["job"]["id"] == active["id"]
    storage.archive_job(active["id"])
    response = submit(client, [call("setJobStatus", status="Applied")])
    assert response.json()["code"] == "NOT_FOUND"
    assert storage.get_job_by_id(archived["id"])["status_id"] == "applied"


def test_missing_later_job_leaves_all_earlier_operations_unwritten(client):
    job = create_job(client)
    before = snapshot()
    response = submit(client, [
        call("setJobStatus", status="Offer"),
        call("addJobNote", company="Missing Labs", text="Follow up."),
    ])
    assert response.status_code == 200
    assert response.json()["code"] == "NOT_FOUND"
    assert storage.get_job_by_id(job["id"])["status_id"] == "planning"
    assert snapshot() == before


def test_notes_append_in_batch_and_applied_date_use_existing_storage(client):
    job = create_job(client)
    storage.save_job_notes(job["id"], "Existing note\n")
    results = success(client, [
        call("addJobNote", text="First appended"),
        call("addJobNote", text="    Indented Markdown"),
        call("setAppliedDate", date="2026-11-05"),
    ])
    assert storage.get_job_notes(job["id"]) == "Existing note\n\nFirst appended\n\n    Indented Markdown"
    assert results[-1]["job"]["applied_date"] == "2026-11-05"


@pytest.mark.parametrize("invalid", [
    call("setJobStatus", status="Invented"),
    call("setAppliedDate", date="2026-02-30"),
    call("addJobNote", text="   "),
    call("setJobStatus", status="Offer", unexpected="value"),
    call("setJobStatus", company=123, status="Offer"),
    call("setJobStatus", jobTitle="", status="Offer"),
    call("deleteJob"),
    {"name": "setJobStatus"},
    {"name": "setJobStatus", "args": {"company": "Example Labs", "status": "Offer"}, "extra": True},
])
def test_invalid_later_action_rejects_whole_batch_before_writes(client, invalid):
    create_job(client)
    before = snapshot()
    response = submit(client, [call("setJobStatus", status="Interviewing"), invalid])
    assert response.status_code == 422
    assert snapshot() == before


def test_action_batch_limit_and_empty_batch(client):
    create_job(client)
    before = snapshot()
    assert success(client, []) == []
    response = submit(client, [call("setJobStatus", status="Offer")] * 11)
    assert response.status_code == 422
    assert snapshot() == before


@pytest.mark.parametrize("value,zone", [
    ("2026-03-08T02:30", ZONE),
    ("2026-11-01T01:30", ZONE),
    ("2026-07-01T10:00-05:00", ZONE),
    ("2026-03-08T02:30-05:00", ZONE),
    ("2026-11-12T10:00", "Unknown/Zone"),
    ("2026-11-12T10:00", ""),
    ("2026-11-12", ZONE),
])
def test_invalid_reminder_time_rejects_batch_without_writing(client, value, zone):
    create_job(client)
    before = snapshot()
    response = submit(client, [
        call("setJobStatus", status="Offer"),
        call("addReminder", kind="interview", datetime=value, title="Interview"),
    ], zone)
    assert response.status_code == 422
    assert snapshot() == before


@pytest.mark.parametrize("offset", ["-04:00", "-05:00"])
def test_explicit_dst_fold_offset_is_respected(client, offset):
    create_job(client)
    results = success(client, [call("addReminder", kind="interview", datetime="2026-11-01T01:30" + offset, title="Interview")])
    assert results[0]["reminder"]["start_at"] == "2026-11-01T01:30:00" + offset


def test_complete_reminder_uses_title_and_unique_completed_retry_is_read_only(client):
    job = create_job(client)
    original = reminder(job["id"])
    results = success(client, [call("completeReminder", title=" interview ")])
    assert results[0]["reminder"]["id"] == original["id"]
    assert results[0]["reminder"]["status"] == "completed"
    before = snapshot()
    assert success(client, [call("completeReminder", title="Interview")])[0]["reminder"]["status"] == "completed"
    assert snapshot() == before


def test_complete_reminder_prefers_scheduled_over_old_completed_and_cancelled(client):
    job = create_job(client)
    reminder(job["id"], status="cancelled")
    reminder(job["id"], status="completed")
    target = reminder(job["id"])
    result = success(client, [call("completeReminder", title="Interview")])[0]
    assert result["reminder"]["id"] == target["id"]


def test_ambiguous_reminder_blocks_earlier_job_update(client):
    job = create_job(client)
    reminder(job["id"])
    reminder(job["id"], start_at="2026-11-13T10:00:00-05:00")
    before = snapshot()
    response = submit(client, [call("setJobStatus", status="Offer"), call("completeReminder", title="Interview")])
    assert response.status_code == 200
    assert response.json()["code"] == "AMBIGUOUS"
    assert "reminders" in response.json()["error"]
    assert snapshot() == before


def test_cancelled_reminder_is_not_a_completion_target(client):
    job = create_job(client)
    reminder(job["id"], status="cancelled")
    before = snapshot()
    response = submit(client, [call("completeReminder", title="Interview")])
    assert response.json()["code"] == "NOT_FOUND"
    assert snapshot() == before
