"""Blank import templates and strict validation at the JSON import boundary."""

from __future__ import annotations

import json
from datetime import date
from typing import Any

from storage import validate_job_values


# Shared by template generation and input validation; storage owns system fields.
IMPORT_FIELDS = (
    "company", "job_title", "status_id", "applied_date", "location", "job_url",
    "email", "account", "password", "custom_fields",
)


def _active_records(settings: dict[str, Any], key: str) -> list[dict[str, Any]]:
    return sorted(
        (record for record in settings.get(key, []) if record.get("active", True)),
        key=lambda record: (int(record.get("order", 0)), str(record.get("label", ""))),
    )


def _select_options(field: dict[str, Any]) -> list[str]:
    # Match the choices displayed by the existing Add Job select widget.
    return list(dict.fromkeys(
        str(option).strip() for option in field.get("options", []) if str(option).strip()
    ))


def _blank_job(fields: list[dict[str, Any]]) -> dict[str, Any]:
    job: dict[str, Any] = dict.fromkeys(IMPORT_FIELDS, "")
    job["custom_fields"] = {
        field["id"]: False if field["type"] == "checkbox" else "" for field in fields
    }
    return job


def build_import_template(settings: dict[str, Any]) -> dict[str, Any]:
    """Describe current settings and one blank job without reading any job data."""

    fields = _active_records(settings, "custom_fields")
    field_help = []
    for field in fields:
        description = {
            "id": field["id"],
            "label": field.get("label", field["id"]),
            "type": field["type"],
            "blank_value": False if field["type"] == "checkbox" else "",
        }
        if field["type"] == "select":
            description["options"] = _select_options(field)
        field_help.append(description)
    return {
        "_help": {
            "instructions": [
                "Fill jobs with one or more actual job records; company and job_title are required.",
                "Return valid JSON only, without Markdown code fences, comments, or trailing commas.",
                "Choose a status_id from the listed active statuses; do not guess a status.",
                "Dates must use YYYY-MM-DD or an empty string. Do not invent application dates or mark jobs as applied without confirmation.",
                "Optional text, date, and select fields use an empty string; checkbox values must be true or false, with false as the blank default.",
                "Use only the listed custom field IDs and select options; omitted optional fields use Add Job defaults.",
                "Keep email, account, and password separate, and preserve password characters exactly.",
                "Do not guess information without a source. The App generates UUIDs and timestamps; do not supply them.",
                "The App uses current Settings for validation. _help is optional and never changes Settings.",
            ],
            "statuses": [
                {
                    "id": status["id"],
                    "label": status.get("label", status["id"]),
                    "summary_group": status["summary_group"],
                }
                for status in _active_records(settings, "statuses")
            ],
            "custom_fields": field_help,
        },
        "jobs": [_blank_job(fields)],
    }


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON field: {key}.")
        result[key] = value
    return result


def _reject_constant(value: str) -> None:
    raise ValueError(f"{value} is not a valid JSON value.")


def _validate_custom_fields(
    values: Any, fields: list[dict[str, Any]]
) -> dict[str, Any]:
    if not isinstance(values, dict):
        raise ValueError("custom_fields must be an object.")
    field_by_id = {field["id"]: field for field in fields}
    unknown = values.keys() - field_by_id.keys()
    if unknown:
        raise ValueError(f"custom_fields contains unknown or inactive fields: {', '.join(sorted(unknown))}.")
    result = _blank_job(fields)["custom_fields"]
    for field_id, value in values.items():
        field = field_by_id[field_id]
        label = f"custom_fields.{field_id}"
        if field["type"] == "checkbox":
            if not isinstance(value, bool):
                raise ValueError(f"{label} must be a JSON boolean (true or false).")
        else:
            if not isinstance(value, str):
                raise ValueError(f"{label} must be a string.")
            if field["type"] == "date" and value:
                try:
                    parsed = date.fromisoformat(value)
                except ValueError as error:
                    raise ValueError(f"{label} must use YYYY-MM-DD format or an empty string.") from error
                if parsed.isoformat() != value:
                    raise ValueError(f"{label} must use YYYY-MM-DD format or an empty string.")
            elif field["type"] == "select" and value and value not in _select_options(field):
                raise ValueError(f"{label} must use a currently configured option or an empty string.")
        result[field_id] = value
    return result


def parse_and_validate_import(text: str, settings: dict[str, Any]) -> list[dict[str, Any]]:
    """Validate the complete JSON batch without generating IDs or writing storage."""

    if not isinstance(text, str):
        raise ValueError("Input must be JSON text.")
    try:
        document = json.loads(
            text, object_pairs_hook=_unique_object, parse_constant=_reject_constant
        )
    except json.JSONDecodeError as error:
        raise ValueError(
            f"Invalid JSON at line {error.lineno}, column {error.colno}: {error.msg}."
        ) from error
    if not isinstance(document, dict):
        raise ValueError("The JSON root must be an object containing jobs.")
    unknown = document.keys() - {"jobs", "_help"}
    if unknown:
        raise ValueError(f"Unknown top-level fields: {', '.join(sorted(unknown))}.")
    jobs = document.get("jobs")
    if not isinstance(jobs, list) or not jobs:
        raise ValueError("jobs must be a non-empty array.")

    fields = _active_records(settings, "custom_fields")
    status_ids = {status["id"] for status in _active_records(settings, "statuses")}
    validated: list[dict[str, Any]] = []
    for number, raw_job in enumerate(jobs, start=1):
        try:
            if not isinstance(raw_job, dict):
                raise ValueError("each job must be an object.")
            unknown = raw_job.keys() - set(IMPORT_FIELDS)
            if unknown:
                raise ValueError(f"unknown fields: {', '.join(sorted(unknown))}.")
            job = _blank_job(fields)
            job.update(raw_job)
            for key in IMPORT_FIELDS:
                if key != "custom_fields" and not isinstance(job[key], str):
                    raise ValueError(f"{key} must be a string.")
            if job["status_id"] not in status_ids:
                raise ValueError("status_id must be an active status ID from current Settings.")
            job["custom_fields"] = _validate_custom_fields(job["custom_fields"], fields)
            for key in ("location", "job_url", "account"):
                job[key] = job[key].strip()
            validated.append(validate_job_values(job))
        except ValueError as error:
            raise ValueError(f"Job {number}: {error}") from error
    return validated
