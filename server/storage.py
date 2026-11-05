"""Local JSON, company/prompt CSV, and application-file storage for the tracker."""

from __future__ import annotations

import copy
import csv
import hashlib
import json
import math
import os
import re
import secrets
import shutil
import subprocess
import uuid
import warnings
from datetime import date, datetime, timezone
from functools import wraps
from pathlib import Path
from threading import RLock
from typing import Any, BinaryIO, Mapping, Sequence
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


PROJECT_ROOT = Path(__file__).resolve().parent
DATA_DIR = PROJECT_ROOT / "data"
APPLICATIONS_DIR = PROJECT_ROOT / "applications"
BACKUPS_DIR = PROJECT_ROOT / "backups"
JOBS_FILE = DATA_DIR / "jobs.json"
SETTINGS_FILE = DATA_DIR / "settings.json"

# Dashboard callbacks and API threads share one writer lock. Reentrancy lets
# complete operations call the same storage helpers without releasing it.
_STORAGE_LOCK = RLock()


def _locked(function):
    @wraps(function)
    def call(*args, **kwargs):
        with _STORAGE_LOCK:
            return function(*args, **kwargs)
    return call


SUMMARY_GROUPS = ("offer", "rejected", "pending")
CUSTOM_FIELD_TYPES = ("text", "date", "select", "checkbox")
_INTERNAL_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
LATEX_TIMEOUT_SECONDS = 30
PDF_LIBRARY_SCHEMA_VERSION = 1
COMPILE_STATUS_SCHEMA_VERSION = 1
PDF_VERSION_SOURCES = ("compiled", "uploaded", "legacy", "extension")
ATTACHMENT_SCHEMA_VERSION = 1
REMINDER_SCHEMA_VERSION = 1
REMINDER_KINDS = ("interview", "assessment", "deadline", "follow_up", "other")
REMINDER_STATUSES = ("scheduled", "completed", "cancelled")
_REMINDER_EDITABLE_FIELDS = (
    "title", "kind", "start_at", "end_at", "timezone", "status",
    "location_or_url", "notes",
)
MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024
_ATTACHMENT_SUFFIX_PATTERN = re.compile(r"\.[a-z0-9]{1,16}$")

DEFAULT_JOBS: dict[str, Any] = {
    "schema_version": 1,
    "jobs": [],
}

DEFAULT_STATUSES: list[dict[str, Any]] = [
    {
        "id": "planning",
        "label": "Preparing to Apply",
        "summary_group": "pending",
        "order": 10,
        "active": True,
    },
    {
        "id": "applied",
        "label": "Applied",
        "summary_group": "pending",
        "order": 20,
        "active": True,
    },
    {
        "id": "online_assessment",
        "label": "Online Assessment",
        "summary_group": "pending",
        "order": 30,
        "active": True,
    },
    {
        "id": "phone_interview",
        "label": "Phone Interview",
        "summary_group": "pending",
        "order": 40,
        "active": True,
    },
    {
        "id": "interviewing",
        "label": "Interviewing",
        "summary_group": "pending",
        "order": 50,
        "active": True,
    },
    {
        "id": "waiting_result",
        "label": "Awaiting Result",
        "summary_group": "pending",
        "order": 60,
        "active": True,
    },
    {
        "id": "offer",
        "label": "Offer",
        "summary_group": "offer",
        "order": 70,
        "active": True,
    },
    {
        "id": "rejected",
        "label": "Rejected",
        "summary_group": "rejected",
        "order": 80,
        "active": True,
    },
]

DEFAULT_SETTINGS: dict[str, Any] = {
    "schema_version": 1,
    "statuses": DEFAULT_STATUSES,
    "custom_fields": [],
    "company_columns": [],
}


class CorruptStorageError(RuntimeError):
    """Raised when both a primary storage file and its backup are unusable."""


class StorageRecoveryWarning(RuntimeWarning):
    """Warns that storage was read from a backup after primary-file damage."""


class JobDirectoriesError(RuntimeError):
    """Jobs were saved, but one or more application folders could not be made."""

    def __init__(
        self, saved_jobs: list[dict[str, Any]], failures: list[tuple[str, str]]
    ) -> None:
        self.saved_jobs = copy.deepcopy(saved_jobs)
        self.failed_job_ids = [job_id for job_id, _ in failures]
        details = "; ".join(f"{job_id}: {message}" for job_id, message in failures)
        super().__init__(
            f"Saved {len(saved_jobs)} jobs, but could not create "
            f"{len(failures)} application folders. Do not import these jobs again. "
            f"Folder errors: {details}"
        )


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _backup_path_for(path: Path) -> Path:
    """Return the single rolling backup path used by a storage file."""

    return BACKUPS_DIR / f"{path.name}.bak"


def _validated_direct_file(path: Path, parent: Path) -> Path:
    """Reject file paths or leaf symlinks that escape their expected directory."""

    expected_parent = parent.resolve()
    if path.parent.resolve() != expected_parent or path.is_symlink():
        raise ValueError(f"Unsafe storage path: {path.name}")
    resolved = path.resolve()
    expected = expected_parent / path.name
    if resolved != expected:
        raise ValueError(f"Unsafe storage path: {path.name}")
    return expected


def _assert_local_storage_layout() -> None:
    """Ensure the three storage roots are real direct children of the project."""

    project_root = PROJECT_ROOT.resolve()
    for directory, name in (
        (DATA_DIR, "data"),
        (APPLICATIONS_DIR, "applications"),
        (BACKUPS_DIR, "backups"),
    ):
        if directory.is_symlink() or directory.resolve() != project_root / name:
            raise ValueError(f"The {name} directory must not point outside the project.")

    _validated_direct_file(JOBS_FILE, DATA_DIR)
    _validated_direct_file(SETTINGS_FILE, DATA_DIR)
    _validated_direct_file(_backup_path_for(JOBS_FILE), BACKUPS_DIR)
    _validated_direct_file(_backup_path_for(SETTINGS_FILE), BACKUPS_DIR)


def _prepare_temporary_file(path: Path, parent: Path) -> Path:
    """Validate a fixed temporary path and remove only a stale regular file."""

    temporary = _validated_direct_file(path, parent)
    if temporary.exists():
        if not temporary.is_file():
            raise ValueError(f"Cannot safely use temporary file: {temporary.name}")
        temporary.unlink()
    return temporary


def _read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _is_valid_backup_source(path: Path) -> bool:
    """Check syntax and, for formal storage files, the expected document shape."""

    raw = _read_json(path)
    if path.resolve() == JOBS_FILE.resolve():
        _normalise_jobs_document(raw)
    elif path.resolve() == SETTINGS_FILE.resolve():
        settings = _normalise_settings_document(raw)
        _validate_settings(settings)
    return True


@_locked
def atomic_write_json(
    path: str | Path,
    data: Any,
    backup_path: str | Path | None = None,
) -> None:
    """Safely replace a JSON file, retaining one valid previous backup."""

    _assert_local_storage_layout()
    destination = _validated_direct_file(Path(path), DATA_DIR)
    backup = Path(backup_path) if backup_path is not None else _backup_path_for(destination)
    backup = _validated_direct_file(backup, BACKUPS_DIR)
    destination.parent.mkdir(parents=True, exist_ok=True)
    backup.parent.mkdir(parents=True, exist_ok=True)
    temporary = _prepare_temporary_file(
        destination.with_name(f"{destination.name}.tmp"), DATA_DIR
    )
    backup_temporary = backup.with_name(f"{backup.name}.tmp")

    try:
        with temporary.open("x", encoding="utf-8", newline="\n") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())

        # Do not replace anything unless the completed temporary file parses.
        _read_json(temporary)

        if destination.exists():
            try:
                _is_valid_backup_source(destination)
            except (OSError, UnicodeError, json.JSONDecodeError, ValueError):
                # Preserve an existing good backup when the primary is corrupt.
                pass
            else:
                backup_temporary = _prepare_temporary_file(
                    backup_temporary, BACKUPS_DIR
                )
                shutil.copy2(destination, backup_temporary)
                _read_json(backup_temporary)
                os.replace(backup_temporary, backup)

        os.replace(temporary, destination)
    finally:
        if temporary.exists():
            temporary.unlink()
        if backup_temporary.exists() and not backup_temporary.is_symlink():
            backup_temporary.unlink()


@_locked
def ensure_storage() -> None:
    """Create all local directories and default JSON files when absent."""

    _assert_local_storage_layout()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    APPLICATIONS_DIR.mkdir(parents=True, exist_ok=True)
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    if not JOBS_FILE.exists():
        _restore_missing_json(JOBS_FILE, copy.deepcopy(DEFAULT_JOBS))
    if not SETTINGS_FILE.exists():
        _restore_missing_json(SETTINGS_FILE, copy.deepcopy(DEFAULT_SETTINGS))


def _restore_missing_json(path: Path, default: dict[str, Any]) -> None:
    """Restore a missing primary from backup; default only when neither exists."""

    backup = _backup_path_for(path)
    if not backup.exists():
        atomic_write_json(path, default)
        return
    try:
        raw = _read_json(backup)
        if path.resolve() == JOBS_FILE.resolve():
            recovered = _normalise_jobs_document(raw)
        else:
            recovered = _normalise_settings_document(raw)
            _validate_settings(recovered)
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
        raise CorruptStorageError(
            f"{path.name} is missing and backup {backup.name} cannot be read; "
            "the application stopped modifying data to prevent data loss."
        ) from error
    warnings.warn(
        f"{path.name} was missing and has been safely restored from {backup.name}.",
        StorageRecoveryWarning,
        stacklevel=2,
    )
    atomic_write_json(path, recovered)


def _normalise_job(raw_job: Mapping[str, Any]) -> dict[str, Any]:
    """Add defaults required by newer versions without dropping old fields."""

    job = dict(raw_job)
    string_defaults = {
        "status_id": "applied",
        "applied_date": "",
        "company": "",
        "job_title": "",
        "location": "",
        "job_url": "",
        "email": "",
        "account": "",
        "password": "",
        "created_at": "",
        "updated_at": "",
        "source": "manual",
        "canonical_url": "",
    }
    for key, default in string_defaults.items():
        if job.get(key) is None:
            job[key] = default
        else:
            job.setdefault(key, default)
    if not isinstance(job.get("custom_fields"), dict):
        job["custom_fields"] = {}
    job.setdefault("autofill_stats", None)
    archived = job.get("archived", False)
    job["archived"] = archived if isinstance(archived, bool) else False
    return job


