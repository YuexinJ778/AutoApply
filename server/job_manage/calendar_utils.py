"""Pure Calendar event conversion and timezone-aware reminder calculations.

Application dates stay date-only. Reminder instants always carry an offset; no
function in this module reads or writes tracker data.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Mapping, Sequence
import warnings
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


REMINDER_KINDS = {
    "interview": "Interview",
    "assessment": "Assessment",
    "deadline": "Deadline",
    "follow_up": "Follow-up",
    "other": "Other",
}
EVENT_COLORS = {
    "application": "#64748b",
    "interview": "#2563eb",
    "assessment": "#7c3aed",
    "deadline": "#dc2626",
    "follow_up": "#0f766e",
    "other": "#a16207",
}


class NonexistentTimeError(ValueError):
    """The selected wall time is skipped during a timezone transition."""


class AmbiguousTimeError(ValueError):
    """The selected wall time occurs twice and needs an explicit choice."""


def parse_aware_datetime(value: str) -> datetime:
    """Parse an ISO timestamp without ever assigning an assumed timezone."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("A date and time with a UTC offset is required.")
    try:
        result = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Invalid ISO date and time.") from exc
    if result.tzinfo is None or result.utcoffset() is None:
        raise ValueError("The date and time must include a UTC offset.")
    return result


def detect_local_timezone() -> str | None:
    """Return a detected IANA name, or require a user-confirmed setting.

    tzlocal handles platform-specific system configuration. Its warnings (such
    as falling back to UTC when detection fails) are not accepted as detection.
    No current fixed offset is used to guess a zone.
    """
    try:
        from tzlocal import get_localzone_name

        with warnings.catch_warnings():
            warnings.simplefilter("error")
            name = get_localzone_name()
        if not isinstance(name, str) or not name:
            return None
        ZoneInfo(name)
        return name
    except (ImportError, OSError, ValueError, RuntimeError, Warning, ZoneInfoNotFoundError):
        return None


def local_time_options(
    day: date, time_value: time, timezone_name: str
) -> list[datetime]:
    """Return zero, one or two valid instants for a local wall-clock choice."""
    if not isinstance(day, date) or isinstance(day, datetime):
        raise ValueError("Choose a date.")
    if not isinstance(time_value, time) or time_value.tzinfo is not None:
        raise ValueError("Choose a local time.")
    zone = ZoneInfo(timezone_name)
    wall = datetime.combine(day, time_value)
    candidates: dict[datetime, datetime] = {}
    for fold in (0, 1):
        candidate = wall.replace(tzinfo=zone, fold=fold)
        instant = candidate.astimezone(timezone.utc)
        roundtrip = instant.astimezone(zone)
        if roundtrip.replace(tzinfo=None) == wall:
            # UTC keys distinguish repeated times; same-zone datetime equality
            # would treat fold=0 and fold=1 as equal.
            candidates.setdefault(instant, candidate)
    return [candidates[instant] for instant in sorted(candidates)]


def resolve_local_datetime(
    day: date,
    time_value: time,
    timezone_name: str,
    *,
    fold: int | None = None,
) -> datetime:
    """Resolve a form choice, rejecting gaps and unconfirmed repeated times."""
    if fold not in (None, 0, 1):
        raise ValueError("Choose the first or second occurrence of this time.")
    options = local_time_options(day, time_value, timezone_name)
    if not options:
        raise NonexistentTimeError(
            f"{day.isoformat()} {time_value.isoformat()} does not exist in "
            f"{timezone_name} because the clock changes. Choose another time."
        )
    if len(options) == 2:
        if fold is None:
            raise AmbiguousTimeError(
                f"{day.isoformat()} {time_value.isoformat()} occurs twice in "
                f"{timezone_name}. Confirm the first or second occurrence."
            )
        return next(option for option in options if option.fold == fold)
    return options[0]


def _date_only(value: Any) -> date:
    if not isinstance(value, str):
        raise ValueError("Expected a YYYY-MM-DD date.")
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError("Expected a YYYY-MM-DD date.")
    return parsed


def _job_label(job: Mapping[str, Any]) -> str:
    return f"{job.get('company', '')} — {job.get('job_title', '')}"


