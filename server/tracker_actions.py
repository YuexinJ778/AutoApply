"""Resolve and validate one tracker action batch before changing local data."""

from datetime import datetime
from typing import Any
import uuid
from zoneinfo import ZoneInfoNotFoundError

from calendar_utils import resolve_local_datetime
import storage


ACTION_FIELDS = {
    "setJobStatus": ("company", "status"),
    "setAppliedDate": ("company", "date"),
    "addJobNote": ("company", "text"),
    "addReminder": ("company", "kind", "datetime", "title"),
    "completeReminder": ("company", "title"),
}


class ResolutionError(Exception):
    def __init__(self, code: str, message: str, candidates=None):
        self.response = {"ok": False, "code": code, "error": message}
        if candidates is not None:
            self.response["candidates"] = candidates
        super().__init__(message)


def _text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be nonempty text.")
    return value.strip()


def validate_calls(calls: Any) -> list[dict[str, Any]]:
    if not isinstance(calls, list) or len(calls) > 10:
        raise ValueError("functionCalls must be an array of at most 10 tracker actions.")
    validated = []
    for call in calls:
        if not isinstance(call, dict) or set(call) != {"name", "args"}:
            raise ValueError("Each tracker action must contain only name and args.")
        name = call["name"]
        if not isinstance(name, str) or name not in ACTION_FIELDS:
            raise ValueError("Unsupported tracker action.")
        args = call["args"]
        fields = ACTION_FIELDS[name]
        if not isinstance(args, dict) or set(args) - {*fields, "jobTitle"}:
            raise ValueError(f"{name} contains unsupported arguments.")
        normalized = {field: _text(args.get(field), field) for field in fields}
        if "jobTitle" in args:
            normalized["jobTitle"] = _text(args["jobTitle"], "jobTitle")
        if name == "addJobNote":
            normalized["text"] = args["text"]
        validated.append({"name": name, "args": normalized})
    return validated


def _resolve_job(args, jobs):
    matches = [job for job in jobs if job["company"].strip().casefold() == args["company"].casefold()
               and ("jobTitle" not in args or job["job_title"].strip().casefold() == args["jobTitle"].casefold())]
    if not matches:
        raise ResolutionError("NOT_FOUND", f"No active job matches {args['company']}.")
    if len(matches) > 1:
        raise ResolutionError("AMBIGUOUS", "More than one job matches. Specify the company and job title.",
                              [{"company": job["company"], "jobTitle": job["job_title"]} for job in matches])
    return matches[0]


def _reminder_payload(args, timezone_name):
    zone = _text(timezone_name, "timezone")
    if "T" not in args["datetime"]:
        raise ValueError("datetime must include an ISO date and time (YYYY-MM-DDTHH:MM).")
    try:
        start = datetime.fromisoformat(args["datetime"])
    except ValueError as error:
        raise ValueError("datetime must be an ISO date and time.") from error
    if start.tzinfo is None:
        try:
            start = resolve_local_datetime(start.date(), start.time(), zone)
        except ZoneInfoNotFoundError as error:
            raise ValueError("Reminder timezone must be a valid IANA timezone name.") from error
    now = storage._utc_now()
    return storage._validate_reminder({
        "id": str(uuid.uuid4()), "created_at": now, "updated_at": now,
        "title": args["title"], "kind": args["kind"], "start_at": start.isoformat(),
        "timezone": zone, "status": "scheduled", "end_at": None,
        "location_or_url": "", "notes": "",
    })


def _resolve_reminder(job, title):
    matches = [item for item in storage.list_reminders(job["id"])
               if item["title"].strip().casefold() == title.casefold()]
    scheduled = [item for item in matches if item["status"] == "scheduled"]
    eligible = scheduled or [item for item in matches if item["status"] == "completed"]
    if not eligible:
        raise ResolutionError("NOT_FOUND", f"No scheduled or completed reminder named {title} matches this job.")
    if len(eligible) > 1:
        raise ResolutionError("AMBIGUOUS", f"Multiple reminders named {title} match this job. Use the dashboard to choose the reminder by date.")
    return eligible[0]


def _prepare(call, jobs, settings, timezone_name):
    name, args = call["name"], call["args"]
    job = _resolve_job(args, jobs)
    if name == "setJobStatus":
        statuses = [item for item in settings["statuses"] if args["status"].casefold() in
                    {item["id"].casefold(), item["label"].strip().casefold()}]
        if len(statuses) != 1:
            raise ValueError("status must identify one configured status ID or label.")
        value = {"status_id": statuses[0]["id"]}
        storage.validate_job_values({**job, **value})
        storage._validate_job_status({**job, **value})
    elif name == "setAppliedDate":
        value = {"applied_date": args["date"]}
        storage.validate_job_values({**job, **value})
    elif name == "addJobNote":
        storage.get_job_notes(job["id"])
        value = args["text"]
    elif name == "addReminder":
        value = _reminder_payload(args, timezone_name)
        storage.load_reminders(job["id"])
    else:
        value = _resolve_reminder(job, args["title"])
    return name, job["id"], value


def execute_actions(function_calls: Any, timezone_name: str = "") -> dict[str, Any]:
    calls = validate_calls(function_calls)
    if not calls:
        return {"ok": True, "results": []}
    with storage._STORAGE_LOCK:
        jobs = [job for job in storage.load_jobs()["jobs"] if not job["archived"]]
        settings = storage.load_settings()
        try:
            prepared = [_prepare(call, jobs, settings, timezone_name) for call in calls]
        except ResolutionError as error:
            return error.response

        results = []
        for name, job_id, value in prepared:
            result = {"name": name}
            if name in ("setJobStatus", "setAppliedDate"):
                storage.update_job(job_id, value)
            elif name == "addJobNote":
                previous = storage.get_job_notes(job_id).rstrip("\n")
                storage.save_job_notes(job_id, previous + ("\n\n" if previous else "") + value)
            elif name == "addReminder":
                result["reminder"] = storage.create_reminder(job_id, value)
            else:
                result["reminder"] = value if value["status"] == "completed" else storage.set_reminder_status(job_id, value["id"], "completed")
            result["job"] = storage.get_job_by_id(job_id)
            results.append(result)
        return {"ok": True, "results": results}