def _normalise_jobs_document(raw: Any) -> dict[str, Any]:
    if isinstance(raw, list):
        # Tolerate a simple legacy list while always returning today's wrapper.
        raw = {"schema_version": 1, "jobs": raw}
    if not isinstance(raw, dict) or not isinstance(raw.get("jobs"), list):
        raise ValueError("jobs.json must be a JSON object containing a jobs list.")
    if any(not isinstance(job, dict) for job in raw["jobs"]):
        raise ValueError("Every job in jobs.json must be a JSON object.")
    document = dict(raw)
    document.setdefault("schema_version", 1)
    document["jobs"] = [_normalise_job(job) for job in raw["jobs"]]
    return document


@_locked
def load_jobs() -> dict[str, Any]:
    """Load all jobs and supply defaults for fields missing in old records."""

    ensure_storage()
    try:
        return _normalise_jobs_document(_read_json(JOBS_FILE))
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as primary_error:
        backup = _backup_path_for(JOBS_FILE)
        try:
            recovered = _normalise_jobs_document(_read_json(backup))
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as backup_error:
            raise CorruptStorageError(
                f"Neither jobs.json nor its backup {backup.name} can be read; "
                "the application stopped modifying data to prevent data loss."
            ) from backup_error
        warnings.warn(
            "jobs.json is corrupt or incorrectly formatted; data is being loaded "
            f"from jobs.json.bak. Original error: {primary_error}",
            StorageRecoveryWarning,
            stacklevel=2,
        )
        return recovered


@_locked
def save_jobs(payload: Mapping[str, Any] | Sequence[Mapping[str, Any]]) -> None:
    """Validate and atomically save the jobs document."""

    ensure_storage()
    raw: Any = list(payload) if isinstance(payload, (list, tuple)) else dict(payload)
    document = _normalise_jobs_document(raw)
    atomic_write_json(JOBS_FILE, document)


_COMPANY_FIELDS = ("id", "company_name", "last_fetched_date")
_COMPANY_LABELS = ("Company Name", "Last Fetched Date")


def _companies_path() -> Path:
    """Keep the independent tracking list under the existing data root."""

    _assert_local_storage_layout()
    return _validated_direct_file(DATA_DIR / "companies.csv", DATA_DIR)


def _normalise_company_columns(raw: Any) -> list[dict[str, Any]]:
    """Validate the small, independent company schema in insertion order."""

    if not isinstance(raw, list):
        raise ValueError("settings.json company_columns must be a list of objects.")
    columns: list[dict[str, Any]] = []
    seen_ids = set(_COMPANY_FIELDS)
    seen_labels = {label.casefold() for label in (*_COMPANY_LABELS, *_COMPANY_FIELDS)}
    for item in raw:
        if not isinstance(item, Mapping):
            raise ValueError("Every company column must be an object.")
        column_id = _validate_internal_id(item.get("id"), "Company column")
        if column_id in seen_ids or not column_id.startswith("custom_"):
            raise ValueError("Company column IDs must be unique and start with custom_.")
        label = item.get("label", "")
        if not isinstance(label, str) or not label.strip():
            raise ValueError("Column Name cannot be blank.")
        label = label.strip()
        if label.casefold() in seen_labels:
            raise ValueError(f"A company column named {label!r} already exists.")
        field_type = item.get("type", "text")
        if field_type not in CUSTOM_FIELD_TYPES:
            raise ValueError("Company field type must be text, date, select, or checkbox.")
        raw_options = item.get("options", [])
        if not isinstance(raw_options, list) or any(not isinstance(value, str) for value in raw_options):
            raise ValueError("Company column options must be a list of strings.")
        options = [value.strip() for value in raw_options if value.strip()] if field_type == "select" else []
        if field_type == "select" and not options:
            raise ValueError("A Select column requires at least one option.")
        columns.append({"id": column_id, "label": label, "type": field_type, "options": options})
        seen_ids.add(column_id)
        seen_labels.add(label.casefold())
    return columns


@_locked
def load_company_columns() -> list[dict[str, Any]]:
    """Read only the company schema; browsing companies never creates job files."""

    _assert_local_storage_layout()
    return copy.deepcopy(_load_settings_document()["company_columns"])


@_locked
def add_company_column(
    label: str, field_type: str = "text", options: Sequence[str] | str | None = None
) -> dict[str, Any]:
    """Persist a validated definition and upgrade the existing company CSV header."""

    _assert_local_storage_layout()
    settings = _load_settings_document()
    choices = options.splitlines() if isinstance(options, str) else list(options or [])
    columns = _normalise_company_columns([
        *settings["company_columns"],
        {"id": f"custom_{uuid.uuid4().hex}", "label": label, "type": field_type, "options": choices},
    ])
    companies = load_companies()
    _save_company_column_changes(settings, columns, companies)
    return copy.deepcopy(columns[-1])


@_locked
def update_company_column(
    column_id: str, label: str, field_type: str = "text",
    options: Sequence[str] | str | None = None,
) -> dict[str, Any]:
    """Change one definition in place, refusing conversions that lose values."""

    _assert_local_storage_layout()
    settings = _load_settings_document()
    original_columns = settings["company_columns"]
    index = next((index for index, column in enumerate(original_columns) if column["id"] == column_id), None)
    if index is None:
        raise KeyError(f"Company column not found: {column_id}")
    choices = options.splitlines() if isinstance(options, str) else list(options or [])
    columns = copy.deepcopy(original_columns)
    columns[index] = {"id": column_id, "label": label, "type": field_type, "options": choices}
    columns = _normalise_company_columns(columns)
    companies = load_companies()
    for company in companies:
        value = company.get(column_id)
        if isinstance(value, bool) and field_type in ("text", "select"):
            value = str(value).lower()
        try:
            company[column_id] = _normalise_company_value(columns[index], value)
        except ValueError as error:
            raise ValueError(f"Cannot change this column for company {company['company_name']!r}: {error}") from error
    _save_company_column_changes(settings, columns, companies)
    return copy.deepcopy(columns[index])


@_locked
def delete_company_column(column_id: str) -> bool:
    """Remove a custom definition and its CSV values without touching other data."""

    _assert_local_storage_layout()
    settings = _load_settings_document()
    columns = [column for column in settings["company_columns"] if column["id"] != column_id]
    if len(columns) == len(settings["company_columns"]):
        return False
    companies = load_companies()
    _save_company_column_changes(settings, columns, companies, drop_columns=(column_id,))
    return True


def _save_company_column_changes(
    settings: Mapping[str, Any], columns: Sequence[Mapping[str, Any]],
    companies: Sequence[Mapping[str, Any]], *, drop_columns: Sequence[str] = (),
) -> None:
    """Keep the previous CSV intact if saving its new definition fails."""

    path = _companies_path()
    previous_csv = path.read_bytes() if path.exists() else None
    save_companies(companies, company_columns=columns, drop_columns=drop_columns)
    try:
        save_settings({**settings, "company_columns": list(columns)}, initialise_storage=False)
    except Exception:
        # Restore exact bytes without rotating away the valid CSV backup. This
        # handles rename, conversion, and deletion with the same existing temp
        # file/atomic-replace convention, without a separate transaction format.
        temporary = path.with_name(f"{path.name}.tmp")
        try:
            if previous_csv is None:
                path.unlink(missing_ok=True)
            else:
                temporary = _prepare_temporary_file(temporary, DATA_DIR)
                with temporary.open("xb") as handle:
                    handle.write(previous_csv)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temporary, path)
        except Exception as restore_error:
            raise OSError(
                "Company column settings could not be saved and companies.csv could not be restored. "
                "The previous company values remain in backups/companies.csv.bak; restore that file before retrying."
            ) from restore_error
        finally:
            if temporary.exists() and not temporary.is_symlink():
                temporary.unlink()
        raise


def _empty_company_value(value: Any) -> bool:
    return value is None or (isinstance(value, float) and math.isnan(value))


def _normalise_company_value(column: Mapping[str, Any], value: Any) -> str | bool:
    field_type = column["type"]
    if _empty_company_value(value):
        value = ""
    if field_type == "checkbox":
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            token = value.strip().casefold()
            if token in ("true", "1", "yes", "on"):
                return True
            if token in ("", "false", "0", "no", "off"):
                return False
        elif isinstance(value, (int, float)) and value in (0, 1):
            return bool(value)
        raise ValueError(f"{column['label']} must be true or false.")
    if field_type == "date":
        if value == "":
            return ""
        if isinstance(value, date) and not isinstance(value, datetime):
            return value.isoformat()
        try:
            parsed = date.fromisoformat(value) if isinstance(value, str) else None
        except ValueError:
            parsed = None
        if parsed is None or parsed.isoformat() != value:
            raise ValueError(f"{column['label']} must use YYYY-MM-DD format.")
        return value
    text = str(value)
    if field_type == "select" and text and text not in column["options"]:
        raise ValueError(f"{column['label']} must be one of its configured options.")
    return text


def _normalise_company(
    raw: Mapping[str, Any], columns: Sequence[Mapping[str, Any]] | None = None
) -> dict[str, Any]:
    company_id = raw.get("id")
    try:
        canonical = str(uuid.UUID(company_id)) if isinstance(company_id, str) else ""
    except ValueError as error:
        raise ValueError("Company ID must be a canonical UUID string.") from error
    if not canonical or canonical != company_id:
        raise ValueError("Company ID must be a canonical UUID string.")
    name = raw.get("company_name")
    if not isinstance(name, str) or not name.strip():
        raise ValueError("Company Name cannot be blank.")
    fetched = raw.get("last_fetched_date", "")
    if _empty_company_value(fetched):
        fetched = ""
    if not isinstance(fetched, str):
        raise ValueError("Last Fetched Date must use YYYY-MM-DD format.")
    if fetched:
        try:
            parsed = date.fromisoformat(fetched)
        except ValueError as error:
            raise ValueError("Last Fetched Date must use YYYY-MM-DD format.") from error
        if parsed.isoformat() != fetched:
            raise ValueError("Last Fetched Date must use YYYY-MM-DD format.")
    # Retain columns not currently represented in the UI or settings as well.
    company = {key: "" if _empty_company_value(value) else value for key, value in raw.items()}
    company.update({"id": canonical, "company_name": name.strip(), "last_fetched_date": fetched})
    for column in load_company_columns() if columns is None else columns:
        company[column["id"]] = _normalise_company_value(column, raw.get(column["id"]))
    return company


def _normalise_companies(
    records: Sequence[Mapping[str, Any]], columns: Sequence[Mapping[str, Any]] | None = None
) -> list[dict[str, Any]]:
    columns = load_company_columns() if columns is None else columns
    companies: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in records:
        if not isinstance(raw, Mapping):
            raise ValueError("Every company must be an object.")
        company = _normalise_company(raw, columns)
        if company["id"] in seen:
            raise ValueError(f"Duplicate company ID: {company['id']}")
        seen.add(company["id"])
        companies.append(company)
    return companies