def build_calendar_events(
    jobs: Sequence[Mapping[str, Any]],
    reminders_by_job: Mapping[str, Sequence[Mapping[str, Any]]],
    *,
    show_applications: bool = True,
    show_reminders: bool = True,
    show_inactive: bool = False,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Derive current events; never persist or copy job credentials into them.

    The caller supplies all existing jobs, independently of Dashboard filters.
    Invalid entries produce warnings while other jobs and reminders survive.
    """
    events: list[dict[str, Any]] = []
    issues: list[str] = []
    for job in jobs:
        job_id = str(job.get("id", ""))
        if not job_id:
            issues.append("A job without an ID was skipped in Calendar.")
            continue
        label = _job_label(job)
        applied_date = job.get("applied_date", "")
        if show_applications and applied_date not in (None, ""):
            try:
                applied = _date_only(applied_date)
            except (TypeError, ValueError):
                issues.append(f"{label} ({job_id}): invalid Date Applied {applied_date!r}; application event skipped.")
            else:
                events.append({
                    "id": f"application:{job_id}",
                    "title": f"[Applied] {label}",
                    "start": applied.isoformat(),
                    "allDay": True,
                    "color": EVENT_COLORS["application"],
                    "extendedProps": {"job_id": job_id, "kind": "application"},
                })
        if not show_reminders:
            continue
        for reminder in reminders_by_job.get(job_id, []):
            try:
                reminder_id = str(reminder.get("id", ""))
                if not reminder_id:
                    raise ValueError("missing reminder ID")
                kind = reminder.get("kind")
                if kind not in REMINDER_KINDS:
                    raise ValueError("invalid reminder type")
                status = reminder.get("status")
                if status not in {"scheduled", "completed", "cancelled"}:
                    raise ValueError("invalid reminder status")
                start = parse_aware_datetime(reminder.get("start_at"))
                end = parse_aware_datetime(reminder["end_at"]) if reminder.get("end_at") else None
                if end is not None and end <= start:
                    raise ValueError("end time must be after start time")
                if status != "scheduled" and not show_inactive:
                    continue
                status_label = f" [{status.capitalize()}]" if status != "scheduled" else ""
                event: dict[str, Any] = {
                    "id": f"reminder:{job_id}:{reminder_id}",
                    "title": f"[{REMINDER_KINDS[kind]}] {reminder.get('title', '')} — {label}{status_label}",
                    "start": start.isoformat(),
                    "allDay": False,
                    "color": EVENT_COLORS[kind] if status == "scheduled" else "#94a3b8",
                    "extendedProps": {"job_id": job_id, "reminder_id": reminder_id, "kind": kind},
                }
                if end is not None:
                    event["end"] = end.isoformat()
                events.append(event)
            except (AttributeError, TypeError, ValueError) as exc:
                issues.append(f"{label} ({job_id}): invalid reminder skipped ({exc}).")
    return events, issues


def calendar_date(value: str, display_timezone: str) -> date:
    """Interpret a callback date/timestamp in the declared display timezone."""
    if isinstance(value, str) and len(value) == 10:
        return _date_only(value)
    return parse_aware_datetime(value).astimezone(ZoneInfo(display_timezone)).date()


def event_local_date(event: Mapping[str, Any], display_timezone: str) -> date:
    if event.get("allDay"):
        return _date_only(event["start"])
    return calendar_date(event["start"], display_timezone)


def events_for_day(
    events: Sequence[Mapping[str, Any]], day: date, display_timezone: str
) -> list[dict[str, Any]]:
    """List all-day events first, then timed events overlapping the local day.

    End times are exclusive, so an event ending at midnight is not repeated on
    the following day. Reminders without an end are points in time.
    """
    zone = ZoneInfo(display_timezone)
    begin = datetime.combine(day, time.min, zone).astimezone(timezone.utc)
    end = datetime.combine(day + timedelta(days=1), time.min, zone).astimezone(timezone.utc)
    matching: list[dict[str, Any]] = []
    for event in events:
        if event.get("allDay"):
            if event_local_date(event, display_timezone) == day:
                matching.append(dict(event))
            continue
        start = parse_aware_datetime(event["start"])
        finish = parse_aware_datetime(event["end"]) if event.get("end") else None
        if (begin <= start < end) if finish is None else (start < end and finish > begin):
            matching.append(dict(event))
    return sorted(matching, key=lambda item: (
        0 if item.get("allDay") else 1,
        0 if item.get("allDay") else parse_aware_datetime(item["start"]).timestamp(),
        str(item.get("id", "")),
    ))


def reminder_summary(
    jobs: Sequence[Mapping[str, Any]],
    reminders_by_job: Mapping[str, Sequence[Mapping[str, Any]]],
    display_timezone: str,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Scheduled reminders only, sorted by actual instant.

    Today covers the whole local date (including times already past). Upcoming
    covers the next seven local dates, starting tomorrow. Past means start <
    now, so an earlier reminder today appears in both Today and Past.
    """
    zone = ZoneInfo(display_timezone)
    now = datetime.now(timezone.utc) if now is None else now
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("Summary time must include a timezone.")
    today = now.astimezone(zone).date()
    upcoming_end = today + timedelta(days=7)
    result: dict[str, Any] = {
        "today": [], "upcoming": [], "past": [],
        "updated_at": now.astimezone(zone), "warnings": [],
    }
    for job in jobs:
        job_id = str(job.get("id", ""))
        for reminder in reminders_by_job.get(job_id, []):
            if not isinstance(reminder, Mapping) or reminder.get("status") != "scheduled":
                continue
            try:
                start = parse_aware_datetime(reminder.get("start_at"))
            except (TypeError, ValueError) as exc:
                result["warnings"].append(f"Job {job_id}: invalid reminder omitted from summary ({exc}).")
                continue
            row = {
                "job_id": job_id, "reminder_id": reminder.get("id"),
                "start_at": start, "reminder": dict(reminder),
            }
            local_day = start.astimezone(zone).date()
            if local_day == today:
                result["today"].append(row)
            if today < local_day <= upcoming_end:
                result["upcoming"].append(row)
            if start.astimezone(timezone.utc) < now.astimezone(timezone.utc):
                result["past"].append(row)
    for name in ("today", "upcoming", "past"):
        result[name].sort(key=lambda row: (row["start_at"].timestamp(), str(row["reminder_id"])))
    return result