def _company_csv_fieldnames(path: Path) -> list[str]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        fieldnames = csv.DictReader(handle, strict=True).fieldnames
    if (not fieldnames or len(set(fieldnames)) != len(fieldnames)
            or any(not name for name in fieldnames)
            or not set(_COMPANY_FIELDS).issubset(fieldnames)):
        raise ValueError("companies.csv must contain unique id,company_name,last_fetched_date columns.")
    return fieldnames


def _read_companies_csv(
    path: Path, columns: Sequence[Mapping[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    _company_csv_fieldnames(path)
    with path.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle, strict=True))
    if any(None in row or any(row.get(key) is None for key in _COMPANY_FIELDS) for row in rows):
        raise ValueError("Every company row must contain the three built-in fields and fit its CSV header.")
    return _normalise_companies(rows, columns)


def _load_companies_with_fields() -> tuple[list[dict[str, Any]], list[str]]:
    path = _companies_path()
    backup = _validated_direct_file(_backup_path_for(path), BACKUPS_DIR)
    try:
        return _read_companies_csv(path), _company_csv_fieldnames(path)
    except (OSError, UnicodeError, csv.Error, ValueError) as primary_error:
        try:
            recovered = _read_companies_csv(backup)
            fields = _company_csv_fieldnames(backup)
        except (OSError, UnicodeError, csv.Error, ValueError) as backup_error:
            if isinstance(primary_error, FileNotFoundError) and isinstance(backup_error, FileNotFoundError):
                return [], list(_COMPANY_FIELDS)
            raise CorruptStorageError(
                f"Neither companies.csv nor its backup {backup.name} can be read; "
                "the application stopped modifying data to prevent data loss."
            ) from backup_error
        warnings.warn(
            "companies.csv is missing, corrupt, or unreadable; data is being loaded "
            f"from {backup.name}. Original error: {primary_error}",
            StorageRecoveryWarning,
            stacklevel=2,
        )
        return recovered, fields


@_locked
def load_companies() -> list[dict[str, Any]]:
    """Read the tracking list, using a valid backup instead of losing damaged data."""

    return _load_companies_with_fields()[0]


@_locked
def save_companies(
    records: Sequence[Mapping[str, Any]], *,
    company_columns: Sequence[Mapping[str, Any]] | None = None,
    drop_columns: Sequence[str] = (),
) -> None:
    """Atomically save flat UTF-8 CSV columns and retain omitted existing values."""

    columns = load_company_columns() if company_columns is None else _normalise_company_columns(list(company_columns))
    dropped = set(drop_columns)
    if dropped.intersection(_COMPANY_FIELDS) or dropped.intersection(column["id"] for column in columns):
        raise ValueError("Only removed custom company columns may be dropped from CSV.")
    path = _companies_path()
    backup = _validated_direct_file(_backup_path_for(path), BACKUPS_DIR)
    # Direct callers must not overwrite unreadable data or erase hidden fields.
    existing, previous_fields = _load_companies_with_fields()
    by_id = {company["id"]: company for company in existing}
    merged = []
    for record in records:
        if not isinstance(record, Mapping):
            raise ValueError("Every company must be an object.")
        merged.append({key: value for key, value in {**by_id.get(record.get("id"), {}), **record}.items() if key not in dropped})
    companies = _normalise_companies(merged, columns)
    fields = list(dict.fromkeys([
        *_COMPANY_FIELDS, *(column["id"] for column in columns),
        *(field for field in previous_fields if field not in dropped),
        *(key for company in companies for key in company),
    ]))
    path.parent.mkdir(parents=True, exist_ok=True)
    backup.parent.mkdir(parents=True, exist_ok=True)
    temporary = _prepare_temporary_file(path.with_name(f"{path.name}.tmp"), DATA_DIR)
    backup_temporary = backup.with_name(f"{backup.name}.tmp")
    try:
        with temporary.open("x", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows({key: str(value).lower() if isinstance(value, bool) else value
                              for key, value in company.items()} for company in companies)
            handle.flush()
            os.fsync(handle.fileno())
        _read_companies_csv(temporary, columns)
        if path.exists():
            try:
                _read_companies_csv(path)
            except (OSError, UnicodeError, csv.Error, ValueError):
                # Preserve the good backup used to recover a damaged primary.
                pass
            else:
                backup_temporary = _prepare_temporary_file(backup_temporary, BACKUPS_DIR)
                shutil.copy2(path, backup_temporary)
                _read_companies_csv(backup_temporary)
                os.replace(backup_temporary, backup)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()
        if backup_temporary.exists() and not backup_temporary.is_symlink():
            backup_temporary.unlink()


@_locked
def create_company(values: Mapping[str, Any]) -> dict[str, Any]:
    """Add a manual tracking record without creating or changing any job."""

    company = _normalise_company({**values, "id": str(uuid.uuid4())})
    companies = load_companies()
    companies.append(company)
    save_companies(companies)
    return dict(company)


@_locked
def update_company(company_id: str, values: Mapping[str, Any]) -> dict[str, Any]:
    """Change only supplied fields while retaining the record's UUID."""

    companies = load_companies()
    for index, existing in enumerate(companies):
        if existing["id"] == company_id:
            changed = _normalise_company({**existing, **values, "id": existing["id"]})
            companies[index] = changed
            save_companies(companies)
            return dict(changed)
    raise KeyError(f"Company not found: {company_id}")


@_locked
def delete_company(company_id: str) -> bool:
    """Delete only the selected UUID from the independent tracking list."""

    companies = load_companies()
    remaining = [company for company in companies if company["id"] != company_id]
    if len(remaining) == len(companies):
        return False
    save_companies(remaining)
    return True


_PROMPT_FIELDS = ("id", "created_at", "description", "content")


def _prompts_path() -> Path:
    _assert_local_storage_layout()
    return _validated_direct_file(DATA_DIR / "prompts.csv", DATA_DIR)


def _read_prompts_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, strict=True)
        if reader.fieldnames != list(_PROMPT_FIELDS):
            raise ValueError("prompts.csv must contain id,created_at,description,content columns.")
        records = list(reader)
    seen: set[str] = set()
    for record in records:
        if None in record or any(record.get(field) is None for field in _PROMPT_FIELDS):
            raise ValueError("Every prompt row must fit its CSV header.")
        prompt_id = record["id"]
        if str(uuid.UUID(prompt_id)) != prompt_id or prompt_id in seen:
            raise ValueError("Every prompt must have a unique UUID.")
        seen.add(prompt_id)
        if datetime.fromisoformat(record["created_at"]).tzinfo is None:
            raise ValueError("Prompt creation timestamps must include a timezone.")
    return records


@_locked
def load_prompts() -> list[dict[str, str]]:
    """Read literal CSV text without writing; recover only from a valid backup."""

    path = _prompts_path()
    backup = _validated_direct_file(_backup_path_for(path), BACKUPS_DIR)
    try:
        return _read_prompts_csv(path)
    except (OSError, UnicodeError, csv.Error, ValueError) as primary_error:
        try:
            recovered = _read_prompts_csv(backup)
        except (OSError, UnicodeError, csv.Error, ValueError) as backup_error:
            if isinstance(primary_error, FileNotFoundError) and isinstance(backup_error, FileNotFoundError):
                return []
            raise CorruptStorageError(
                "Neither prompts.csv nor its backup can be read; "
                "editing stopped to prevent data loss."
            ) from backup_error
        warnings.warn(
            f"prompts.csv could not be read; loaded {backup.name}. Original error: {primary_error}",
            StorageRecoveryWarning, stacklevel=2,
        )
        return recovered


@_locked
def save_prompts(records: Sequence[Mapping[str, str]]) -> None:
    """Use the existing CSV backup, fsync and atomic-replace storage convention."""

    path = _prompts_path()
    backup = _validated_direct_file(_backup_path_for(path), BACKUPS_DIR)
    load_prompts()  # Never overwrite unreadable existing data with an empty list.
    path.parent.mkdir(parents=True, exist_ok=True)
    backup.parent.mkdir(parents=True, exist_ok=True)
    temporary = _prepare_temporary_file(path.with_name(f"{path.name}.tmp"), DATA_DIR)
    backup_temporary = backup.with_name(f"{backup.name}.tmp")
    try:
        with temporary.open("x", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=_PROMPT_FIELDS)
            writer.writeheader()
            writer.writerows(records)
            handle.flush()
            os.fsync(handle.fileno())
        _read_prompts_csv(temporary)
        if path.exists():
            try:
                _read_prompts_csv(path)
            except (OSError, UnicodeError, csv.Error, ValueError):
                pass  # Keep the valid backup used to recover a damaged primary.
            else:
                backup_temporary = _prepare_temporary_file(backup_temporary, BACKUPS_DIR)
                shutil.copy2(path, backup_temporary)
                _read_prompts_csv(backup_temporary)
                os.replace(backup_temporary, backup)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()
        if backup_temporary.exists() and not backup_temporary.is_symlink():
            backup_temporary.unlink()


def _prompt_values(description: str, content: str) -> dict[str, str]:
    if not description.strip():
        raise ValueError("Description is required.")
    if not content.strip():
        raise ValueError("Prompt is required.")
    return {"description": description.strip(), "content": content}


@_locked
def create_prompt(description: str, content: str) -> dict[str, str]:
    values = _prompt_values(description, content)
    records = load_prompts()
    record = {"id": str(uuid.uuid4()), "created_at": _utc_now(), **values}
    save_prompts([*records, record])
    return record


@_locked
def update_prompt(prompt_id: str, description: str, content: str) -> dict[str, str]:
    values = _prompt_values(description, content)
    records = load_prompts()
    for index, existing in enumerate(records):
        if existing["id"] == prompt_id:
            records[index] = {**existing, **values}
            save_prompts(records)
            return records[index]
    raise KeyError(f"Prompt not found: {prompt_id}")


@_locked
def delete_prompt(prompt_id: str) -> bool:
    records = load_prompts()
    remaining = [record for record in records if record["id"] != prompt_id]
    if len(remaining) == len(records):
        return False
    save_prompts(remaining)
    return True


def _normalise_status(raw_status: Mapping[str, Any]) -> dict[str, Any]:
    status = dict(raw_status)
    status.setdefault("label", status.get("id", ""))
    status.setdefault("summary_group", "pending")
    status.setdefault("order", 0)
    status.setdefault("active", True)
    return status


def _normalise_custom_field(raw_field: Mapping[str, Any]) -> dict[str, Any]:
    field = dict(raw_field)
    field.setdefault("label", field.get("id", ""))
    field.setdefault("type", "text")
    field.setdefault("options", [])
    field.setdefault("show_in_table", False)
    field.setdefault("order", 0)
    field.setdefault("active", True)
    return field


def _normalise_settings_document(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("settings.json must be a JSON object.")
    document = dict(raw)
    document.setdefault("schema_version", 1)

    statuses = document.get("statuses")
    if statuses is None:
        statuses = copy.deepcopy(DEFAULT_STATUSES)
    if not isinstance(statuses, list) or any(not isinstance(item, dict) for item in statuses):
        raise ValueError("settings.json statuses must be a list of objects.")
    document["statuses"] = [_normalise_status(item) for item in statuses]

    custom_fields = document.get("custom_fields")
    if custom_fields is None:
        custom_fields = []
    if not isinstance(custom_fields, list) or any(
        not isinstance(item, dict) for item in custom_fields
    ):
        raise ValueError("settings.json custom_fields must be a list of objects.")
    document["custom_fields"] = [
        _normalise_custom_field(item) for item in custom_fields
    ]
    document["company_columns"] = _normalise_company_columns(document.get("company_columns", []))
    return document


def _validate_internal_id(value: Any, kind: str) -> str:
    if not isinstance(value, str) or not _INTERNAL_ID_PATTERN.fullmatch(value):
        raise ValueError(
            f"{kind} ID may contain only letters, numbers, underscores, and hyphens."
        )
    return value


def _validate_settings(document: Mapping[str, Any]) -> None:
    seen_status_ids: set[str] = set()
    for status in document["statuses"]:
        status_id = _validate_internal_id(status.get("id"), "Status")
        if status_id in seen_status_ids:
            raise ValueError(f"Duplicate status ID: {status_id}")
        seen_status_ids.add(status_id)
        if not str(status.get("label", "")).strip():
            raise ValueError("Status name cannot be blank.")
        if status.get("summary_group") not in SUMMARY_GROUPS:
            raise ValueError(
                "Status summary_group must be offer, rejected, or pending."
            )
        try:
            int(status.get("order", 0))
        except (TypeError, ValueError) as error:
            raise ValueError("Status order must be an integer.") from error

    seen_field_ids: set[str] = set()
    for field in document["custom_fields"]:
        field_id = _validate_internal_id(field.get("id"), "Custom field")
        if field_id in seen_field_ids:
            raise ValueError(f"Duplicate custom field ID: {field_id}")
        seen_field_ids.add(field_id)
        if not str(field.get("label", "")).strip():
            raise ValueError("Custom field name cannot be blank.")
        field_type = field.get("type")
        if field_type not in CUSTOM_FIELD_TYPES:
            raise ValueError(
                "Custom field type must be text, date, select, or checkbox."
            )
        options = field.get("options", [])
        if not isinstance(options, list):
            raise ValueError("Custom field options must be a list.")
        if field_type == "select" and not [str(option).strip() for option in options if str(option).strip()]:
            raise ValueError("A select custom field requires at least one option.")
        try:
            int(field.get("order", 0))
        except (TypeError, ValueError) as error:
            raise ValueError("Custom field order must be an integer.") from error


@_locked
def load_settings() -> dict[str, Any]:
    """Load status and custom-field configuration with legacy defaults."""

    ensure_storage()
    return _load_settings_document()


def _load_settings_document() -> dict[str, Any]:
    """Read settings with recovery without initializing unrelated job storage."""

    try:
        settings = _normalise_settings_document(_read_json(SETTINGS_FILE))
        _validate_settings(settings)
        return settings
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as primary_error:
        backup = _backup_path_for(SETTINGS_FILE)
        try:
            recovered = _normalise_settings_document(_read_json(backup))
            _validate_settings(recovered)
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as backup_error:
            if isinstance(primary_error, FileNotFoundError) and isinstance(backup_error, FileNotFoundError):
                return copy.deepcopy(DEFAULT_SETTINGS)
            raise CorruptStorageError(
                f"Neither settings.json nor its backup {backup.name} can be read; "
                "the application stopped modifying data to prevent data loss."
            ) from backup_error
        warnings.warn(
            "settings.json is corrupt or incorrectly formatted; data is being "
            f"loaded from settings.json.bak. Original error: {primary_error}",
            StorageRecoveryWarning,
            stacklevel=2,
        )
        return recovered


@_locked
def save_settings(settings: Mapping[str, Any], *, initialise_storage: bool = True) -> None:
    """Validate and atomically save settings."""

    if initialise_storage:
        ensure_storage()
    document = _normalise_settings_document(dict(settings))
    _validate_settings(document)
    atomic_write_json(SETTINGS_FILE, document)


def _validate_applied_date(value: Any) -> str:
    if value in (None, ""):
        return ""
    text = str(value)
    try:
        parsed = date.fromisoformat(text)
    except ValueError as error:
        raise ValueError("applied_date must use YYYY-MM-DD format.") from error
    if parsed.isoformat() != text:
        raise ValueError("applied_date must use YYYY-MM-DD format.")
    return text


def validate_job_values(job: dict[str, Any]) -> dict[str, Any]:
    """Validate common editable values before creating or updating a job."""

    job["company"] = str(job.get("company", "")).strip()
    job["job_title"] = str(job.get("job_title", "")).strip()
    job["email"] = str(job.get("email", "")).strip()
    if not job["company"]:
        raise ValueError("company cannot be blank.")
    if not job["job_title"]:
        raise ValueError("job_title cannot be blank.")
    job["applied_date"] = _validate_applied_date(job.get("applied_date", ""))
    if not isinstance(job.get("custom_fields"), dict):
        raise ValueError("custom_fields must be an object.")
    if job.get("source", "manual") not in ("manual", "import", "extension"):
        raise ValueError("Invalid job source.")
    stats = job.get("autofill_stats")
    if stats is not None:
        if not isinstance(stats, dict):
            raise ValueError("autofill_stats must be an object or null.")
        filled, detected = stats.get("filled"), stats.get("detected")
        if type(filled) is not int or type(detected) is not int or not 0 <= filled <= detected:
            raise ValueError("autofill_stats requires 0 <= filled <= detected integers.")
        try:
            recorded_at = datetime.fromisoformat(stats["recorded_at"])
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError("autofill_stats.recorded_at must be an ISO timestamp.") from error
        if recorded_at.tzinfo is None:
            raise ValueError("autofill_stats.recorded_at must include a timezone.")
    return job


def _new_job_record(job_data: Mapping[str, Any]) -> dict[str, Any]:
    """Give a new job the same defaults and generated identity for every entry path."""

    now = _utc_now()
    source = dict(job_data)
    source.pop("id", None)
    source.pop("created_at", None)
    source.pop("updated_at", None)
    job = _normalise_job(source)
    job["id"] = str(uuid.uuid4())
    job["created_at"] = now
    job["updated_at"] = now
    return job


def _append_jobs(jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    document = load_jobs()
    document["jobs"].extend(jobs)
    save_jobs(document)
    failures: list[tuple[str, str]] = []
    for job in jobs:
        try:
            get_job_directory(job["id"], create=True)
        except (OSError, ValueError) as error:
            failures.append((job["id"], str(error)))
    if failures:
        raise JobDirectoriesError(jobs, failures)
    return copy.deepcopy(jobs)


@_locked
def create_job(job_data: Mapping[str, Any]) -> dict[str, Any]:
    """Create a job with a new stable UUID and its application directory."""

    job = validate_job_values(_new_job_record(job_data))
    _validate_job_status(job)
    return _append_jobs([job])[0]


@_locked
def create_jobs_batch(validated_jobs: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Append an already validated batch using one fresh read and one atomic save.

    Import validation belongs at the JSON boundary, before any records or folders
    are created. A folder error after saving raises JobDirectoriesError so callers
    can report the persisted jobs and prevent accidental duplicate retries.
    """

    if not validated_jobs:
        return []
    return _append_jobs([_new_job_record(job) for job in validated_jobs])



def _validate_job_status(job: Mapping[str, Any]) -> None:
    if job.get("status_id") not in {status["id"] for status in _load_settings_document()["statuses"]}:
        raise ValueError("status_id must be a configured status ID.")


def canonicalize_job_url(url: str) -> str:
    """Normalize identity while retaining query parameters which select a job."""

    if not isinstance(url, str):
        raise ValueError("job_url must be an HTTP URL.")
    parts = urlsplit(url.strip())
    if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
        raise ValueError("job_url must be an HTTP URL.")
    host = parts.hostname.lower()
    if ":" in host:
        host = f"[{host}]"
    port = parts.port
    if port is not None and (parts.scheme.lower(), port) not in (("http", 80), ("https", 443)):
        host = f"{host}:{port}"
    query = sorted(
        (key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if not key.lower().startswith("utm_") and key.lower() not in ("gclid", "fbclid")
    )
    return urlunsplit((parts.scheme.lower(), host, parts.path.rstrip("/") or "/", urlencode(query), ""))


@_locked
def find_jobs_by_url(url: str | None = None) -> list[dict[str, Any]]:
    """Find all jobs, or those whose normalized URL matches the supplied URL."""

    jobs = load_jobs()["jobs"]
    if url is None:
        return copy.deepcopy(jobs)
    canonical = canonicalize_job_url(url)
    matches = []
    for job in jobs:
        try:
            identity = job.get("canonical_url") or canonicalize_job_url(job.get("job_url", ""))
        except ValueError:
            continue  # Legacy manual jobs may contain a label instead of an HTTP URL.
        if identity == canonical:
            matches.append(copy.deepcopy(job))
    return matches


@_locked
def upsert_job_by_url(values: Mapping[str, Any]) -> dict[str, Any]:
    """Create once per URL; updates preserve fields omitted by the caller."""

    changes = dict(values)
    canonical = canonicalize_job_url(changes.get("job_url", ""))
    matches = find_jobs_by_url(canonical)
    changes["canonical_url"] = canonical
    if matches:
        return update_job(matches[0]["id"], changes)
    changes.setdefault("status_id", "planning")
    return create_job(changes)


@_locked
def get_job_notes(job_id: str) -> str:
    if get_job_by_id(job_id) is None:
        raise KeyError("Job not found.")
    return load_text_file(get_job_directory(job_id) / "notes.md")


@_locked
def save_job_notes(job_id: str, text: str) -> str:
    if get_job_by_id(job_id) is None:
        raise KeyError("Job not found.")
    save_text_file(get_job_directory(job_id) / "notes.md", text)
    return text


@_locked
def get_api_token() -> str:
    """Generate the local API credential once and keep it in local settings."""

    settings = load_settings()
    token = settings.get("api_token")
    if not token:
        token = secrets.token_urlsafe(32)
        settings["api_token"] = token
        save_settings(settings)
    return token


_EXTENSION_STATUS_IDS = {
    "saved": "planning", "to_apply": "planning", "draft": "planning",
    "draft_prepared": "planning", "form_filled": "planning",
    "resume_uploaded": "planning", "ready_to_submit": "planning", "failed": "planning",
    "applied": "applied", "submitted": "applied",
    "interview": "interviewing", "interviewing": "interviewing",
    "offer": "offer", "accepted": "offer", "rejected": "rejected",
    "withdrawn": "planning",
}


def _extension_notes_markdown(notes: Any) -> str:
    """Keep Console note dates, titles and Markdown in the tracker's one file."""

    if notes is None:
        return ""
    if isinstance(notes, str):
        return notes
    if not isinstance(notes, list):
        raise ValueError("Extension notes must be text or a list of note objects.")
    sections = []
    for note in notes:
        if not isinstance(note, Mapping):
            raise ValueError("Each extension note must be an object.")
        fields = {}
        for key in ("date", "title", "contentMarkdown", "content", "nextAction", "createdAt"):
            value = note.get(key) or ""
            if not isinstance(value, str):
                raise ValueError(f"Extension note {key} must be text.")
            fields[key] = value.strip()
        date_text = fields["date"] or fields["createdAt"][:10]
        title = fields["title"] or "Untitled Note"
        heading = " · ".join(part for part in (date_text, title) if part)
        content = fields["contentMarkdown"] or fields["content"]
        if not content and fields["nextAction"]:
            content = "## Next Action\n" + fields["nextAction"]
        sections.append(f"## {heading}\n\n{content}".rstrip())
    return "\n\n---\n\n".join(sections)


@_locked
def import_extension_jobs(records: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Import legacy extension jobs once, without overwriting later tracker edits."""

    prepared = []
    for record in records:
        status = str(record.get("status", "saved")).lower()
        if status not in _EXTENSION_STATUS_IDS:
            raise ValueError("Unknown extension status.")
        values = {
            "company": record.get("company", ""),
            "job_title": record.get("jobTitle") or record.get("role", ""),
            "job_url": record.get("jobUrl", ""),
            "location": record.get("location", ""),
            "status_id": _EXTENSION_STATUS_IDS[status],
            "applied_date": str(record.get("appliedAt") or "")[:10],
            "source": "import",
        }
        if "filledFieldCount" in record or "formFieldCount" in record:
            values["autofill_stats"] = {
                "filled": record.get("filledFieldCount", 0),
                "detected": record.get("formFieldCount", 0),
                "recorded_at": record.get("updatedAt") or record.get("createdAt") or _utc_now(),
            }
        values = validate_job_values(_normalise_job(values))
        canonicalize_job_url(values["job_url"])
        _validate_job_status(values)
        prepared.append((values, status == "withdrawn", _extension_notes_markdown(record.get("notes"))))
    imported = []
    for values, withdrawn, notes in prepared:
        matches = find_jobs_by_url(values["job_url"])
        if matches:
            imported.append(matches[0])
            continue
        job = upsert_job_by_url(values)
        if withdrawn:
            job = archive_job(job["id"])
        if notes:
            save_job_notes(job["id"], notes)
        imported.append(job)
    return imported


def _canonical_job_id(job_id: Any) -> str:
    if not isinstance(job_id, str):
        raise ValueError("Job ID must be a complete UUID string.")
    try:
        canonical = str(uuid.UUID(job_id))
    except (ValueError, AttributeError) as error:
        raise ValueError("Job ID must be a complete UUID string.") from error
    if canonical != job_id:
        raise ValueError("Job ID must be a canonical lowercase UUID string.")
    return canonical


@_locked
def get_job_by_id(job_id: str) -> dict[str, Any] | None:
    """Return a defensive copy of one job, or None when it does not exist."""

    canonical = _canonical_job_id(job_id)
    for job in load_jobs()["jobs"]:
        if job.get("id") == canonical:
            return copy.deepcopy(job)
    return None


@_locked
def update_job(job_id: str, updates: Mapping[str, Any]) -> dict[str, Any]:
    """Update a job while preserving its UUID and creation timestamp."""

    canonical = _canonical_job_id(job_id)
    document = load_jobs()
    for index, existing in enumerate(document["jobs"]):
        if existing.get("id") != canonical:
            continue
        changed = dict(existing)
        changed.update(dict(updates))
        changed["id"] = canonical
        changed["created_at"] = existing.get("created_at", "")
        changed["updated_at"] = _utc_now()
        changed = validate_job_values(_normalise_job(changed))
        if "status_id" in updates:
            _validate_job_status(changed)
        if "job_url" in updates:
            try:
                changed["canonical_url"] = canonicalize_job_url(changed["job_url"])
            except ValueError:
                changed["canonical_url"] = ""
        document["jobs"][index] = changed
        save_jobs(document)
        return copy.deepcopy(changed)
    raise KeyError(f"Job not found: {canonical}")


@_locked
def archive_job(job_id: str, archived: bool = True) -> dict[str, Any]:
    """Archive or unarchive a job without deleting any application files."""

    return update_job(job_id, {"archived": bool(archived)})


@_locked
def get_job_directory(job_id: str, create: bool = False) -> Path:
    """Return a validated UUID directory located directly under applications/."""

    canonical = _canonical_job_id(job_id)
    expected_applications_root = PROJECT_ROOT.resolve() / "applications"
    applications_root = APPLICATIONS_DIR.resolve()
    if applications_root != expected_applications_root:
        raise ValueError("The applications directory must not point outside the project.")
    directory = (APPLICATIONS_DIR / canonical).resolve()
    if directory != applications_root / canonical:
        raise ValueError("Job directories must be located inside applications.")
    if create:
        APPLICATIONS_DIR.mkdir(parents=True, exist_ok=True)
        directory.mkdir(exist_ok=True)
    return directory


@_locked
def delete_job(job_id: str) -> None:
    """Delete one job and only its validated applications/<uuid> directory."""

    canonical = _canonical_job_id(job_id)
    # Validate and resolve the deletion target before modifying jobs.json.
    directory = get_job_directory(canonical)
    document = load_jobs()
    remaining = [job for job in document["jobs"] if job.get("id") != canonical]
    if len(remaining) == len(document["jobs"]):
        raise KeyError(f"Job not found: {canonical}")
    document["jobs"] = remaining
    save_jobs(document)
    if directory.exists():
        shutil.rmtree(directory)


def _validated_application_file(path: str | Path) -> Path:
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = PROJECT_ROOT / candidate
    supplied_name = candidate.name
    supplied_job_id = _canonical_job_id(candidate.parent.name)
    expected_applications_root = PROJECT_ROOT.resolve() / "applications"
    applications_root = APPLICATIONS_DIR.resolve()
    if applications_root != expected_applications_root:
        raise ValueError("The applications directory must not point outside the project.")
    expected_parent = applications_root / supplied_job_id
    candidate = candidate.resolve()
    if candidate.parent != expected_parent or candidate.name != supplied_name:
        raise ValueError("Files must be located in applications/<job_id>/.")
    return candidate


def _job_nested_path(job_id: str, *parts: str) -> Path:
    """Return one fixed descendant of a job directory without following symlinks."""

    if not parts or any(part in {"", ".", ".."} or "/" in part for part in parts):
        raise ValueError("Invalid application path.")
    root = get_job_directory(job_id)
    expected = root.joinpath(*parts)
    if expected.resolve() != expected:
        raise ValueError("Application paths must not use symbolic links.")
    return expected


def _ensure_job_folder(job_id: str, name: str) -> Path:
    get_job_directory(job_id, create=True)
    folder = _job_nested_path(job_id, name)
    folder.mkdir(exist_ok=True)
    if not folder.is_dir() or folder.is_symlink():
        raise ValueError(f"{name} must be a regular directory inside the job folder.")
    return folder


def _atomic_write_job_bytes(job_id: str, parts: Sequence[str], data: bytes) -> Path:
    destination = _job_nested_path(job_id, *parts)
    temporary = _job_nested_path(
        job_id, *parts[:-1], f"{parts[-1]}.tmp"
    )
    if temporary.exists():
        if not temporary.is_file() or temporary.is_symlink():
            raise ValueError(f"Cannot safely use temporary file: {temporary.name}")
        temporary.unlink()
    try:
        with temporary.open("xb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    finally:
        if temporary.exists() and not temporary.is_symlink():
            temporary.unlink()
    return destination


def _atomic_write_job_json(
    job_id: str, parts: Sequence[str], document: Mapping[str, Any]
) -> Path:
    payload = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
    return _atomic_write_job_bytes(job_id, parts, payload.encode("utf-8"))


def _reminder_path(job_id: str, filename: str = "reminders.json") -> Path:
    """Keep the document, backup, and temporary files in a real job directory."""

    _assert_local_storage_layout()
    canonical = _canonical_job_id(job_id)
    if (APPLICATIONS_DIR / canonical).is_symlink():
        raise ValueError("Reminder job directories must not use symbolic links.")
    directory = get_job_directory(canonical)
    if directory.exists() and not directory.is_dir():
        raise ValueError("Reminder storage requires a regular job directory.")
    return _validated_direct_file(directory / filename, directory)


def _canonical_reminder_id(reminder_id: Any) -> str:
    try:
        return _canonical_job_id(reminder_id)
    except ValueError as error:
        raise ValueError("Reminder ID must be a canonical lowercase UUID string.") from error


def _reminder_timestamp(value: Any, field: str) -> datetime:
    """Require an ISO timestamp with an explicit offset, never a naive datetime."""

    if not isinstance(value, str) or "T" not in value:
        raise ValueError(f"Reminder {field} must be an ISO 8601 timestamp with a UTC offset.")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as error:
        raise ValueError(f"Reminder {field} must be an ISO 8601 timestamp with a UTC offset.") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"Reminder {field} must include a UTC offset.")
    return parsed


def _validate_reminder(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("Each reminder must be a JSON object.")
    _canonical_reminder_id(raw.get("id"))
    if not isinstance(raw.get("title"), str) or not raw["title"].strip():
        raise ValueError("Reminder title cannot be blank.")
    if raw.get("kind") not in REMINDER_KINDS:
        raise ValueError("Reminder type must be Interview, Assessment, Deadline, Follow-up, or Other.")
    if raw.get("status") not in REMINDER_STATUSES:
        raise ValueError("Reminder status must be scheduled, completed, or cancelled.")
    timezone_name = raw.get("timezone")
    if not isinstance(timezone_name, str) or not timezone_name:
        raise ValueError("Reminder timezone must be an IANA timezone name.")
    try:
        event_zone = ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise ValueError("Reminder timezone must be a valid IANA timezone name.") from error
    start = _reminder_timestamp(raw.get("start_at"), "start_at")
    end = None if raw.get("end_at") is None else _reminder_timestamp(raw["end_at"], "end_at")
    for field, parsed in (("start_at", start), ("end_at", end)):
        if parsed is None:
            continue
        try:
            local = parsed.astimezone(event_zone)
        except (ValueError, OverflowError) as error:
            raise ValueError(f"Reminder {field} cannot be represented in its timezone.") from error
        # Round-tripping the instant rejects nonexistent DST wall times and an
        # offset copied from a different season. Both explicitly selected folds
        # of a repeated time remain valid and distinct instants.
        if local.replace(tzinfo=None) != parsed.replace(tzinfo=None) or local.utcoffset() != parsed.utcoffset():
            raise ValueError(f"Reminder {field} does not match its timezone's date and UTC offset.")
    if end is not None and end.astimezone(timezone.utc) <= start.astimezone(timezone.utc):
        raise ValueError("Reminder end date/time must be later than its start date/time.")
    for field in ("location_or_url", "notes"):
        if not isinstance(raw.get(field), str):
            raise ValueError(f"Reminder {field} must be text.")
    for field in ("created_at", "updated_at"):
        _reminder_timestamp(raw.get(field), field)
    result = copy.deepcopy(raw)
    result["title"] = result["title"].strip()
    result["end_at"] = raw.get("end_at")
    return result


def _validate_reminders_document(raw: Any) -> dict[str, Any]:
    if (
        not isinstance(raw, dict)
        or type(raw.get("schema_version")) is not int
        or raw["schema_version"] != REMINDER_SCHEMA_VERSION
        or not isinstance(raw.get("reminders"), list)
    ):
        raise ValueError("reminders.json must contain schema_version 1 and a reminders list.")
    reminders = [_validate_reminder(item) for item in raw["reminders"]]
    if len({item["id"] for item in reminders}) != len(reminders):
        raise ValueError("Reminder UUIDs must be unique within a job.")
    return {"schema_version": REMINDER_SCHEMA_VERSION, "reminders": reminders}


@_locked
def load_reminders(job_id: str) -> dict[str, Any]:
    """Read only; missing old-job files are empty, damaged files are never reset."""

    path = _reminder_path(job_id)
    backup = _reminder_path(job_id, "reminders.json.bak")
    if not path.exists() and not backup.exists():
        return {"schema_version": REMINDER_SCHEMA_VERSION, "reminders": []}
    try:
        return _validate_reminders_document(_read_json(path))
    except (OSError, UnicodeError, ValueError) as primary_error:
        try:
            recovered = _validate_reminders_document(_read_json(backup))
        except (OSError, UnicodeError, ValueError) as backup_error:
            raise CorruptStorageError(
                f"Reminders for job {job_id}: neither reminders.json nor its backup "
                "can be safely read. Existing data has not been changed; restore a "
                "valid file before editing reminders."
            ) from backup_error
        warnings.warn(
            f"Reminders for job {job_id}: reminders.json is missing or corrupt; "
            "reading the previous valid reminders.json.bak. The latest changes "
            "may be absent. Existing files have not been changed. "
            f"Original error: {primary_error}",
            StorageRecoveryWarning,
            stacklevel=2,
        )
        return recovered


@_locked
def list_reminders(job_id: str) -> list[dict[str, Any]]:
    """Return fresh data sorted by the actual event instant and stable UUID."""

    return sorted(
        load_reminders(job_id)["reminders"],
        key=lambda item: (_reminder_timestamp(item["start_at"], "start_at").astimezone(timezone.utc), item["id"]),
    )


def _write_reminders(job_id: str, document: Mapping[str, Any]) -> None:
    """Reuse atomic job writes and keep a valid rolling backup beside the data."""

    validated = _validate_reminders_document(dict(document))
    path = _reminder_path(job_id)
    for filename in ("reminders.json.tmp", "reminders.json.bak", "reminders.json.bak.tmp"):
        _reminder_path(job_id, filename)
    # Recheck before any write, so no caller can replace unrecoverable damage
    # with an empty or newly constructed document.
    load_reminders(job_id)
    get_job_directory(job_id, create=True)
    if path.exists():
        try:
            previous = _validate_reminders_document(_read_json(path))
        except (OSError, UnicodeError, ValueError):
            pass  # Preserve the valid backup when recovering a damaged primary.
        else:
            _atomic_write_job_json(job_id, ("reminders.json.bak",), previous)
    _atomic_write_job_json(job_id, ("reminders.json",), validated)


@_locked
def create_reminder(job_id: str, reminder_data: Mapping[str, Any]) -> dict[str, Any]:
    """Create a reminder only when explicitly called by a save action."""

    document = load_reminders(job_id)
    now = _utc_now()
    reminder = {field: reminder_data[field] for field in _REMINDER_EDITABLE_FIELDS if field in reminder_data}
    reminder.update(id=str(uuid.uuid4()), created_at=now, updated_at=now)
    reminder.setdefault("status", "scheduled")
    reminder.setdefault("end_at", None)
    reminder.setdefault("location_or_url", "")
    reminder.setdefault("notes", "")
    reminder = _validate_reminder(reminder)
    document["reminders"].append(reminder)
    _write_reminders(job_id, document)
    return copy.deepcopy(reminder)


@_locked
def update_reminder(job_id: str, reminder_id: str, updates: Mapping[str, Any]) -> dict[str, Any]:
    """Edit only reminder fields; the UUID and creation timestamp stay unchanged."""

    canonical = _canonical_reminder_id(reminder_id)
    document = load_reminders(job_id)
    for index, existing in enumerate(document["reminders"]):
        if existing["id"] != canonical:
            continue
        changed = dict(existing)
        changed.update({field: updates[field] for field in _REMINDER_EDITABLE_FIELDS if field in updates})
        changed["updated_at"] = _utc_now()
        changed = _validate_reminder(changed)
        document["reminders"][index] = changed
        _write_reminders(job_id, document)
        return copy.deepcopy(changed)
    raise KeyError(f"Reminder not found: {canonical}")


@_locked
def set_reminder_status(job_id: str, reminder_id: str, status: str) -> dict[str, Any]:
    return update_reminder(job_id, reminder_id, {"status": status})


@_locked
def delete_reminder(job_id: str, reminder_id: str) -> bool:
    """Remove one UUID only; the UI must obtain deletion confirmation first."""

    canonical = _canonical_reminder_id(reminder_id)
    document = load_reminders(job_id)
    remaining = [item for item in document["reminders"] if item["id"] != canonical]
    if len(remaining) == len(document["reminders"]):
        return False
    document["reminders"] = remaining
    _write_reminders(job_id, document)
    return True


@_locked
def load_text_file(path: str | Path) -> str:
    """Load a UTF-8 application text file, returning blank when absent."""

    source = _validated_application_file(path)
    if not source.exists():
        return ""
    return source.read_text(encoding="utf-8")


@_locked
def save_text_file(path: str | Path, text: str) -> None:
    """Atomically save a UTF-8 application text file."""

    destination = _validated_application_file(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = _validated_application_file(
        destination.with_name(f"{destination.name}.tmp")
    )
    if temporary.exists():
        if not temporary.is_file():
            raise ValueError(f"Cannot safely use temporary file: {temporary.name}")
        temporary.unlink()
    try:
        with temporary.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(str(text))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    finally:
        if temporary.exists():
            temporary.unlink()


def _coerce_pdf_bytes(content: bytes | bytearray | BinaryIO) -> bytes:
    if isinstance(content, bytes):
        return content
    if isinstance(content, bytearray):
        return bytes(content)
    if hasattr(content, "getvalue"):
        value = content.getvalue()
    elif hasattr(content, "read"):
        value = content.read()
    else:
        raise TypeError("PDF content must be bytes or a readable binary file.")
    if not isinstance(value, (bytes, bytearray)):
        raise TypeError("PDF content must be binary data.")
    return bytes(value)


def _looks_like_pdf(content: bytes) -> bool:
    return content[:1024].lstrip().startswith(b"%PDF")


@_locked
def save_uploaded_pdf(job_id: str, content: bytes | bytearray | BinaryIO) -> Path:
    """Validate and atomically store applications/<job_id>/resume.pdf."""

    data = _coerce_pdf_bytes(content)
    if not _looks_like_pdf(data):
        raise ValueError("The uploaded content is not a valid PDF (missing %PDF header).")
    directory = get_job_directory(job_id, create=True)
    destination = _validated_application_file(directory / "resume.pdf")
    temporary = _validated_application_file(directory / "resume.pdf.tmp")
    if temporary.exists():
        if not temporary.is_file():
            raise ValueError("Cannot safely use temporary file: resume.pdf.tmp")
        temporary.unlink()
    try:
        with temporary.open("xb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        if not _looks_like_pdf(temporary.read_bytes()):
            raise ValueError("PDF temporary file validation failed.")
        os.replace(temporary, destination)
    finally:
        if temporary.exists():
            temporary.unlink()
    return destination


@_locked
def load_resume_pdf(job_id: str) -> bytes | None:
    """Read the locally stored resume PDF, or return None when absent."""

    path = _validated_application_file(get_job_directory(job_id) / "resume.pdf")
    return path.read_bytes() if path.is_file() else None


@_locked
def get_resume_pdf_metadata(job_id: str) -> dict[str, Any] | None:
    """Return local resume PDF name, byte size and UTC modification time."""

    path = _validated_application_file(get_job_directory(job_id) / "resume.pdf")
    if not path.is_file():
        return None
    stat = path.stat()
    return {
        "filename": path.name,
        "size": stat.st_size,
        "modified_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
    }


@_locked
def delete_resume_pdf(job_id: str) -> bool:
    """Delete the local resume PDF and report whether one existed."""

    path = _validated_application_file(get_job_directory(job_id) / "resume.pdf")
    if not path.is_file():
        return False
    path.unlink()
    return True


def find_pdflatex() -> str | None:
    """Locate the local pdflatex executable, including the standard macOS path."""

    discovered = shutil.which("pdflatex")
    if discovered:
        return discovered
    macos_path = Path("/Library/TeX/texbin/pdflatex")
    if macos_path.is_file() and os.access(macos_path, os.X_OK):
        return str(macos_path)
    return None


def _process_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


def _compile_error_summary(log: str, fallback: str) -> str:
    for raw_line in log.splitlines():
        line = raw_line.strip()
        if line.startswith("!"):
            return line.lstrip("! ") or fallback
        if "LaTeX Error:" in line or "Emergency stop" in line:
            return line
    return fallback


def load_compile_status(job_id: str) -> dict[str, Any] | None:
    path = _job_nested_path(job_id, "build", "compile_status.json")
    if not path.is_file():
        return None
    raw = _read_json(path)
    if not isinstance(raw, dict):
        raise ValueError("compile_status.json must contain a JSON object.")
    return raw


def load_compile_log(job_id: str) -> str:
    path = _job_nested_path(job_id, "build", "resume.log")
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def load_compiled_preview(job_id: str) -> bytes | None:
    path = _job_nested_path(job_id, "build", "preview.pdf")
    if not path.is_file():
        return None
    data = path.read_bytes()
    return data if _looks_like_pdf(data) else None


@_locked
def compile_resume_latex(job_id: str, source: str) -> dict[str, Any]:
    """Save resume.tex and publish a preview only after a successful pdflatex run."""

    source_text = str(source)
    job_directory = get_job_directory(job_id, create=True)
    save_text_file(job_directory / "resume.tex", source_text)
    build_directory = _ensure_job_folder(job_id, "build")

    previous_status = load_compile_status(job_id) or {}
    previous_preview = load_compiled_preview(job_id)
    last_successful_at = previous_status.get("compiled_at") if previous_preview else None
    preview_source_hash = (
        previous_status.get("preview_source_hash", "") if previous_preview else ""
    )
    if previous_preview is not None and not last_successful_at:
        preview_path = _job_nested_path(job_id, "build", "preview.pdf")
        last_successful_at = datetime.fromtimestamp(
            preview_path.stat().st_mtime, timezone.utc
        ).isoformat()

    attempted_at = _utc_now()
    source_hash = hashlib.sha256(source_text.encode("utf-8")).hexdigest()
    executable = find_pdflatex()
    staging_name = f".compile-{uuid.uuid4()}"
    staging_directory = _job_nested_path(job_id, "build", staging_name)
    staging_directory.mkdir()

    return_code: int | None = None
    timed_out = False
    success = False
    error_summary = ""
    log = ""

    try:
        if executable is None:
            error_summary = (
                "pdflatex was not found. Install MacTeX or BasicTeX, then restart "
                "the application."
            )
            log = error_summary
        else:
            command = [
                executable,
                "-interaction=nonstopmode",
                "-halt-on-error",
                "-no-shell-escape",
                f"-output-directory={staging_directory}",
                "resume.tex",
            ]
            try:
                completed = subprocess.run(
                    command,
                    cwd=job_directory,
                    capture_output=True,
                    text=True,
                    timeout=LATEX_TIMEOUT_SECONDS,
                    shell=False,
                )
                return_code = completed.returncode
                stdout = _process_text(completed.stdout)
                stderr = _process_text(completed.stderr)
            except subprocess.TimeoutExpired as exc:
                timed_out = True
                stdout = _process_text(exc.stdout)
                stderr = _process_text(exc.stderr)
                error_summary = (
                    f"Compilation timed out after {LATEX_TIMEOUT_SECONDS} seconds."
                )
            except (OSError, UnicodeError) as exc:
                stdout = ""
                stderr = str(exc)
                error_summary = f"Could not run pdflatex: {exc}"

            engine_log_path = staging_directory / "resume.log"
            engine_log = (
                engine_log_path.read_text(encoding="utf-8", errors="replace")
                if engine_log_path.is_file() and not engine_log_path.is_symlink()
                else ""
            )
            sections = [section for section in (engine_log, stdout, stderr) if section]
            log = "\n\n".join(sections)

            candidate = staging_directory / "resume.pdf"
            if return_code == 0 and candidate.is_file() and not candidate.is_symlink():
                candidate_data = candidate.read_bytes()
                if _looks_like_pdf(candidate_data):
                    _atomic_write_job_bytes(
                        job_id, ("build", "preview.pdf"), candidate_data
                    )
                    success = True
                    last_successful_at = attempted_at
                    preview_source_hash = source_hash
                else:
                    error_summary = "pdflatex produced an invalid PDF."
            elif not error_summary:
                error_summary = (
                    "pdflatex did not produce a PDF."
                    if return_code == 0
                    else f"pdflatex exited with status {return_code}."
                )

            auxiliary = staging_directory / "resume.aux"
            if auxiliary.is_file() and not auxiliary.is_symlink():
                _atomic_write_job_bytes(
                    job_id, ("build", "resume.aux"), auxiliary.read_bytes()
                )

        if not success:
            error_summary = _compile_error_summary(log, error_summary)
            if error_summary and error_summary not in log:
                log = f"{error_summary}\n\n{log}".rstrip()

        status: dict[str, Any] = {
            "schema_version": COMPILE_STATUS_SCHEMA_VERSION,
            "success": success,
            "attempted_at": attempted_at,
            "compiled_at": last_successful_at,
            "source_hash": source_hash,
            "preview_source_hash": preview_source_hash,
            "return_code": return_code,
            "timed_out": timed_out,
            "error_summary": error_summary,
        }
        _atomic_write_job_bytes(
            job_id, ("build", "resume.log"), log.encode("utf-8")
        )
        _atomic_write_job_json(
            job_id, ("build", "compile_status.json"), status
        )
        return status
    finally:
        if (
            staging_directory.is_dir()
            and not staging_directory.is_symlink()
            and staging_directory.resolve().parent == build_directory
        ):
            shutil.rmtree(staging_directory)


def _clean_pdf_label(label: str) -> str:
    cleaned = str(label).strip()
    if not cleaned:
        raise ValueError("PDF version name cannot be blank.")
    return cleaned


def _pdf_index_path(job_id: str) -> Path:
    return _job_nested_path(job_id, "pdfs", "index.json")


def _read_pdf_index(job_id: str) -> dict[str, Any]:
    path = _pdf_index_path(job_id)
    if not path.is_file():
        return {"schema_version": PDF_LIBRARY_SCHEMA_VERSION, "versions": []}
    raw = _read_json(path)
    if not isinstance(raw, dict) or not isinstance(raw.get("versions"), list):
        raise ValueError("pdfs/index.json must contain a versions list.")
    return raw


def _write_pdf_index(job_id: str, document: Mapping[str, Any]) -> None:
    _atomic_write_job_json(job_id, ("pdfs", "index.json"), document)


def _pdf_version_path(job_id: str, version_id: str) -> Path:
    canonical = _canonical_job_id(version_id)
    return _job_nested_path(job_id, "pdfs", f"{canonical}.pdf")


def _migrate_legacy_resume_pdf(job_id: str) -> dict[str, Any]:
    """Create the first library index and import a legacy resume.pdf once."""

    _ensure_job_folder(job_id, "pdfs")
    index_path = _pdf_index_path(job_id)
    if index_path.exists():
        return _read_pdf_index(job_id)

    document: dict[str, Any] = {
        "schema_version": PDF_LIBRARY_SCHEMA_VERSION,
        "versions": [],
    }
    legacy_path = _validated_application_file(
        get_job_directory(job_id) / "resume.pdf"
    )
    migrated_path: Path | None = None
    if legacy_path.is_file():
        data = legacy_path.read_bytes()
        if not _looks_like_pdf(data):
            raise ValueError("The existing resume.pdf is not a valid PDF.")
        version_id = str(uuid.uuid4())
        migrated_path = _pdf_version_path(job_id, version_id)
        _atomic_write_job_bytes(
            job_id, ("pdfs", f"{version_id}.pdf"), data
        )
        document["versions"].append(
            {
                "id": version_id,
                "filename": f"{version_id}.pdf",
                "label": "Imported resume.pdf",
                "source": "legacy",
                "original_filename": "resume.pdf",
                "created_at": datetime.fromtimestamp(
                    legacy_path.stat().st_mtime, timezone.utc
                ).isoformat(),
            }
        )

    try:
        _write_pdf_index(job_id, document)
    except Exception:
        if migrated_path is not None and migrated_path.is_file():
            migrated_path.unlink()
        raise
    if migrated_path is not None:
        legacy_path.unlink()
    return document


@_locked
def list_pdf_versions(job_id: str) -> list[dict[str, Any]]:
    document = _migrate_legacy_resume_pdf(job_id)
    versions = [dict(item) for item in document["versions"] if isinstance(item, dict)]
    return sorted(
        versions,
        key=lambda item: (str(item.get("created_at", "")), str(item.get("id", ""))),
        reverse=True,
    )


def _add_pdf_version(
    job_id: str,
    content: bytes | bytearray | BinaryIO,
    label: str,
    source: str,
    original_filename: str = "",
) -> dict[str, Any]:
    data = _coerce_pdf_bytes(content)
    if not _looks_like_pdf(data):
        raise ValueError("The uploaded content is not a valid PDF (missing %PDF header).")
    if source not in PDF_VERSION_SOURCES:
        raise ValueError("Invalid PDF source.")
    document = _migrate_legacy_resume_pdf(job_id)
    version_id = str(uuid.uuid4())
    filename = f"{version_id}.pdf"
    metadata = {
        "id": version_id,
        "filename": filename,
        "label": _clean_pdf_label(label),
        "source": source,
        "original_filename": str(original_filename).replace("\\", "/").split("/")[-1],
        "created_at": _utc_now(),
    }
    destination = _atomic_write_job_bytes(job_id, ("pdfs", filename), data)
    updated = dict(document)
    updated["versions"] = [*document["versions"], metadata]
    try:
        _write_pdf_index(job_id, updated)
    except Exception:
        if destination.is_file():
            destination.unlink()
        raise
    return dict(metadata)


@_locked
def add_uploaded_pdf_version(
    job_id: str,
    content: bytes | bytearray | BinaryIO,
    label: str,
    original_filename: str,
    source: str = "uploaded",
) -> dict[str, Any]:
    if get_job_by_id(job_id) is None:
        raise KeyError("Job not found.")
    return _add_pdf_version(
        job_id, content, label, source, original_filename
    )


@_locked
def save_compiled_pdf_version(job_id: str, label: str) -> dict[str, Any]:
    preview = load_compiled_preview(job_id)
    if preview is None:
        raise ValueError("Compile a resume successfully before saving a PDF version.")
    return _add_pdf_version(job_id, preview, label, "compiled")


@_locked
def load_pdf_version(job_id: str, version_id: str) -> bytes:
    path = _pdf_version_path(job_id, version_id)
    if not path.is_file():
        raise FileNotFoundError(f"PDF version not found: {version_id}")
    data = path.read_bytes()
    if not _looks_like_pdf(data):
        raise ValueError("The saved PDF version is invalid.")
    return data


@_locked
def rename_pdf_version(job_id: str, version_id: str, label: str) -> dict[str, Any]:
    canonical = _canonical_job_id(version_id)
    document = _migrate_legacy_resume_pdf(job_id)
    versions = [dict(item) for item in document["versions"]]
    for version in versions:
        if version.get("id") == canonical:
            version["label"] = _clean_pdf_label(label)
            updated = dict(document)
            updated["versions"] = versions
            _write_pdf_index(job_id, updated)
            return dict(version)
    raise KeyError(f"PDF version not found: {canonical}")


@_locked
def delete_pdf_version(job_id: str, version_id: str) -> bool:
    canonical = _canonical_job_id(version_id)
    document = _migrate_legacy_resume_pdf(job_id)
    versions = [
        item for item in document["versions"] if item.get("id") != canonical
    ]
    if len(versions) == len(document["versions"]):
        return False
    updated = dict(document)
    updated["versions"] = versions
    _write_pdf_index(job_id, updated)
    path = _pdf_version_path(job_id, canonical)
    if path.is_file():
        path.unlink()
    return True


def _attachment_directory(job_id: str, create: bool = False) -> Path:
    """Validate every attachment ancestor; reads must not create storage."""

    _assert_local_storage_layout()
    canonical = _canonical_job_id(job_id)
    if (APPLICATIONS_DIR / canonical).is_symlink():
        raise ValueError("Attachment job directories must not use symbolic links.")
    if (APPLICATIONS_DIR / canonical / "attachments").is_symlink():
        raise ValueError("Attachment directories must not use symbolic links.")
    directory = _job_nested_path(canonical, "attachments")
    if directory.is_symlink() or (directory.exists() and not directory.is_dir()):
        raise ValueError("attachments must be a regular directory inside the job folder.")
    if create:
        directory = _ensure_job_folder(canonical, "attachments")
    return directory


def _attachment_path(job_id: str, filename: str) -> Path:
    directory = _attachment_directory(job_id)
    return _validated_direct_file(directory / filename, directory)


def _canonical_attachment_id(file_id: Any) -> str:
    try:
        return _canonical_job_id(file_id)
    except ValueError as error:
        raise ValueError("Attachment ID must be a canonical lowercase UUID string.") from error


def _validate_attachment_index(job_id: str, raw: Any) -> dict[str, Any]:
    """Reject malformed metadata and any filename that is not UUID based."""

    if (
        not isinstance(raw, dict)
        or type(raw.get("schema_version")) is not int
        or raw["schema_version"] != ATTACHMENT_SCHEMA_VERSION
        or not isinstance(raw.get("files"), list)
    ):
        raise ValueError("attachments/index.json must contain schema_version 1 and a files list.")
    seen: set[str] = set()
    for item in raw["files"]:
        if not isinstance(item, dict):
            raise ValueError("Each attachment must have a metadata object.")
        file_id = _canonical_attachment_id(item.get("id"))
        if file_id in seen:
            raise ValueError(f"Duplicate attachment UUID: {file_id}")
        seen.add(file_id)
        filename = item.get("stored_filename")
        if not isinstance(filename, str) or not filename.startswith(file_id):
            raise ValueError("Attachment filenames must use their attachment UUID.")
        suffix = filename[len(file_id):]
        if suffix and not _ATTACHMENT_SUFFIX_PATTERN.fullmatch(suffix):
            raise ValueError("Invalid stored attachment filename.")
        _attachment_path(job_id, filename)
        if not isinstance(item.get("original_filename"), str) or not item["original_filename"]:
            raise ValueError("Attachments must retain their original filename.")
        if type(item.get("size_bytes")) is not int or item["size_bytes"] < 0:
            raise ValueError("Attachment size_bytes must be a nonnegative integer.")
        timestamp = item.get("uploaded_at")
        if not isinstance(timestamp, str):
            raise ValueError("Attachment uploaded_at must be an ISO 8601 timestamp.")
        try:
            parsed_timestamp = datetime.fromisoformat(timestamp)
        except ValueError as error:
            raise ValueError("Attachment uploaded_at must be an ISO 8601 timestamp.") from error
        if parsed_timestamp.tzinfo is None:
            raise ValueError("Attachment uploaded_at must include a timezone.")
    return copy.deepcopy(raw)


def _read_attachment_index(job_id: str) -> dict[str, Any]:
    directory = _attachment_directory(job_id)
    path = _attachment_path(job_id, "index.json")
    backup = _attachment_path(job_id, "index.json.bak")
    if not path.exists() and not backup.exists():
        if directory.exists() and any(directory.iterdir()):
            raise CorruptStorageError(
                "The attachment index is missing but attachment files remain. "
                "Restore index.json from a backup before modifying these files."
            )
        return {"schema_version": ATTACHMENT_SCHEMA_VERSION, "files": []}
    try:
        return _validate_attachment_index(job_id, _read_json(path))
    except (OSError, UnicodeError, ValueError) as primary_error:
        try:
            recovered = _validate_attachment_index(job_id, _read_json(backup))
            # An older backup may reference an explicitly deleted file. Never
            # silently resurrect that metadata or treat an incomplete backup as good.
            for item in recovered["files"]:
                recovered_path = _attachment_path(job_id, item["stored_filename"])
                if not recovered_path.is_file() or recovered_path.stat().st_size != item["size_bytes"]:
                    raise ValueError("The attachment backup references missing or changed files.")
        except (OSError, UnicodeError, ValueError) as backup_error:
            raise CorruptStorageError(
                "Neither the attachment index nor its backup can be safely read. "
                "Existing files have not been changed."
            ) from backup_error
        warnings.warn(
            "The attachment index is missing or corrupt; reading the previous valid "
            "index.json.bak. Newer attachments may not appear. Existing files have "
            f"not been changed. Original error: {primary_error}",
            StorageRecoveryWarning,
            stacklevel=2,
        )
        return recovered


def _write_attachment_index(job_id: str, document: Mapping[str, Any]) -> None:
    """Use the existing atomic job writer, retaining one valid local backup."""

    validated = _validate_attachment_index(job_id, dict(document))
    path = _attachment_path(job_id, "index.json")
    _attachment_path(job_id, "index.json.tmp")
    _attachment_path(job_id, "index.json.bak")
    _attachment_path(job_id, "index.json.bak.tmp")
    if path.exists():
        try:
            previous = _validate_attachment_index(job_id, _read_json(path))
        except (OSError, UnicodeError, ValueError):
            # A damaged primary must not replace the only good recovery copy.
            pass
        else:
            _atomic_write_job_json(job_id, ("attachments", "index.json.bak"), previous)
    _atomic_write_job_json(job_id, ("attachments", "index.json"), validated)


@_locked
def list_attachments(job_id: str) -> list[dict[str, Any]]:
    """Return this job's stored metadata without creating directories or indexes."""

    files = _read_attachment_index(job_id)["files"]
    return sorted(files, key=lambda item: (item["uploaded_at"], item["id"]), reverse=True)


@_locked
def add_attachments(
    job_id: str, files: Sequence[tuple[str, bytes]]
) -> list[dict[str, Any]]:
    """Persist a batch only after all inputs validate, rolling back failed uploads."""

    document = _read_attachment_index(job_id)
    pending: list[tuple[dict[str, Any], bytes, Path]] = []
    seen_ids = {item["id"] for item in document["files"]}
    for original_filename, content in files:
        if not isinstance(original_filename, str) or not original_filename or "\x00" in original_filename:
            raise ValueError("Each attachment requires a filename.")
        if not isinstance(content, bytes):
            raise TypeError("Attachment content must be bytes.")
        if len(content) > MAX_ATTACHMENT_BYTES:
            raise ValueError(f"{original_filename}: each attachment must be 50 MiB or smaller.")
        # Uploaded names are display metadata, never a path supplied to storage.
        name = original_filename.replace("\\", "/").split("/")[-1]
        if not name:
            raise ValueError("Each attachment requires a filename.")
        suffix = Path(name).suffix.lower()
        if not _ATTACHMENT_SUFFIX_PATTERN.fullmatch(suffix):
            suffix = ""
        file_id = str(uuid.uuid4())
        destination = _attachment_path(job_id, f"{file_id}{suffix}")
        if file_id in seen_ids or destination.exists():
            raise ValueError("An attachment UUID already exists; retry the upload.")
        seen_ids.add(file_id)
        metadata = {
            "id": file_id,
            "original_filename": name,
            "stored_filename": destination.name,
            "size_bytes": len(content),
            "uploaded_at": _utc_now(),
        }
        pending.append((metadata, content, destination))
    if not pending:
        return []
    _attachment_directory(job_id, create=True)
    written: list[Path] = []
    try:
        for metadata, content, destination in pending:
            written.append(destination)
            _atomic_write_job_bytes(job_id, ("attachments", destination.name), content)
        updated = dict(document)
        updated["files"] = [*document["files"], *(item[0] for item in pending)]
        _write_attachment_index(job_id, updated)
    except Exception:
        for destination in written:
            try:
                checked = _attachment_path(job_id, destination.name)
                if checked.is_file():
                    checked.unlink()
            except (OSError, ValueError) as cleanup_error:
                warnings.warn(
                    f"Failed upload cleanup could not remove {destination.name}: {cleanup_error}",
                    RuntimeWarning,
                    stacklevel=2,
                )
        raise
    return [dict(item[0]) for item in pending]


@_locked
def get_attachment_path(job_id: str, file_id: str) -> Path:
    """Return the selected indexed file's validated path for bounded preview reads."""

    canonical = _canonical_attachment_id(file_id)
    for item in _read_attachment_index(job_id)["files"]:
        if item["id"] != canonical:
            continue
        path = _attachment_path(job_id, item["stored_filename"])
        if not path.is_file():
            raise FileNotFoundError(f"Attachment file not found: {item['original_filename']}")
        return path
    raise FileNotFoundError(f"Attachment not found in this job: {canonical}")


@_locked
def load_attachment(job_id: str, file_id: str) -> bytes:
    """Read the original bytes of one indexed attachment."""

    return get_attachment_path(job_id, file_id).read_bytes()


@_locked
def delete_attachment(job_id: str, file_id: str) -> bool:
    """Delete one attachment; restore the index if the file cannot be removed."""

    canonical = _canonical_attachment_id(file_id)
    document = _read_attachment_index(job_id)
    selected = next((item for item in document["files"] if item["id"] == canonical), None)
    if selected is None:
        return False
    path = _attachment_path(job_id, selected["stored_filename"])
    if path.exists() and not path.is_file():
        raise ValueError("The selected attachment is not a regular file.")
    updated = dict(document)
    updated["files"] = [item for item in document["files"] if item["id"] != canonical]
    _write_attachment_index(job_id, updated)
    try:
        path.unlink(missing_ok=True)
    except OSError as error:
        try:
            # Preserve the rolling backup while reverting this failed deletion.
            _atomic_write_job_json(job_id, ("attachments", "index.json"), document)
        except Exception as rollback_error:
            raise OSError(
                "Attachment deletion failed and the index could not be restored. "
                "The attachment file and index.json.bak remain available for recovery."
            ) from rollback_error
        raise OSError("Attachment deletion failed; its file and index were preserved.") from error
    return True


def calculate_summary_counts(
    jobs: Mapping[str, Any] | Sequence[Mapping[str, Any]],
    settings: Mapping[str, Any],
    include_archived: bool = False,
) -> dict[str, int]:
    """Calculate the three fixed Dashboard groups from current job statuses."""

    job_list = jobs.get("jobs", []) if isinstance(jobs, Mapping) else jobs
    status_to_group = {
        status.get("id"): status.get("summary_group")
        for status in settings.get("statuses", [])
        if status.get("summary_group") in SUMMARY_GROUPS
    }
    counts = {group: 0 for group in SUMMARY_GROUPS}
    for job in job_list:
        if not include_archived and bool(job.get("archived", False)):
            continue
        group = status_to_group.get(job.get("status_id"), "pending")
        counts[group] += 1
    return counts
