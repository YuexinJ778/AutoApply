"""Streamlit UI for the local job application tracker."""

from __future__ import annotations

from datetime import date, datetime, timedelta
import codecs
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import uuid
import warnings
from typing import Any, Iterable
from zoneinfo import ZoneInfo

import pandas as pd
import streamlit as st
from PIL import Image
from streamlit_calendar import calendar as render_calendar

from calendar_utils import (
    build_calendar_events,
    detect_local_timezone,
    event_local_date,
    events_for_day,
    parse_aware_datetime,
    reminder_summary,
)
from import_jobs import build_import_template, parse_and_validate_import
import local_service

from storage import (
    JobDirectoriesError,
    MAX_ATTACHMENT_BYTES,
    add_attachments,
    add_company_column,
    add_uploaded_pdf_version,
    archive_job,
    calculate_summary_counts,
    compile_resume_latex,
    create_company,
    create_job,
    create_jobs_batch,
    create_prompt,
    delete_job,
    delete_company,
    delete_company_column,
    delete_attachment,
    delete_pdf_version,
    delete_prompt,
    ensure_storage,
    find_pdflatex,
    get_job_by_id,
    get_job_directory,
    get_attachment_path,
    list_attachments,
    list_pdf_versions,
    list_reminders,
    load_compile_log,
    load_compile_status,
    load_compiled_preview,
    load_companies,
    load_company_columns,
    load_jobs,
    load_attachment,
    load_pdf_version,
    load_prompts,
    load_settings,
    load_text_file,
    rename_pdf_version,
    save_compiled_pdf_version,
    save_settings,
    save_text_file,
    update_job,
    update_company,
    update_company_column,
    update_prompt,
)


st.set_page_config(page_title="Job Application Tracker", layout="wide")


SUMMARY_GROUP_LABELS = {
    "offer": "Offer",
    "rejected": "Rejected",
    "pending": "Pending",
}

CUSTOM_TYPE_LABELS = {
    "text": "Text",
    "date": "Date",
    "select": "Dropdown",
    "checkbox": "Checkbox",
}

DEFAULT_STATUS_LABEL_TRANSLATIONS = {
    ("planning", "\u6e96\u5099\u6295\u905e"): "Preparing to Apply",
    ("applied", "\u5df2\u6295\u905e"): "Applied",
    ("online_assessment", "OA\uff0f\u7dda\u4e0a\u6e2c\u9a57"): "Online Assessment",
    ("phone_interview", "\u96fb\u8a71\u9762\u8a66"): "Phone Interview",
    ("interviewing", "\u9762\u8a66\u4e2d"): "Interviewing",
    ("waiting_result", "\u7b49\u5f85\u7d50\u679c"): "Awaiting Result",
    ("offer", "\u9304\u53d6"): "Offer",
    ("rejected", "\u62d2\u7d55"): "Rejected",
}

SAFE_FIELD_ID = re.compile(r"^[a-z][a-z0-9_]*$")


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _jobs_from_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        raw_jobs = payload.get("jobs", [])
    elif isinstance(payload, list):
        raw_jobs = payload
    else:
        raise ValueError("jobs.json must contain a JSON object or array at the top level.")

    if not isinstance(raw_jobs, list):
        raise ValueError("The jobs field in jobs.json must be an array.")

    jobs: list[dict[str, Any]] = []
    for raw_job in raw_jobs:
        if not isinstance(raw_job, dict):
            continue
        job = dict(raw_job)
        job.setdefault("id", "")
        job.setdefault("status_id", "planning")
        job.setdefault("applied_date", "")
        job.setdefault("company", "")
        job.setdefault("job_title", "")
        job.setdefault("location", "")
        job.setdefault("job_url", "")
        job.setdefault("email", "")
        job.setdefault("account", "")
        job.setdefault("password", "")
        if not isinstance(job.get("custom_fields"), dict):
            job["custom_fields"] = {}
        job.setdefault("archived", False)
        job.setdefault("created_at", "")
        job.setdefault("updated_at", "")
        jobs.append(job)
    return jobs


def _status_records(settings: dict[str, Any]) -> list[dict[str, Any]]:
    raw_statuses = settings.get("statuses", [])
    if not isinstance(raw_statuses, list):
        return []

    statuses: list[dict[str, Any]] = []
    for index, raw_status in enumerate(raw_statuses):
        if not isinstance(raw_status, dict):
            continue
        status = dict(raw_status)
        status.setdefault("id", f"unknown_status_{index}")
        status.setdefault("label", str(status["id"]))
        if status.get("summary_group") not in SUMMARY_GROUP_LABELS:
            status["summary_group"] = "pending"
        status["order"] = _safe_int(status.get("order"), (index + 1) * 10)
        status["active"] = bool(status.get("active", True))
        statuses.append(status)
    return sorted(statuses, key=lambda item: (item["order"], str(item["label"])))


def _custom_field_records(settings: dict[str, Any]) -> list[dict[str, Any]]:
    raw_fields = settings.get("custom_fields", [])
    if not isinstance(raw_fields, list):
        return []

    fields: list[dict[str, Any]] = []
    for index, raw_field in enumerate(raw_fields):
        if not isinstance(raw_field, dict):
            continue
        field = dict(raw_field)
        field.setdefault("id", f"unknown_field_{index}")
        field.setdefault("label", str(field["id"]))
        if field.get("type") not in CUSTOM_TYPE_LABELS:
            field["type"] = "text"
        if not isinstance(field.get("options"), list):
            field["options"] = []
        field["options"] = [str(option) for option in field["options"] if str(option)]
        field["show_in_table"] = bool(field.get("show_in_table", False))
        field["order"] = _safe_int(field.get("order"), (index + 1) * 10)
        field["active"] = bool(field.get("active", True))
        fields.append(field)
    return sorted(fields, key=lambda item: (item["order"], str(item["label"])))


def _load_application_data() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        ensure_storage()
        jobs_payload = load_jobs()
        settings = load_settings()

    for warning_record in caught:
        st.warning(f"Storage warning: {warning_record.message}")

    if not isinstance(settings, dict):
        raise ValueError("settings.json must contain a JSON object at the top level.")
    return _jobs_from_payload(jobs_payload), settings


def _set_flash(level: str, message: str) -> None:
    st.session_state["_flash_message"] = (level, message)


def _show_flash() -> None:
    flash = st.session_state.pop("_flash_message", None)
    if not flash:
        return
    level, message = flash
    renderer = getattr(st, level, st.info)
    renderer(message)


def _navigate(page: str, job_id: str | None = None) -> None:
    st.session_state["page"] = page
    if job_id is not None:
        st.session_state["selected_job_id"] = job_id
        if page == "job_detail":
            # Only an explicit Open/navigation starts a new workspace visit.
            st.session_state[f"resume_mode_{job_id}"] = "Split view"


def _handle_dashboard_open() -> None:
    click = st.session_state.get("dashboard_open_click")
    visible_job_ids = st.session_state.get("dashboard_visible_job_ids", [])
    if click is None or not isinstance(visible_job_ids, list):
        return

    row_index = click.get("row")
    if (
        not isinstance(row_index, int)
        or isinstance(row_index, bool)
        or row_index < 0
        or row_index >= len(visible_job_ids)
    ):
        return

    job_id = str(visible_job_ids[row_index])
    if job_id:
        _navigate("job_detail", job_id)


def _handle_dashboard_selection() -> None:
    # Streamlit reports original input positions, including after browser sorting.
    visible_ids = st.session_state.get("dashboard_visible_job_ids", [])
    event = st.session_state.get("dashboard_jobs_table", {})
    rows = event.get("selection", {}).get("rows", [])
    st.session_state["selected_job_ids"] = list(dict.fromkeys(
        visible_ids[row] for row in rows
        if isinstance(row, int) and not isinstance(row, bool)
        and 0 <= row < len(visible_ids) and visible_ids[row]
    ))


def _clear_dashboard_delete_confirmation() -> None:
    st.session_state.pop("dashboard_pending_delete_ids", None)
    st.session_state.pop("dashboard_confirm_delete", None)


def _execute_dashboard_delete() -> None:
    # Consume the snapshot before any writes so a rerun cannot repeat deletion.
    target_ids = tuple(dict.fromkeys(st.session_state.pop("dashboard_pending_delete_ids", [])))
    st.session_state.pop("dashboard_confirm_delete", None)
    deleted_ids: set[str] = set()
    removed_ids: set[str] = set()
    failures: list[str] = []
    for job_id in target_ids:
        try:
            delete_job(job_id)
        except Exception as exc:
            # delete_job saves the record removal before removing its directory.
            # A filesystem error can therefore leave files but no job record.
            try:
                record_removed = get_job_by_id(job_id) is None
            except Exception:
                failures.append(f"{job_id}: could not verify the remaining record/files: {exc}")
            else:
                if record_removed:
                    removed_ids.add(job_id)
                    failures.append(f"{job_id}: job record is absent; file cleanup did not complete: {exc}")
                else:
                    failures.append(f"{job_id}: not deleted: {exc}")
        else:
            deleted_ids.add(job_id)
            removed_ids.add(job_id)

    st.session_state["selected_job_ids"] = [
        job_id for job_id in st.session_state.get("selected_job_ids", [])
        if job_id not in removed_ids
    ]
    if st.session_state.get("selected_job_id") in removed_ids:
        st.session_state.pop("selected_job_id", None)
    message = f"Deleted {len(deleted_ids)} of {len(target_ids)} selected jobs and their associated files."
    if failures:
        message += " " + " ".join(failures)
    _set_flash("warning" if failures else "success", message)


def _render_dashboard_delete_confirmation(filtered_jobs: list[dict[str, Any]]) -> None:
    target_ids = st.session_state.get("dashboard_pending_delete_ids", [])
    if not target_ids:
        return
    by_id = {str(job.get("id", "")): job for job in filtered_jobs}
    st.warning(f"Permanently delete {len(target_ids)} selected jobs?")
    for job_id in target_ids:
        job = by_id.get(job_id, {})
        st.text(f"{job.get('company', '')} — {job.get('job_title', '')} ({job_id})")
    confirmed = st.checkbox(
        "I understand that this permanently deletes the selected jobs, resumes, PDFs, notes, attachments, and reminders",
        key="dashboard_confirm_delete",
    )
    confirm_col, cancel_col = st.columns(2)
    if confirm_col.button("Delete Permanently", key="dashboard_execute_delete", disabled=not confirmed):
        _execute_dashboard_delete()
        st.rerun()
    if cancel_col.button("Cancel", key="dashboard_cancel_delete"):
        _clear_dashboard_delete_confirmation()
        st.rerun()


def _start_new_job() -> None:
    st.session_state["new_job_nonce"] = uuid.uuid4().hex
    _navigate("new_job")


def _render_sidebar() -> None:
    with st.sidebar:
        st.title("Job Application Tracker")
        if st.button("Dashboard", width="stretch", key="nav_dashboard"):
            _navigate("dashboard")
            st.rerun()
        if st.button("Calendar", width="stretch", key="nav_calendar"):
            _navigate("calendar")
            st.rerun()
        if st.button("Companies", width="stretch", key="nav_companies"):
            _navigate("companies")
            st.rerun()
        if st.button("Prompts", width="stretch", key="nav_prompts"):
            _navigate("prompts")
            st.rerun()
        if st.button("Import JSON", width="stretch", key="nav_import_json"):
            _keep_import_dashboard_filters()
            _navigate("import_jobs")
            st.rerun()
        if st.button("Settings", width="stretch", key="nav_settings"):
            _navigate("settings")
            st.rerun()
        st.divider()
        st.caption("All data stays in this project folder. Passwords are stored in plain text.")


def _open_company_form(company_id: str | None = None) -> None:
    st.session_state["companies_selected_id"] = company_id
    st.session_state["companies_editor_id"] = company_id or "new"
    st.session_state["companies_form_nonce"] = uuid.uuid4().hex
    st.session_state.pop("companies_pending_delete", None)


def _select_company_form() -> None:
    selected = st.session_state.get("companies_selected_id")
    if selected:
        _open_company_form(selected)
    else:
        _close_company_form()


def _close_company_form() -> None:
    st.session_state["companies_selected_id"] = None
    st.session_state.pop("companies_editor_id", None)
    st.session_state.pop("companies_pending_delete", None)


def _clear_company_date(date_key: str) -> None:
    st.session_state[date_key] = None


def _open_company_column_form() -> None:
    st.session_state["companies_column_open"] = True
    st.session_state["companies_column_mode"] = "add"
    st.session_state["companies_column_name"] = ""
    st.session_state["companies_column_type"] = "text"
    st.session_state["companies_column_options"] = ""
    st.session_state.pop("companies_column_error", None)
    st.session_state.pop("companies_column_pending_delete", None)


def _select_company_column() -> None:
    selected = st.session_state.get("companies_column_selected")
    column = next((item for item in load_company_columns() if item["id"] == selected), None)
    if column:
        st.session_state["companies_column_name"] = column["label"]
        st.session_state["companies_column_type"] = column["type"]
        st.session_state["companies_column_options"] = "\n".join(column["options"])
    st.session_state.pop("companies_column_error", None)
    st.session_state.pop("companies_column_pending_delete", None)


def _open_company_column_manager() -> None:
    columns = load_company_columns()
    st.session_state["companies_column_open"] = True
    st.session_state["companies_column_mode"] = "edit"
    selected = st.session_state.get("companies_column_selected")
    st.session_state["companies_column_selected"] = (
        selected if any(item["id"] == selected for item in columns)
        else columns[0]["id"] if columns else None
    )
    _select_company_column()


def _close_company_column_form() -> None:
    st.session_state.pop("companies_column_open", None)
    st.session_state.pop("companies_column_pending_delete", None)


def _submit_company_column() -> None:
    # A callback completes before the page renders. Keep the company form
    # mounted on this rerun so its unsaved widget values are not cleaned up.
    field_type = st.session_state.get("companies_column_type", "text")
    options = st.session_state.get("companies_column_options", "").splitlines() if field_type == "select" else []
    st.session_state.pop("companies_column_error", None)
    editing = st.session_state.get("companies_column_mode") == "edit"
    try:
        label = st.session_state.get("companies_column_name", "")
        if editing:
            update_company_column(st.session_state["companies_column_selected"], label, field_type, options)
        else:
            add_company_column(label, field_type, options)
    except Exception as exc:
        action = "save" if editing else "add"
        st.session_state["companies_column_error"] = f"Could not {action} column: {exc}"
    else:
        _close_company_column_form()
        _set_flash("success", "Company column saved." if editing else "Company column added.")


def _request_company_column_delete() -> None:
    st.session_state["companies_column_pending_delete"] = st.session_state["companies_column_selected"]


def _cancel_company_column_delete() -> None:
    st.session_state.pop("companies_column_pending_delete", None)


def _delete_selected_company_column() -> None:
    column_id = st.session_state.get("companies_column_pending_delete")
    if not column_id:
        return
    st.session_state.pop("companies_column_error", None)
    try:
        if not delete_company_column(column_id):
            raise ValueError("This column no longer exists.")
    except Exception as exc:
        st.session_state["companies_column_error"] = f"Could not delete column: {exc}"
    else:
        _close_company_column_form()
        _set_flash("success", "Company column deleted.")


def _render_company_column_form(company_columns: list[dict[str, Any]]) -> None:
    if not st.session_state.get("companies_column_open"):
        return
    editing = st.session_state.get("companies_column_mode") == "edit"
    with st.container(border=True):
        st.subheader("Manage Columns" if editing else "Add Column")
        if editing:
            by_id = {column["id"]: column for column in company_columns}
            if not by_id:
                st.info("No custom company columns to edit.")
                st.button("Cancel", key="companies_column_cancel", on_click=_close_company_column_form)
                return
            st.selectbox(
                "Column", options=list(by_id),
                format_func=lambda column_id: by_id[column_id]["label"],
                key="companies_column_selected", on_change=_select_company_column,
            )
            st.caption(
                "Changing type or options reloads this field from saved company data. "
                "Save any company edits to this field first; other company drafts are kept. "
                "Values that cannot be converted will block the change."
            )
        st.text_input("Column Name", key="companies_column_name")
        field_type = st.selectbox(
            "Field Type", options=list(CUSTOM_TYPE_LABELS),
            format_func=lambda value: "Select" if value == "select" else CUSTOM_TYPE_LABELS[value],
            key="companies_column_type",
        )
        # Preserve this draft while its widget is hidden by a type change.
        st.session_state["companies_column_options"] = st.session_state.get("companies_column_options", "")
        if field_type == "select":
            st.text_area(
                "Options", help="Enter one option per line.", key="companies_column_options",
            )
        if error := st.session_state.get("companies_column_error"):
            st.error(error)
        confirm_col, cancel_col = st.columns(2)
        confirm_col.button(
            "Save Column" if editing else "Add Column", type="primary",
            key="companies_column_save" if editing else "companies_column_submit",
            on_click=_submit_company_column,
        )
        cancel_col.button(
            "Cancel", key="companies_column_cancel", on_click=_close_company_column_form,
        )
        if editing:
            st.button("Delete Column", key="companies_column_delete", on_click=_request_company_column_delete)
            pending = st.session_state.get("companies_column_pending_delete")
            if pending in by_id:
                st.warning(
                    f"Delete column “{by_id[pending]['label']}” and all its saved company values? "
                    "Company records and other columns will be kept."
                )
                delete_col, keep_col = st.columns(2)
                delete_col.button(
                    "Confirm Delete Column", type="primary", key="companies_column_confirm_delete",
                    on_click=_delete_selected_company_column,
                )
                keep_col.button(
                    "Cancel", key="companies_column_cancel_delete", on_click=_cancel_company_column_delete,
                )


def _render_companies() -> None:
    st.title("Companies")
    try:
        with warnings.catch_warnings(record=True) as notices:
            warnings.simplefilter("always")
            company_columns = load_company_columns()
            companies = load_companies()
        for notice in notices:
            st.warning(str(notice.message))
    except Exception as exc:
        st.error(f"Companies could not be loaded safely: {exc}")
        return

    companies.sort(key=lambda company: (
        company["last_fetched_date"], company["company_name"].casefold(),
    ))
    by_id = {company["id"]: company for company in companies}
    selected_id = st.session_state.get("companies_selected_id")
    if selected_id not in by_id:
        # Restore the editor's UUID after navigating away cleans up widget state.
        editor_id = st.session_state.get("companies_editor_id")
        selected_id = editor_id if editor_id in by_id else None
    # Selectbox sends display labels over the wire. Push the canonical UUID on
    # every render so a saved rename/date change also refreshes its client value.
    st.session_state["companies_selected_id"] = selected_id
    with st.container(horizontal=True):
        st.button("Add Company", key="companies_add", on_click=_open_company_form)
        st.button("Add Column", key="companies_add_column", on_click=_open_company_column_form)
        st.button(
            "Manage Columns", key="companies_manage_columns", on_click=_open_company_column_manager,
            disabled=not company_columns,
        )
    _render_company_column_form(company_columns)
    if not companies:
        st.info("No companies added yet")
    else:
        rows = []
        column_config = {
            "Company Name": st.column_config.TextColumn(width="medium"),
            "Last Fetched Date": st.column_config.TextColumn(width="medium"),
        }
        for field in company_columns:
            config = {
                "date": st.column_config.DateColumn,
                "checkbox": st.column_config.CheckboxColumn,
            }.get(field["type"], st.column_config.TextColumn)
            column_config[field["label"]] = config(
                width="medium", **({"format": "YYYY-MM-DD"} if field["type"] == "date" else {}),
            )
        for company in companies:
            row = {
                "Company Name": company["company_name"],
                "Last Fetched Date": company["last_fetched_date"] or "Never fetched",
            }
            for field in company_columns:
                value = company.get(field["id"], False if field["type"] == "checkbox" else "")
                if field["type"] == "date":
                    value = date.fromisoformat(value) if value else None
                row[field["label"]] = value
            rows.append(row)
        st.dataframe(
            pd.DataFrame(rows), column_config=column_config,
            hide_index=True,
            width="stretch",
        )
        labels = {
            company["id"]: f"{company['company_name']} · {company['last_fetched_date'] or 'Never fetched'}"
            for company in companies
        }
        # Identical name/date records still need distinct selectable labels.
        label_counts: dict[str, int] = {}
        for label in labels.values():
            label_counts[label] = label_counts.get(label, 0) + 1
        for position, company_id in enumerate(by_id, start=1):
            label = labels[company_id]
            if label_counts[label] > 1:
                labels[company_id] = f"{label} · {position}"
        st.selectbox(
            "Select a company to edit",
            options=list(by_id),
            index=None,
            format_func=lambda company_id: labels[company_id],
            key="companies_selected_id",
            on_change=_select_company_form,
        )

    editor_id = st.session_state.get("companies_editor_id")
    if not editor_id:
        return
    existing = by_id.get(editor_id)
    if editor_id != "new" and existing is None:
        st.session_state.pop("companies_editor_id", None)
        st.warning("This company is no longer in the tracking list.")
        return
    st.subheader("Edit Company" if existing else "Add Company")
    prefix = f"company_{editor_id}_{st.session_state['companies_form_nonce']}"
    date_key = f"{prefix}_date_picker"
    if date_key not in st.session_state:
        saved_date = existing["last_fetched_date"] if existing else ""
        st.session_state[date_key] = date.fromisoformat(saved_date) if saved_date else None
    with st.form(f"{prefix}_form", enter_to_submit=False):
        company_name = st.text_input(
            "Company Name *", value=existing["company_name"] if existing else "",
            key=f"{prefix}_name",
        )
        date_col, today_col, clear_col = st.columns([4, 1, 1], vertical_alignment="bottom")
        with date_col:
            fetched_date = st.date_input(
                "Last Fetched Date", value=None, min_value=date.min, max_value=date.max,
                format="YYYY-MM-DD", key=date_key,
            )
        with today_col:
            st.form_submit_button(
                "Today", key=f"{prefix}_today", on_click=_set_applied_date_today,
                args=(date_key,), width="stretch",
            )
        with clear_col:
            st.form_submit_button(
                "Clear date", key=f"{prefix}_clear", on_click=_clear_company_date,
                args=(date_key,), width="stretch",
            )
        custom_values = _render_custom_field_widgets(
            company_columns, existing or {}, prefix, date_pickers=True,
        )
        submitted = st.form_submit_button("Save", type="primary", key=f"{prefix}_save")
    if submitted:
        values = {
            "company_name": company_name.strip(),
            "last_fetched_date": fetched_date.isoformat() if fetched_date is not None else "",
            **custom_values,
        }
        try:
            if existing:
                update_company(existing["id"], values)
            else:
                create_company(values)
        except Exception as exc:
            st.error(f"Could not save company: {exc}")
        else:
            if not existing:
                st.session_state.pop("companies_editor_id", None)
            _set_flash("success", "Company saved.")
            st.rerun()
    st.button("Cancel", key="companies_cancel", on_click=_close_company_form)

    if existing:
        if st.button("Delete Company", key="companies_delete"):
            st.session_state["companies_pending_delete"] = existing["id"]
        if st.session_state.get("companies_pending_delete") == existing["id"]:
            st.warning(
                "Delete this company from the tracking list?\n"
                "Existing job applications will not be affected."
            )
            confirm_col, cancel_col = st.columns(2)
            if confirm_col.button("Confirm Delete", key="companies_confirm_delete"):
                try:
                    delete_company(existing["id"])
                except Exception as exc:
                    st.error(f"Could not delete company: {exc}")
                else:
                    st.session_state.pop("companies_editor_id", None)
                    st.session_state.pop("companies_pending_delete", None)
                    _set_flash("success", "Company deleted from the tracking list.")
                    st.rerun()
            if cancel_col.button("Cancel", key="companies_cancel_delete"):
                st.session_state.pop("companies_pending_delete", None)
                st.rerun()


def _close_prompt_form() -> None:
    st.session_state.pop("prompts_editor_id", None)
    st.session_state.pop("prompts_pending_delete", None)


def _open_prompt_form(prompt_id: str | None = None) -> None:
    _close_prompt_form()
    st.session_state["prompts_editor_id"] = prompt_id or "new"
    st.session_state["prompts_form_nonce"] = uuid.uuid4().hex


def _select_prompt() -> None:
    st.session_state["prompts_selected_id"] = st.session_state["prompts_selector"]
    _close_prompt_form()


def _render_prompts() -> None:
    st.title("Prompts")
    try:
        with warnings.catch_warnings(record=True) as notices:
            warnings.simplefilter("always")
            prompts = load_prompts()
        for notice in notices:
            st.warning(str(notice.message))
    except Exception as exc:
        st.error(f"Prompts could not be loaded safely: {exc}")
        return

    prompts.sort(key=lambda record: record["created_at"], reverse=True)
    by_id = {record["id"]: record for record in prompts}
    selected_id = st.session_state.get("prompts_selected_id")
    if selected_id not in by_id:
        selected_id = None
        st.session_state["prompts_selected_id"] = None
        if st.session_state.get("prompts_editor_id") != "new":
            _close_prompt_form()
    st.button("Add Prompt", key="prompts_add", on_click=_open_prompt_form)
    if not prompts:
        st.info("No prompts saved yet")
    else:
        st.dataframe(
            pd.DataFrame([{
                "Created Date": record["created_at"][:10],
                "Description": record["description"],
            } for record in prompts]), hide_index=True, width="stretch",
        )
        # A separate durable UUID survives widget cleanup when navigating away.
        st.session_state["prompts_selector"] = selected_id
        labels = {
            record["id"]: f"{index}. {record['created_at'][:10]} · {record['description']}"
            for index, record in enumerate(prompts, start=1)
        }
        st.selectbox(
            "Select a prompt to view", options=list(by_id), index=None,
            format_func=lambda prompt_id: labels[prompt_id],
            key="prompts_selector", on_change=_select_prompt,
        )

    editor_id = st.session_state.get("prompts_editor_id")
    if editor_id:
        existing = by_id.get(editor_id)
        if editor_id != "new" and existing is None:
            _close_prompt_form()
            st.warning("This prompt is no longer available.")
            return
        st.subheader("Edit Prompt" if existing else "Add Prompt")
        prefix = f"prompt_{editor_id}_{st.session_state['prompts_form_nonce']}"
        with st.form(f"{prefix}_form", enter_to_submit=False):
            description = st.text_area(
                "Description", value=existing["description"] if existing else "",
                key=f"{prefix}_description", height=100,
            )
            content = st.text_area(
                "Prompt", value=existing["content"] if existing else "",
                key=f"{prefix}_content", height=360,
            )
            with st.container(horizontal=True):
                submitted = st.form_submit_button("Save", type="primary", key=f"{prefix}_save")
                cancelled = st.form_submit_button("Cancel", key=f"{prefix}_cancel")
        if cancelled:
            _close_prompt_form()
            st.rerun()
        if submitted:
            try:
                if existing:
                    saved = update_prompt(existing["id"], description, content)
                else:
                    saved = create_prompt(description, content)
            except Exception as exc:
                st.error(f"Could not save prompt: {exc}")
            else:
                st.session_state["prompts_selected_id"] = saved["id"]
                _close_prompt_form()
                _set_flash("success", "Prompt saved.")
                st.rerun()
        return

    selected = by_id.get(selected_id)
    if selected is None:
        return
    st.caption(f"Created Date: {selected['created_at'][:10]}")
    st.text(selected["description"])
    st.text_area(
        "Prompt", value=selected["content"], height=360, disabled=True,
        key=f"prompt_view_{selected_id}",
    )
    with st.container(horizontal=True):
        _render_copy_button(
            selected["content"], label="Copy Prompt", key=f"copy_prompt_{selected_id}",
            success_message="Copied", error_message="Copy failed. Select the prompt above and copy it manually.",
        )
        st.button("Edit", key="prompts_edit", on_click=_open_prompt_form, args=(selected_id,))
        if st.button("Delete", key="prompts_delete"):
            st.session_state["prompts_pending_delete"] = selected_id
    if st.session_state.get("prompts_pending_delete") == selected_id:
        st.warning("Delete this prompt?")
        with st.container(horizontal=True):
            if st.button("Confirm Delete", key="prompts_confirm_delete"):
                try:
                    delete_prompt(selected_id)
                except Exception as exc:
                    st.error(f"Could not delete prompt: {exc}")
                else:
                    st.session_state["prompts_selected_id"] = None
                    _close_prompt_form()
                    _set_flash("success", "Prompt deleted.")
                    st.rerun()
            st.button("Cancel", key="prompts_cancel_delete", on_click=_close_prompt_form)


def _keep_import_dashboard_filters() -> None:
    # Reassigning keeps these widget values through Streamlit's page cleanup.
    for key in (
        "dashboard_show_archived", "dashboard_show_rejected", "dashboard_show_saved", "dashboard_keyword",
        "dashboard_status_filter", "dashboard_company_filter", "dashboard_location_filter",
    ):
        if key in st.session_state:
            st.session_state[key] = st.session_state[key]


def _render_copy_button(
    text: str, *, label: str, key: str,
    success_message: str, error_message: str,
) -> None:
    component = st.components.v2.component(
        "browser_clipboard",
        html="""<button type="button"></button>
            <div role="status" aria-live="polite"></div>""",
        css="""
            button {
                font: inherit; color: var(--st-text-color);
                background: var(--st-background-color);
                border: 1px solid var(--st-border-color);
                border-radius: 0.5rem; padding: 0.5rem 0.75rem; cursor: pointer;
            }
            button:hover, button:focus-visible { border-color: var(--st-primary-color); }
            button:disabled { cursor: wait; opacity: 0.65; }
            [role="status"] { font: inherit; margin-top: 0.4rem; }
        """,
        js="""export default function({ data, parentElement }) {
            const button = parentElement.querySelector('button');
            const message = parentElement.querySelector('[role="status"]');
            button.textContent = data.label;
            message.textContent = '';
            const copy = async () => {
                button.disabled = true;
                message.textContent = '';
                try {
                    await navigator.clipboard.writeText(data.text);
                    message.textContent = data.success_message;
                } catch (error) {
                    message.textContent = data.error_message;
                } finally {
                    button.disabled = false;
                }
            };
            button.onclick = copy;
            return () => { button.onclick = null; };
        }""",
    )
    component(data={
        "text": text, "label": label,
        "success_message": success_message, "error_message": error_message,
    }, key=key)


def _render_import_template_copy(template_text: str) -> None:
    _render_copy_button(
        template_text, label="Generate & Copy JSON Template", key="copy_import_template",
        success_message="Copied to clipboard",
        error_message="Copy failed. Open the template below and copy it manually.",
    )


def _render_import_jobs(settings: dict[str, Any]) -> None:
    st.title("Import Jobs")
    template_text = json.dumps(build_import_template(settings), ensure_ascii=False, indent=2)
    _render_import_template_copy(template_text)
    with st.expander("View JSON template"):
        st.code(template_text, language="json")
    st.caption("Import adds new records only. Importing the same data again creates duplicate records.")

    result = st.session_state.get("import_result")
    if result:
        if result.get("directory_error"):
            st.error(
                f"Saved {result['count']} jobs, but job folder creation failed. "
                "Do not import this batch again: the records are already saved. "
                + result["directory_error"]
            )
        else:
            st.success(f"Imported {result['count']} jobs")
        st.caption("Records may be hidden by your current Dashboard filters.")
        if st.button("Back to Dashboard", key="import_back_dashboard"):
            _navigate("dashboard")
            st.rerun()

    source = st.radio("Input method", ["Paste JSON", "Upload JSON"], key="import_source", horizontal=True)
    generation = st.session_state.setdefault("import_generation", 0)
    if source == "Paste JSON":
        text = st.text_area("Paste JSON", height=280, key=f"import_paste_{generation}")
    else:
        uploaded = st.file_uploader("Upload JSON", type=["json"], key=f"import_upload_{generation}")
        if uploaded is None:
            return
        try:
            text = uploaded.getvalue().decode("utf-8")
        except UnicodeDecodeError:
            st.error("Upload JSON must be a UTF-8 JSON file.")
            return
    if not text.strip():
        return

    # Parse the active input on every rerun; never retain a stale preview.
    try:
        validated = parse_and_validate_import(text, settings)
    except ValueError as error:
        st.error(str(error))
        return
    st.subheader(f"Ready to import {len(validated)} jobs")
    status_labels = _status_label_map(_status_records(settings))
    st.dataframe(
        pd.DataFrame([
            {"Company": job["company"], "Job Title": job["job_title"],
             "Status": status_labels.get(job["status_id"], job["status_id"]),
             "Date Applied": job["applied_date"], "Location": job["location"]}
            for job in validated
        ]),
        hide_index=True, width="stretch",
    )
    if not st.button(f"Import {len(validated)} Jobs", key="import_submit", type="primary"):
        return
    directory_error = None
    try:
        created = create_jobs_batch(validated)
    except JobDirectoriesError as error:
        created = error.saved_jobs
        directory_error = str(error)
    except (OSError, ValueError, RuntimeError) as error:
        st.error(f"Import failed: {error}")
        return
    st.session_state["import_result"] = {"count": len(created), "directory_error": directory_error}
    st.session_state["import_generation"] = generation + 1
    st.rerun()


def _status_display_label(status: dict[str, Any]) -> str:
    status_id = str(status.get("id", ""))
    label = str(status.get("label", status_id))
    return DEFAULT_STATUS_LABEL_TRANSLATIONS.get((status_id, label), label)


def _status_label_map(statuses: Iterable[dict[str, Any]]) -> dict[str, str]:
    statuses_list = list(statuses)
    label_counts: dict[str, int] = {}
    for status in statuses_list:
        label = _status_display_label(status)
        label_counts[label] = label_counts.get(label, 0) + 1

    result: dict[str, str] = {}
    for status in statuses_list:
        status_id = str(status.get("id", ""))
        label = _status_display_label(status)
        if label_counts.get(label, 0) > 1:
            label = f"{label} ({status_id})"
        result[status_id] = label
    return result


def _date_sort_key(job: dict[str, Any]) -> tuple[int, int]:
    raw_value = str(job.get("applied_date", "") or "").strip()
    try:
        return (1, date.fromisoformat(raw_value).toordinal())
    except ValueError:
        return (0, 0)


def _custom_value_for_table(field: dict[str, Any], value: Any) -> Any:
    if field.get("type") == "checkbox":
        return "Yes" if bool(value) else "No"
    return "" if value is None else str(value)


def _is_saved_job(job: dict[str, Any]) -> bool:
    # The existing Preparing to Apply status is the app's pre-application state.
    return job.get("status_id") == "planning"


def _serialize_dashboard_export(
    view_records: list[dict[str, Any]], view_columns: list[str], export_format: str
) -> bytes:
    if export_format == "JSON":
        return json.dumps(view_records, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=view_columns)
    writer.writeheader()
    writer.writerows(view_records)
    return output.getvalue().encode("utf-8-sig")


def _render_dashboard_download(
    view_records: list[dict[str, Any]], view_columns: list[str],
    export_format: str, show_passwords: bool,
) -> None:
    if not view_records:
        st.caption("No jobs to export")
    if view_records and show_passwords and "Password" in view_columns:
        st.caption("Export includes visible passwords.")
    extension = export_format.lower()
    st.download_button(
        f"Download {export_format} — {len(view_records)} jobs",
        data=_serialize_dashboard_export(view_records, view_columns, export_format),
        file_name=f"jobs_filtered_{datetime.now():%Y%m%d_%H%M%S}.{extension}",
        mime="application/json" if export_format == "JSON" else "text/csv",
        key="dashboard_export_download",
        disabled=not view_records,
        on_click="ignore",
    )


@st.dialog("Export filtered jobs", on_dismiss="rerun")
def _dashboard_export_dialog(
    view_records: list[dict[str, Any]], view_columns: list[str],
    export_format: str, show_passwords: bool,
) -> None:
    st.caption(f"Showing {len(view_records)} jobs")
    _render_dashboard_download(view_records, view_columns, export_format, show_passwords)


def _render_dashboard(jobs: list[dict[str, Any]], settings: dict[str, Any]) -> None:
    statuses = _status_records(settings)
    custom_fields = _custom_field_records(settings)
    status_labels = _status_label_map(statuses)
    status_summary_groups = {
        str(status.get("id", "")): status["summary_group"] for status in statuses
    }

    heading, action = st.columns([5, 1])
    with heading:
        st.title("Dashboard")
    with action:
        if st.button("+ Add Job", type="primary", width="stretch"):
            _start_new_job()
            st.rerun()

    counts = calculate_summary_counts(jobs, settings)
    offer_col, rejected_col, pending_col = st.columns(3)
    offer_col.metric("Offers", counts["offer"])
    rejected_col.metric("Rejected", counts["rejected"])
    pending_col.metric("Pending", counts["pending"])

    st.subheader("Job Applications")
    toggle_col, password_col, rejected_toggle_col, saved_toggle_col = st.columns(4)
    with toggle_col:
        show_archived = st.toggle("Show archived jobs", value=False, key="dashboard_show_archived")
    with password_col:
        show_passwords = st.toggle("Reveal passwords", value=False, key="dashboard_show_passwords")
    with rejected_toggle_col:
        # Keep the preference when navigation cleans up the Dashboard widget.
        st.session_state.setdefault(
            "dashboard_show_rejected",
            st.session_state.get("dashboard_show_rejected_preference", False),
        )
        show_rejected = st.toggle("Show rejected", key="dashboard_show_rejected")
        st.session_state["dashboard_show_rejected_preference"] = show_rejected
    with saved_toggle_col:
        st.session_state.setdefault(
            "dashboard_show_saved",
            st.session_state.get("dashboard_show_saved_preference", False),
        )
        show_saved = st.toggle("Show saved jobs", key="dashboard_show_saved")
        st.session_state["dashboard_show_saved_preference"] = show_saved

    base_jobs = [job for job in jobs if show_archived or not bool(job.get("archived", False))]

    search_col, status_col, company_col, location_col = st.columns([1.4, 1, 1, 1])
    with search_col:
        keyword = st.text_input(
            "Search",
            placeholder="Company, job title, location, or account",
            key="dashboard_keyword",
        ).strip().casefold()

    configured_status_ids = [str(status.get("id", "")) for status in statuses]
    used_status_ids = [str(job.get("status_id", "")) for job in base_jobs]
    status_options = list(dict.fromkeys(configured_status_ids + used_status_ids))
    for status_id in used_status_ids:
        status_labels.setdefault(status_id, f"Unknown status ({status_id})")
    with status_col:
        selected_statuses = st.multiselect(
            "Status",
            options=status_options,
            format_func=lambda status_id: status_labels.get(status_id, status_id),
            key="dashboard_status_filter",
        )

    companies = sorted(
        {str(job.get("company", "")).strip() for job in base_jobs if str(job.get("company", "")).strip()},
        key=str.casefold,
    )
    with company_col:
        selected_companies = st.multiselect("Company", options=companies, key="dashboard_company_filter")

    locations = sorted(
        {str(job.get("location", "")).strip() for job in base_jobs if str(job.get("location", "")).strip()},
        key=str.casefold,
    )
    with location_col:
        selected_locations = st.multiselect("Location", options=locations, key="dashboard_location_filter")

    filtered_jobs: list[dict[str, Any]] = []
    hidden_rejected = False
    hidden_saved = False
    for job in base_jobs:
        if selected_statuses and str(job.get("status_id", "")) not in selected_statuses:
            continue
        if selected_companies and str(job.get("company", "")).strip() not in selected_companies:
            continue
        if selected_locations and str(job.get("location", "")).strip() not in selected_locations:
            continue
        if keyword:
            searchable = "\n".join(
                str(job.get(field, "")) for field in ("company", "job_title", "location", "account")
            ).casefold()
            if keyword not in searchable:
                continue
        if (
            not show_rejected
            and status_summary_groups.get(str(job.get("status_id", "")), "pending") == "rejected"
        ):
            hidden_rejected = True
            continue
        if not show_saved and _is_saved_job(job):
            hidden_saved = True
            continue
        filtered_jobs.append(job)

    filtered_jobs.sort(key=_date_sort_key, reverse=True)
    # Only range-changing filters reset UUID selection, not display/export options.
    filter_signature = (
        keyword, tuple(sorted(selected_statuses)), tuple(sorted(selected_companies)),
        tuple(sorted(selected_locations)), show_archived, show_rejected, show_saved,
    )
    if st.session_state.get("dashboard_filter_signature") != filter_signature:
        st.session_state["selected_job_ids"] = []
        _clear_dashboard_delete_confirmation()
    st.session_state["dashboard_filter_signature"] = filter_signature
    visible_ids = [str(job.get("id", "")) for job in filtered_jobs]
    selected_ids = set(st.session_state.get("selected_job_ids", []))
    st.session_state["selected_job_ids"] = [job_id for job_id in visible_ids if job_id and job_id in selected_ids]
    st.session_state["dashboard_visible_job_ids"] = visible_ids
    table_custom_fields = [field for field in custom_fields if field.get("show_in_table", False)]
    built_in_columns = {
        "Open",
        "Status",
        "Date Applied",
        "Company",
        "Job Title",
        "Location",
        "Job URL",
        "Account",
        "Password",
    }
    custom_label_counts: dict[str, int] = {}
    for field in table_custom_fields:
        label = str(field.get("label", field.get("id", "")))
        custom_label_counts[label] = custom_label_counts.get(label, 0) + 1
    custom_column_names: dict[str, str] = {}
    used_column_names = set(built_in_columns)
    for field in table_custom_fields:
        field_id = str(field.get("id", ""))
        base_label = str(field.get("label", field_id)).strip() or field_id
        label = base_label
        if custom_label_counts.get(base_label, 0) > 1 or label in used_column_names:
            label = f"{base_label} ({field_id})"
        candidate = label
        suffix = 2
        while candidate in used_column_names:
            candidate = f"{label} {suffix}"
            suffix += 1
        custom_column_names[field_id] = candidate
        used_column_names.add(candidate)

    view_columns = [
        "Status", "Date Applied", "Company", "Job Title", "Location",
        "Job URL", "Account", "Password",
        *(custom_column_names[str(field.get("id", ""))] for field in table_custom_fields),
    ]
    view_records: list[dict[str, Any]] = []
    for job in filtered_jobs:
        password = str(job.get("password", "") or "")
        row: dict[str, Any] = {
            "Status": status_labels.get(
                str(job.get("status_id", "")), f"Unknown status ({job.get('status_id', '')})"
            ),
            "Date Applied": str(job.get("applied_date", "") or ""),
            "Company": str(job.get("company", "")),
            "Job Title": str(job.get("job_title", "")),
            "Location": str(job.get("location", "")),
            "Job URL": str(job.get("job_url", "")),
            "Account": str(job.get("account", "")),
            "Password": password if show_passwords else ("••••••••" if password else ""),
        }
        job_custom_fields = job.get("custom_fields", {})
        if not isinstance(job_custom_fields, dict):
            job_custom_fields = {}
        for field in table_custom_fields:
            field_id = str(field.get("id", ""))
            row[custom_column_names[field_id]] = _custom_value_for_table(
                field, job_custom_fields.get(field_id, False if field.get("type") == "checkbox" else "")
            )
        view_records.append(row)

    st.caption("Export uses the Dashboard filters above and the columns and order configured in App settings.")
    format_col, download_col = st.columns([1, 3], vertical_alignment="bottom")
    with format_col:
        export_format = st.selectbox("Export format", ["CSV", "JSON"], key="dashboard_export_format")
    with download_col:
        if view_records:
            # A native preparation click commits pending Search edits before
            # exposing a download. The modal prevents further filter edits while
            # those bytes are available; direct/deferred downloads race reruns.
            if st.button(
                "Prepare download", key="dashboard_prepare_export",
                help="Apply your latest search, then download the filtered jobs.",
            ):
                _dashboard_export_dialog(view_records, view_columns, export_format, show_passwords)
        else:
            _render_dashboard_download(view_records, view_columns, export_format, show_passwords)

    selected_ids = set(st.session_state["selected_job_ids"])
    with st.container(horizontal=True):
        if st.button("Select all", key="dashboard_select_all", disabled=not visible_ids):
            st.session_state["selected_job_ids"] = [job_id for job_id in visible_ids if job_id]
            st.rerun()
        if st.button(
            f"Delete selected ({len(selected_ids)})", key="dashboard_delete_selected", disabled=not selected_ids,
        ):
            _clear_dashboard_delete_confirmation()
            # Freeze only the selected UUIDs; subsequent table changes cannot expand it.
            st.session_state["dashboard_pending_delete_ids"] = list(st.session_state["selected_job_ids"])
        if st.button("Clear selection", key="dashboard_clear_selection", disabled=not selected_ids):
            st.session_state["selected_job_ids"] = []
            _clear_dashboard_delete_confirmation()
            st.rerun()
    st.caption(f"Showing {len(filtered_jobs)} jobs · {len(selected_ids)} selected")
    _render_dashboard_delete_confirmation(filtered_jobs)

    # Streamlit >=1.62 supports setting native row selection through Session State.
    # Rebuild positions from UUIDs whenever the input order changes, never vice versa.
    selection_rows = [row for row, job_id in enumerate(visible_ids) if job_id in selected_ids]
    table_state = st.session_state.get("dashboard_jobs_table", {})
    if table_state.get("selection", {}).get("rows") != selection_rows:
        st.session_state["dashboard_jobs_table"] = {"selection": {"rows": selection_rows}}

    if not view_records:
        st.info("No jobs match the current filters.")
        if hidden_rejected:
            st.caption('Turn on "Show rejected" to include rejected applications.')
        if hidden_saved:
            st.caption('Turn on "Show saved jobs" to include saved jobs (Preparing to Apply).')
    else:
        table_records = [{"Open": "Open", **record} for record in view_records]
        frame = pd.DataFrame(table_records, columns=["Open", *view_columns]).reset_index(drop=True)
        column_config: dict[str, Any] = {
            "Open": st.column_config.ButtonColumn(
                "",
                width="small",
                pinned=True,
                alignment="center",
                type="secondary",
                on_click=_handle_dashboard_open,
                key="dashboard_open_click",
            ),
            "Job URL": st.column_config.LinkColumn("Job URL"),
        }
        st.dataframe(
            frame,
            hide_index=True,
            width="stretch",
            column_order=["Open", *view_columns],
            column_config=column_config,
            height=min(640, 38 * len(frame) + 40),
            key="dashboard_jobs_table",
            on_select=_handle_dashboard_selection,
            selection_mode="multi-row",
            lazy=False,
        )


def _validate_optional_date(raw_value: Any, label: str, errors: list[str]) -> str:
    value = str(raw_value or "").strip()
    if not value:
        return ""
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        errors.append(f"{label} must be a valid date in YYYY-MM-DD format.")
        return value


def _deduplicated_options(options: Iterable[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for option in options:
        value = str(option).strip()
        if value and value not in seen:
            result.append(value)
            seen.add(value)
    return result


def _render_custom_field_widgets(
    fields: list[dict[str, Any]],
    existing_values: dict[str, Any],
    key_prefix: str,
    *,
    date_pickers: bool = False,
) -> dict[str, Any]:
    values: dict[str, Any] = {}
    seen_ids: set[str] = set()
    for field in fields:
        field_id = str(field.get("id", ""))
        if not field_id or field_id in seen_ids:
            continue
        seen_ids.add(field_id)
        field_type = str(field.get("type", "text"))
        label = str(field.get("label", field_id))
        if not field.get("active", True):
            label = f"{label} (Inactive)"
        current = existing_values.get(field_id, False if field_type == "checkbox" else "")
        widget_key = f"{key_prefix}_custom_{field_id}"
        if date_pickers:
            # Company schema edits replace only the changed field's widget;
            # renames and all unrelated fields retain their pending drafts.
            signature = json.dumps([field_type, field.get("options", [])], ensure_ascii=False)
            widget_key += f"_{hashlib.sha256(signature.encode()).hexdigest()[:12]}"

        if field_type == "checkbox":
            values[field_id] = st.checkbox(label, value=bool(current), key=widget_key)
        elif field_type == "select":
            options = _deduplicated_options(field.get("options", []))
            current_text = str(current or "")
            if current_text and current_text not in options:
                options.append(current_text)
            choices = [""] + options
            values[field_id] = st.selectbox(
                label,
                options=choices,
                index=choices.index(current_text) if current_text in choices else 0,
                format_func=lambda choice: "Not selected" if choice == "" else choice,
                key=widget_key,
            )
        elif field_type == "date" and date_pickers:
            chosen_date = st.date_input(
                label, value=date.fromisoformat(current) if current else None,
                min_value=date.min, max_value=date.max, format="YYYY-MM-DD",
                key=widget_key,
            )
            values[field_id] = chosen_date.isoformat() if chosen_date is not None else ""
        elif field_type == "date":
            values[field_id] = st.text_input(
                label,
                value=str(current or ""),
                placeholder="YYYY-MM-DD (optional)",
                key=widget_key,
            )
        else:
            values[field_id] = st.text_input(label, value=str(current or ""), key=widget_key)
    return values


def _validate_custom_values(
    fields: list[dict[str, Any]], values: dict[str, Any], errors: list[str]
) -> dict[str, Any]:
    validated = dict(values)
    field_by_id = {str(field.get("id", "")): field for field in fields}
    for field_id, value in values.items():
        field = field_by_id.get(field_id, {})
        if field.get("type") == "date":
            validated[field_id] = _validate_optional_date(
                value, str(field.get("label", field_id)), errors
            )
        elif field.get("type") == "checkbox":
            validated[field_id] = bool(value)
        else:
            validated[field_id] = str(value or "")
    return validated


def _render_new_job(settings: dict[str, Any]) -> None:
    st.title("Add Job")
    if st.button("< Back to Dashboard", key="new_job_back"):
        _navigate("dashboard")
        st.rerun()

    statuses = [status for status in _status_records(settings) if status.get("active", True)]
    if not statuses:
        st.error("No active job statuses are available. Enable or add one in Settings first.")
        if st.button("Go to Settings", key="new_job_go_settings"):
            _navigate("settings")
            st.rerun()
        return

    custom_fields = [field for field in _custom_field_records(settings) if field.get("active", True)]
    status_ids = [str(status.get("id", "")) for status in statuses]
    status_labels = _status_label_map(statuses)
    nonce = st.session_state.setdefault("new_job_nonce", uuid.uuid4().hex)
    prefix = f"new_job_{nonce}"
    show_password = st.checkbox("Show password", key=f"{prefix}_show_password")

    with st.form(f"{prefix}_form"):
        left, right = st.columns(2)
        with left:
            status_id = st.selectbox(
                "Status",
                options=status_ids,
                format_func=lambda value: status_labels.get(value, value),
                key=f"{prefix}_status",
            )
            company = st.text_input("Company *", key=f"{prefix}_company")
            job_title = st.text_input("Job Title *", key=f"{prefix}_title")
            applied_date = st.text_input(
                "Date Applied", placeholder="YYYY-MM-DD (optional)", key=f"{prefix}_date"
            )
        with right:
            location = st.text_input("Location", key=f"{prefix}_location")
            job_url = st.text_input("Job URL", key=f"{prefix}_url")
            email = st.text_input("Email", key=f"{prefix}_email")
            account = st.text_input("Account", key=f"{prefix}_account")
            password = st.text_input(
                "Password",
                type="default" if show_password else "password",
                key=f"{prefix}_password",
            )

        if custom_fields:
            st.subheader("Custom Fields")
        custom_values = _render_custom_field_widgets(custom_fields, {}, prefix)
        submitted = st.form_submit_button("Create Job", type="primary", width="stretch")

    if not submitted:
        return

    errors: list[str] = []
    company = company.strip()
    job_title = job_title.strip()
    if not company:
        errors.append("Company is required.")
    if not job_title:
        errors.append("Job title is required.")
    normalized_date = _validate_optional_date(applied_date, "Date Applied", errors)
    custom_values = _validate_custom_values(custom_fields, custom_values, errors)
    if errors:
        for error in errors:
            st.error(error)
        return

    try:
        created = create_job(
            {
                "status_id": status_id,
                "applied_date": normalized_date,
                "company": company,
                "job_title": job_title,
                "location": location.strip(),
                "job_url": job_url.strip(),
                "email": email.strip(),
                "account": account.strip(),
                "password": password,
                "custom_fields": custom_values,
                "archived": False,
            }
        )
        if not isinstance(created, dict) or not created.get("id"):
            raise RuntimeError("The storage layer did not return a UUID for the new job.")
    except Exception as exc:
        st.error(f"Could not create job: {exc}")
        return

    _set_flash("success", "Job created.")
    _navigate("job_detail", str(created["id"]))
    st.rerun()


def _status_options_for_job(
    statuses: list[dict[str, Any]], current_status_id: str
) -> tuple[list[str], dict[str, str]]:
    active = [status for status in statuses if status.get("active", True)]
    options = [str(status.get("id", "")) for status in active]
    status_by_id = {str(status.get("id", "")): status for status in statuses}
    if current_status_id and current_status_id not in options:
        options.append(current_status_id)

    labels = _status_label_map(statuses)
    for status_id in options:
        status = status_by_id.get(status_id)
        if status is None:
            labels[status_id] = f"Unknown status ({status_id})"
        elif not status.get("active", True):
            labels[status_id] = f"{labels.get(status_id, status_id)} (Inactive)"
    return options, labels


def _set_applied_date_today(date_key: str) -> None:
    """Update only the form draft, using the machine's local date at click time."""
    st.session_state[date_key] = date.today()


def _render_basic_job_tab(
    job: dict[str, Any], settings: dict[str, Any]
) -> None:
    job_id = str(job["id"])
    statuses = _status_records(settings)
    current_status_id = str(job.get("status_id", ""))
    status_options, status_labels = _status_options_for_job(statuses, current_status_id)
    custom_fields = _custom_field_records(settings)
    existing_custom = job.get("custom_fields", {})
    if not isinstance(existing_custom, dict):
        existing_custom = {}
    editable_custom_fields = [
        field
        for field in custom_fields
        if field.get("active", True) or str(field.get("id", "")) in existing_custom
    ]
    prefix = f"edit_job_{job_id}"
    show_password = st.checkbox("Show password", key=f"{prefix}_show_password")

    if not status_options:
        st.error("No statuses are available. Add one in Settings first.")
        return

    # Use a new key to avoid reusing the former text widget's string state.
    date_key = f"{prefix}_date_picker"
    if date_key not in st.session_state:
        saved_date = str(job.get("applied_date", "") or "").strip()
        try:
            st.session_state[date_key] = date.fromisoformat(saved_date) if saved_date else None
        except ValueError:
            st.session_state[date_key] = None
            st.warning("The saved Date Applied is invalid. Choose a date or leave it blank before saving.")

    with st.form(f"{prefix}_form", enter_to_submit=False):
        left, right = st.columns(2)
        with left:
            status_id = st.selectbox(
                "Status",
                options=status_options,
                index=status_options.index(current_status_id) if current_status_id in status_options else 0,
                format_func=lambda value: status_labels.get(value, value),
                key=f"{prefix}_status",
            )
            company = st.text_input(
                "Company *", value=str(job.get("company", "")), key=f"{prefix}_company"
            )
            job_title = st.text_input(
                "Job Title *", value=str(job.get("job_title", "")), key=f"{prefix}_title"
            )
            date_col, today_col = st.columns([4, 1], vertical_alignment="bottom")
            with date_col:
                applied_date = st.date_input(
                    "Date Applied",
                    value=None,
                    min_value=date.min,
                    max_value=date.max,
                    format="YYYY-MM-DD",
                    key=date_key,
                )
            with today_col:
                st.form_submit_button(
                    "Today",
                    key=f"{prefix}_today",
                    on_click=_set_applied_date_today,
                    args=(date_key,),
                    width="stretch",
                )
        with right:
            location = st.text_input(
                "Location", value=str(job.get("location", "")), key=f"{prefix}_location"
            )
            job_url = st.text_input(
                "Job URL", value=str(job.get("job_url", "")), key=f"{prefix}_url"
            )
            email = st.text_input(
                "Email", value=str(job.get("email", "") or ""), key=f"{prefix}_email"
            )
            account = st.text_input(
                "Account", value=str(job.get("account", "")), key=f"{prefix}_account"
            )
            password = st.text_input(
                "Password",
                value=str(job.get("password", "")),
                type="default" if show_password else "password",
                key=f"{prefix}_password",
            )

        if editable_custom_fields:
            st.subheader("Custom Fields")
        custom_values = _render_custom_field_widgets(
            editable_custom_fields, existing_custom, prefix
        )
        submitted = st.form_submit_button("Save Changes", type="primary", width="stretch")

    st.caption(f"Created: {job.get('created_at', '') or '—'}")
    st.caption(f"Last updated: {job.get('updated_at', '') or '—'}")

    if submitted:
        errors: list[str] = []
        company = company.strip()
        job_title = job_title.strip()
        if not company:
            errors.append("Company is required.")
        if not job_title:
            errors.append("Job title is required.")
        normalized_date = applied_date.isoformat() if applied_date is not None else ""
        custom_values = _validate_custom_values(editable_custom_fields, custom_values, errors)
        if errors:
            for error in errors:
                st.error(error)
        else:
            merged_custom = dict(existing_custom)
            merged_custom.update(custom_values)
            try:
                update_job(
                    job_id,
                    {
                        "status_id": status_id,
                        "applied_date": normalized_date,
                        "company": company,
                        "job_title": job_title,
                        "location": location.strip(),
                        "job_url": job_url.strip(),
                        "email": email.strip(),
                        "account": account.strip(),
                        "password": password,
                        "custom_fields": merged_custom,
                    },
                )
            except Exception as exc:
                st.error(f"Could not save changes: {exc}")
            else:
                _set_flash("success", "Job details updated.")
                st.rerun()

    st.divider()
    archive_col, delete_col = st.columns(2)
    with archive_col:
        archived = bool(job.get("archived", False))
        archive_label = "Unarchive Job" if archived else "Archive Job"
        archive_action = "unarchive job" if archived else "archive job"
        archive_success = "Job unarchived." if archived else "Job archived."
        if st.button(archive_label, width="stretch", key=f"archive_{job_id}"):
            try:
                archive_job(job_id, not archived)
            except Exception as exc:
                st.error(f"Could not {archive_action}: {exc}")
            else:
                _set_flash("success", archive_success)
                st.rerun()

    with delete_col:
        confirm_key = f"confirm_delete_{job_id}"
        confirmed = st.checkbox(
            "I understand that this permanently deletes the job, resume, PDF, notes, attachments, and reminders",
            key=confirm_key,
        )
        if st.button(
            "Delete Permanently",
            type="secondary",
            width="stretch",
            disabled=not confirmed,
            key=f"delete_job_{job_id}",
        ):
            try:
                delete_job(job_id)
            except Exception as exc:
                st.error(f"Could not permanently delete job: {exc}")
            else:
                st.session_state.pop(confirm_key, None)
                st.session_state.pop("selected_job_id", None)
                _set_flash("success", "Job and its associated files were permanently deleted.")
                _navigate("dashboard")
                st.rerun()


def _display_timestamp(value: Any) -> str:
    text = str(value or "").strip()
    return text.replace("T", " ", 1) if text else "—"


def _pdf_download_name(label: str) -> str:
    safe_label = re.sub(r"[^A-Za-z0-9._-]+", "-", label).strip("-._")
    return f"{safe_label or 'resume'}.pdf"


def _render_saved_pdf_library(job: dict[str, Any]) -> None:
    job_id = str(job["id"])
    st.divider()
    st.subheader("Saved PDF Resumes")

    try:
        versions = list_pdf_versions(job_id)
    except Exception as exc:
        st.error(f"Could not open the PDF library: {exc}")
        return

    uploaded_pdf = st.file_uploader(
        "Upload a PDF",
        type=["pdf"],
        key=f"pdf_library_upload_{job_id}",
    )
    uploaded_data = uploaded_pdf.getvalue() if uploaded_pdf is not None else b""
    upload_token = (
        hashlib.sha256(uploaded_data).hexdigest()[:12] if uploaded_data else "empty"
    )
    upload_default = Path(uploaded_pdf.name).stem if uploaded_pdf is not None else "Uploaded Resume"
    upload_label = st.text_input(
        "Uploaded version name",
        value=upload_default,
        key=f"pdf_upload_label_{job_id}_{upload_token}",
        disabled=uploaded_pdf is None,
    )
    if st.button(
        "Save Uploaded PDF",
        key=f"save_pdf_upload_{job_id}",
        disabled=uploaded_pdf is None,
    ):
        try:
            if uploaded_pdf is None:
                raise ValueError("Select a PDF first.")
            add_uploaded_pdf_version(
                job_id,
                uploaded_data,
                upload_label,
                uploaded_pdf.name,
            )
        except Exception as exc:
            st.error(f"Could not save the uploaded PDF: {exc}")
        else:
            _set_flash("success", "PDF version added to the library.")
            st.rerun()

    if not versions:
        st.info("No saved PDF versions yet.")
        return

    version_by_id = {str(version["id"]): version for version in versions}
    version_ids = list(version_by_id)
    options_revision = hashlib.sha256("|".join(version_ids).encode("utf-8")).hexdigest()[:12]
    selected_id = st.selectbox(
        "PDF version",
        options=version_ids,
        format_func=lambda version_id: str(version_by_id[version_id].get("label", version_id)),
        key=f"pdf_library_selection_{job_id}_{options_revision}",
    )
    selected = version_by_id[str(selected_id)]
    source_labels = {
        "compiled": "Compiled from LaTeX",
        "uploaded": "Uploaded",
        "extension": "Chrome extension",
        "legacy": "Imported from resume.pdf",
    }
    st.caption(
        f"Created: {_display_timestamp(selected.get('created_at'))} · "
        f"Source: {source_labels.get(str(selected.get('source')), 'Unknown')}"
    )
    original_filename = str(selected.get("original_filename", ""))
    if original_filename:
        st.caption(f"Original file: {original_filename}")

    try:
        selected_data = load_pdf_version(job_id, str(selected_id))
    except Exception as exc:
        st.error(f"Could not read the selected PDF: {exc}")
        return

    rename_label = st.text_input(
        "Rename selected version",
        value=str(selected.get("label", "")),
        key=f"rename_pdf_label_{job_id}_{selected_id}",
    )
    delete_confirmed = st.checkbox(
        "Confirm deletion of the selected PDF",
        key=f"confirm_delete_pdf_{job_id}_{selected_id}",
    )
    download_col, rename_col, delete_col = st.columns(3)
    with download_col:
        st.download_button(
            "Download Selected",
            data=selected_data,
            file_name=_pdf_download_name(str(selected.get("label", "resume"))),
            mime="application/pdf",
            width="stretch",
            key=f"download_saved_pdf_{job_id}_{selected_id}",
            on_click="ignore",
        )
    with rename_col:
        if st.button(
            "Rename",
            width="stretch",
            key=f"rename_pdf_{job_id}_{selected_id}",
        ):
            try:
                rename_pdf_version(job_id, str(selected_id), rename_label)
            except Exception as exc:
                st.error(f"Could not rename the PDF version: {exc}")
            else:
                _set_flash("success", "PDF version renamed.")
                st.rerun()
    with delete_col:
        if st.button(
            "Delete Selected",
            width="stretch",
            key=f"delete_saved_pdf_{job_id}_{selected_id}",
            disabled=not delete_confirmed,
        ):
            try:
                delete_pdf_version(job_id, str(selected_id))
            except Exception as exc:
                st.error(f"Could not delete the PDF version: {exc}")
            else:
                _set_flash("success", "PDF version deleted.")
                st.rerun()

    st.markdown("#### PDF Preview")
    _render_pdf_preview(selected_data, f"saved-pdf-{job_id}-{selected_id}", height=800)


def _render_pdf_preview(data: bytes, key: str, height: int = 720) -> None:
    """Use the local PDF viewer for both resume PDFs and job attachments."""
    try:
        st.pdf(data, height=height, key=key)
    except Exception:
        st.warning("PDF preview unavailable. You can still download the PDF.")


def _sync_resume_draft(job_id: str) -> None:
    """Retain source independently of the editor, which can be unmounted."""
    st.session_state[f"resume_tex_draft_{job_id}"] = st.session_state[
        f"resume_tex_editor_{job_id}"
    ]


def _render_resume_tab(job: dict[str, Any]) -> None:
    job_id = str(job["id"])
    try:
        job_directory = Path(get_job_directory(job_id))
    except Exception as exc:
        st.error(f"Could not open the job folder: {exc}")
        return

    tex_path = job_directory / "resume.tex"
    tex_key = f"resume_tex_editor_{job_id}"
    draft_key = f"resume_tex_draft_{job_id}"
    if draft_key not in st.session_state:
        try:
            st.session_state[draft_key] = load_text_file(tex_path)
        except Exception as exc:
            st.error(f"Could not read resume.tex: {exc}")
            return

    st.subheader("LaTeX Workspace")
    mode_key = f"resume_mode_{job_id}"
    st.session_state.setdefault(mode_key, "Split view")
    mode = st.radio(
        "Workspace view",
        ["LaTeX only", "Compiled preview only", "Split view"],
        horizontal=True,
        key=mode_key,
    )
    st.caption(
        "Source changes do not update the preview until you press Compile. "
        "Only compile LaTeX files you trust."
    )
    pdflatex_path = find_pdflatex()
    if pdflatex_path is None:
        st.warning(
            "pdflatex was not found. Install MacTeX or BasicTeX, then restart the "
            "application. Editing, downloads, and the PDF library remain available."
        )

    # These controls stay mounted in every mode and always use this job's draft.
    uploaded_tex = st.file_uploader(
        "Upload a .tex File",
        type=["tex"],
        key=f"resume_tex_upload_{job_id}",
    )
    if st.button(
        "Upload and Save .tex",
        key=f"save_uploaded_tex_{job_id}",
        disabled=uploaded_tex is None,
    ):
        try:
            if uploaded_tex is None:
                raise ValueError("Select a .tex file first.")
            uploaded_text = uploaded_tex.getvalue().decode("utf-8")
            save_text_file(tex_path, uploaded_text)
            st.session_state[draft_key] = uploaded_text
            st.session_state[tex_key] = uploaded_text
        except UnicodeDecodeError:
            st.error("The .tex file must use UTF-8 encoding.")
        except Exception as exc:
            st.error(f"Could not save the .tex file: {exc}")
        else:
            _set_flash("success", "resume.tex uploaded and saved.")
            st.rerun()

    tex_content = str(st.session_state[draft_key])
    save_col, compile_col, download_col, pdf_col, library_col = st.columns(5)
    with save_col:
        if st.button(
            "Save .tex", width="stretch", key=f"save_tex_{job_id}"
        ):
            try:
                save_text_file(tex_path, tex_content)
            except Exception as exc:
                st.error(f"Could not save resume.tex: {exc}")
            else:
                st.success("resume.tex saved. Preview unchanged.")
    with compile_col:
        if st.button(
            "Compile",
            type="primary",
            width="stretch",
            key=f"compile_tex_{job_id}",
            disabled=pdflatex_path is None,
        ):
            try:
                with st.spinner("Compiling resume.tex…"):
                    result = compile_resume_latex(job_id, tex_content)
            except Exception as exc:
                st.error(f"Compilation could not be started: {exc}")
            else:
                if result.get("success"):
                    st.success("Compilation succeeded. Preview updated.")
                else:
                    st.error(str(result.get("error_summary", "Compilation failed.")))
    with download_col:
        st.download_button(
            "Download .tex",
            data=tex_content.encode("utf-8"),
            file_name="resume.tex",
            mime="text/plain",
            width="stretch",
            key=f"download_tex_{job_id}",
            on_click="ignore",
        )

    try:
        status = load_compile_status(job_id)
        preview_data = load_compiled_preview(job_id)
        compile_log = load_compile_log(job_id)
    except Exception as exc:
        st.error(f"Could not load the compiled preview: {exc}")
        status = None
        preview_data = None
        compile_log = ""
    compiled_at = status.get("compiled_at") if status else None
    preview_revision = (
        hashlib.sha256(preview_data).hexdigest()[:16]
        if preview_data is not None else "empty"
    )
    with pdf_col:
        st.download_button(
            "Download Compiled PDF",
            data=preview_data or b"",
            file_name="compiled-resume.pdf",
            mime="application/pdf",
            width="stretch",
            key=f"download_compiled_pdf_{job_id}_{preview_revision}",
            on_click="ignore",
            disabled=preview_data is None,
        )
    with library_col:
        save_to_library = st.button(
            "Save to PDF Library",
            width="stretch",
            key=f"save_compiled_pdf_{job_id}_{preview_revision}",
            disabled=preview_data is None,
        )
    compiled_label = st.text_input(
        "Version name",
        value=f"Compiled Resume - {_display_timestamp(compiled_at)}",
        key=f"compiled_pdf_label_{job_id}_{preview_revision}",
        disabled=preview_data is None,
    )
    if save_to_library:
        try:
            save_compiled_pdf_version(job_id, compiled_label)
        except Exception as exc:
            st.error(f"Could not save the compiled PDF: {exc}")
        else:
            _set_flash("success", "Compiled PDF saved to the library.")
            st.rerun()

    current_source_hash = hashlib.sha256(tex_content.encode("utf-8")).hexdigest()
    if status and not status.get("success"):
        if preview_data is not None:
            st.error("Compilation failed. The previous successful preview is still shown.")
        else:
            st.error("Compilation failed.")
        if status.get("error_summary"):
            st.caption(str(status["error_summary"]))
    if (
        status
        and preview_data is not None
        and status.get("preview_source_hash") != current_source_hash
    ):
        st.info("The editor contains changes that have not been compiled yet.")

    # Only Split view creates columns; single-pane modes use the whole workspace.
    if mode == "Split view":
        editor_container, preview_container = st.columns(2)
    else:
        editor_container = preview_container = st.container()
    if mode != "Compiled preview only":
        with editor_container:
            st.markdown("#### LaTeX Source")
            # Streamlit removes hidden widgets' state. The separate draft survives.
            st.session_state[tex_key] = st.session_state[draft_key]
            st.text_area(
                "resume.tex Contents",
                height=620,
                key=tex_key,
                on_change=_sync_resume_draft,
                args=(job_id,),
            )
    if mode != "LaTeX only":
        with preview_container:
            st.markdown("#### Compiled Preview")
            if preview_data is None:
                st.info("Press Compile to generate a preview.")
            else:
                st.caption(f"Last successful compile: {_display_timestamp(compiled_at)}")
                _render_pdf_preview(
                    preview_data,
                    key=f"compiled-preview-{job_id}-{preview_revision}",
                )

    if compile_log:
        with st.expander("View full compilation log"):
            st.code(compile_log, language=None)

    _render_saved_pdf_library(job)


TEXT_PREVIEW_BYTES = 64 * 1024
CSV_PREVIEW_BYTES = 256 * 1024
CSV_PREVIEW_ROWS = 200


def _attachment_markdown(text: str) -> str:
    # Entities are emitted as text, not reparsed as image or HTML syntax.
    # This covers inline/reference images, nested links, and escaped markers
    # without trying to parse Markdown destinations with a regular expression.
    return text.replace("!", "&#33;").replace("<", "&lt;")


def _read_attachment_text(path: Path, limit: int) -> tuple[str, bool, bool]:
    with path.open("rb") as handle:
        data = handle.read(limit + 1)
    truncated = len(data) > limit
    data = data[:limit]
    try:
        text = codecs.getincrementaldecoder("utf-8-sig")().decode(data, final=not truncated)
        undecodable = False
    except UnicodeError:
        text = data.decode("utf-8-sig", errors="replace")
        undecodable = True
    return text, truncated, undecodable


def _render_attachment_preview(job_id: str, selected: dict[str, Any], path: Path) -> None:
    file_id = str(selected["id"])
    suffix = path.suffix.lower()
    try:
        if path.stat().st_size == 0:
            st.info("This file is empty. You can still download it.")
        elif suffix == ".pdf":
            data = load_attachment(job_id, file_id)
            if not data.lstrip().startswith(b"%PDF-") or b"%%EOF" not in data[-4096:]:
                st.warning("This PDF appears damaged or incomplete. You can still download it.")
                return
            if b"/Encrypt" in data:
                st.info("This PDF may be encrypted. If the viewer cannot open it, download it to view locally.")
            _render_pdf_preview(data, f"attachment-pdf-{job_id}-{file_id}")
        elif suffix in {".png", ".jpg", ".jpeg", ".webp"}:
            data = load_attachment(job_id, file_id)
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(data)) as picture:
                    if picture.format not in {"PNG", "JPEG", "WEBP"}:
                        raise ValueError("The image content does not match a supported image format.")
                    picture.verify()
                st.image(data, width="stretch")
        elif suffix in {".txt", ".log", ".tex", ".md", ".markdown", ".csv", ".json"}:
            limit = CSV_PREVIEW_BYTES if suffix == ".csv" else TEXT_PREVIEW_BYTES
            content, truncated, undecodable = _read_attachment_text(path, limit)
            if truncated:
                st.caption(f"Partial preview: limited to the first {limit // 1024} KiB. Download for the complete file.")
            if undecodable:
                st.warning("This file is not valid UTF-8. Unreadable characters are replaced in the preview; the original download is unchanged.")
            if not content.strip():
                st.info("This file contains no visible text.")
            elif suffix in {".md", ".markdown"}:
                st.caption("Markdown preview: images and embedded HTML are disabled.")
                st.markdown(_attachment_markdown(content), unsafe_allow_html=False)
            elif suffix == ".csv":
                reader = csv.reader(io.StringIO(content), strict=True)
                header = next(reader, [])[:50]
                rows = []
                try:
                    for row in reader:
                        if len(rows) == CSV_PREVIEW_ROWS:
                            break
                        rows.append([cell[:2000] for cell in row[:50]])
                except csv.Error:
                    if not truncated:
                        raise
                    st.caption("The final incomplete CSV record was omitted at the preview limit.")
                # Numeric column prefixes disambiguate duplicate or empty headers.
                column_count = max([len(header), *(len(row) for row in rows)])
                columns = [f"{i + 1}: {header[i][:200] if i < len(header) else ''}" for i in range(column_count)]
                padded = [row + [""] * (column_count - len(row)) for row in rows]
                st.caption("Partial CSV preview: up to 200 data rows, 50 columns, and 2,000 characters per cell.")
                st.dataframe(pd.DataFrame(padded, columns=columns), hide_index=True, width="stretch")
            elif suffix == ".json" and not truncated and not undecodable:
                try:
                    parsed = json.loads(content)
                except (ValueError, RecursionError) as exc:
                    st.warning(f"Invalid JSON: {exc}")
                    st.code(content, language="text")
                else:
                    st.json(parsed, expanded=2)
            else:
                if suffix == ".json":
                    st.caption("JSON is shown as text because the preview is truncated or cannot be fully decoded.")
                st.code(content, language="latex" if suffix == ".tex" else "text")
        else:
            st.info("This file type does not support inline preview.")
    except Exception as exc:
        st.warning(f"Could not preview this file: {exc}. You can still download the original file.")


def _select_attachment(job_id: str) -> None:
    st.session_state[f"attachment_selection_{job_id}"] = st.session_state.get(
        f"attachment_picker_{job_id}"
    )


def _render_files_tab(job: dict[str, Any]) -> None:
    job_id = str(job["id"])
    st.subheader("Files")
    st.caption(f"Up to {MAX_ATTACHMENT_BYTES // (1024 * 1024)} MB per file. Attachments are stored separately from the resume PDF Library.")
    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            files = list_attachments(job_id)
        for item in caught:
            st.warning(f"Storage warning: {item.message}")
    except Exception as exc:
        st.error(f"Could not safely open the attachment index: {exc}")
        return

    selection_key = f"attachment_selection_{job_id}"
    picker_key = f"attachment_picker_{job_id}"
    upload_round_key = f"attachment_upload_round_{job_id}"
    upload_round = st.session_state.setdefault(upload_round_key, 0)
    uploaded = st.file_uploader(
        "Upload files (multiple files allowed)",
        accept_multiple_files=True,
        max_upload_size=MAX_ATTACHMENT_BYTES // (1024 * 1024),
        key=f"attachment_upload_{job_id}_{upload_round}",
    )
    if st.button("Upload & Save", key=f"save_attachments_{job_id}", disabled=not uploaded):
        try:
            added = add_attachments(job_id, [(item.name, item.getvalue()) for item in uploaded])
        except Exception as exc:
            st.error(f"Could not save attachments: {exc}")
        else:
            st.session_state[upload_round_key] = upload_round + 1
            st.session_state[selection_key] = added[0]["id"] if added else None
            st.session_state.pop(picker_key, None)
            _set_flash("success", f"Saved {len(added)} attachment(s).")
            st.rerun()

    by_id = {str(item["id"]): item for item in files}
    if st.session_state.get(selection_key) not in by_id:
        st.session_state[selection_key] = next(iter(by_id), None)
        st.session_state.pop(picker_key, None)
    if not files:
        st.info("No files saved yet. Choose files, then press Upload & Save.")
        return

    list_col, preview_col = st.columns([1, 2.5])
    with list_col:
        st.markdown("#### Saved Files")
        st.session_state[picker_key] = st.session_state[selection_key]
        selected_id = st.radio(
            "Saved files",
            options=list(by_id),
            format_func=lambda file_id: _attachment_markdown(
                f"{by_id[file_id]['original_filename']} · {_display_timestamp(by_id[file_id]['uploaded_at'])}"
            ),
            key=picker_key,
            on_change=_select_attachment,
            args=(job_id,),
            label_visibility="collapsed",
        )
        st.session_state[selection_key] = selected_id

    with preview_col:
        st.markdown("#### Preview")
        selected = by_id[selected_id]
        st.text(str(selected["original_filename"]))
        st.caption(f"Size: {selected['size_bytes']:,} bytes · Uploaded: {_display_timestamp(selected['uploaded_at'])}")
        try:
            path = get_attachment_path(job_id, selected_id)
        except Exception as exc:
            st.error(f"Could not read the selected file: {exc}")
            path = None

        download_col, delete_col = st.columns(2)
        with download_col:
            if path is not None:
                st.download_button(
                    "Download Selected File",
                    data=lambda: load_attachment(job_id, selected_id),
                    file_name=str(selected["original_filename"]),
                    mime="application/octet-stream",
                    key=f"download_attachment_{job_id}_{selected_id}",
                    on_click="ignore",
                    width="stretch",
                )
        with delete_col:
            confirm_key = f"confirm_delete_attachment_{job_id}_{selected_id}"
            confirmed = st.checkbox("Confirm deletion of the selected file", key=confirm_key)
            if st.button(
                "Delete Selected File",
                key=f"delete_attachment_{job_id}_{selected_id}",
                disabled=not confirmed,
                width="stretch",
            ):
                try:
                    delete_attachment(job_id, selected_id)
                except Exception as exc:
                    st.error(f"Could not delete the selected file: {exc}")
                else:
                    st.session_state[selection_key] = next((file_id for file_id in by_id if file_id != selected_id), None)
                    st.session_state.pop(picker_key, None)
                    st.session_state.pop(confirm_key, None)
                    _set_flash("success", "Attachment deleted.")
                    st.rerun()
        if path is not None:
            _render_attachment_preview(job_id, selected, path)


def _render_notes_tab(job: dict[str, Any]) -> None:
    job_id = str(job["id"])
    try:
        notes_path = get_job_directory(job_id) / "notes.md"
    except Exception as exc:
        st.error(f"Could not open the notes file: {exc}")
        return

    notes_key = f"markdown_notes_editor_{job_id}"
    if notes_key not in st.session_state:
        try:
            st.session_state[notes_key] = load_text_file(notes_path)
        except FileNotFoundError:
            st.session_state[notes_key] = ""
        except Exception as exc:
            st.error(f"Could not read notes.md: {exc}")
            st.session_state[notes_key] = ""

    editor_col, preview_col = st.columns(2)
    with editor_col:
        st.subheader("Markdown Editor")
        notes_content = st.text_area(
            "Notes",
            height=520,
            key=notes_key,
            label_visibility="collapsed",
        )
        if st.button("Save Notes", type="primary", key=f"save_notes_{job_id}"):
            try:
                save_text_file(notes_path, notes_content)
            except Exception as exc:
                st.error(f"Could not save notes.md: {exc}")
            else:
                st.success("notes.md saved.")

    with preview_col:
        st.subheader("Markdown Preview")
        if notes_content.strip():
            st.markdown(notes_content)
        else:
            st.caption("No notes yet.")


def _reminder_set_today(date_key: str, timezone_key: str) -> None:
    """Submit the form draft before changing its date; never persist on Today."""
    from datetime import datetime
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    try:
        today = datetime.now(ZoneInfo(st.session_state.get(timezone_key, ""))).date()
    except (ValueError, ZoneInfoNotFoundError):
        today = date.today()
    st.session_state[date_key] = today


def _reminder_form_payload(values: dict[str, Any]) -> dict[str, Any]:
    """Validate explicit wall-clock choices before constructing a storage update."""
    from calendar_utils import resolve_local_datetime
    from storage import REMINDER_KINDS

    title = str(values.get("title", "")).strip()
    if not title:
        raise ValueError("Title is required.")
    if values.get("kind") not in REMINDER_KINDS:
        raise ValueError("Choose a reminder type.")
    zone = str(values.get("timezone", "")).strip()
    if not zone:
        raise ValueError("Enter an IANA time zone, or confirm your local time zone in Settings.")
    if values.get("start_date") is None or values.get("start_time") is None:
        raise ValueError("Choose both a date and a time. A missing time is never saved as midnight.")
    if not values.get("confirmed"):
        raise ValueError("Confirm the event time and time zone before saving.")
    start = resolve_local_datetime(
        values["start_date"], values["start_time"], zone, fold=values.get("start_fold")
    )
    end_date, end_time = values.get("end_date"), values.get("end_time")
    if (end_date is None) != (end_time is None):
        raise ValueError("For an end time, enter both the end date and end time, or clear both.")
    end = None
    if end_date is not None:
        end = resolve_local_datetime(end_date, end_time, zone, fold=values.get("end_fold"))
        if end.timestamp() <= start.timestamp():
            raise ValueError("End date/time must be later than the start date/time.")
    return {
        "title": title,
        "kind": values["kind"],
        "start_at": start.isoformat(),
        "end_at": end.isoformat() if end is not None else None,
        "timezone": zone,
        "location_or_url": str(values.get("location_or_url", "")).strip(),
        "notes": str(values.get("notes", "")),
    }


def _reminder_reset_form(job_id: str) -> None:
    st.session_state.pop(f"reminder_editing_{job_id}", None)
    epoch_key = f"reminder_form_epoch_{job_id}"
    st.session_state[epoch_key] = st.session_state.get(epoch_key, 0) + 1


def _reminder_render_form(
    job_id: str, settings: dict[str, Any], existing: dict[str, Any] | None
) -> None:
    from calendar_utils import parse_aware_datetime
    from storage import REMINDER_KINDS, create_reminder, update_reminder
    from zoneinfo import ZoneInfo

    reminder_id = str(existing["id"]) if existing else "new"
    epoch = st.session_state.get(f"reminder_form_epoch_{job_id}", 0)
    prefix = f"reminder_form_{job_id}_{reminder_id}_{epoch}"
    zone = str(existing["timezone"]) if existing else (_get_reminder_timezone(settings) or "")
    start = parse_aware_datetime(existing["start_at"]).astimezone(ZoneInfo(zone)) if existing else None
    end = (
        parse_aware_datetime(existing["end_at"]).astimezone(ZoneInfo(zone))
        if existing and existing.get("end_at") else None
    )
    defaults = {
        "title": str(existing.get("title", "")) if existing else "",
        "kind": str(existing["kind"]) if existing else "interview",
        "start_date": start.date() if start else None,
        "start_time": start.time().replace(tzinfo=None) if start else None,
        "end_date": end.date() if end else None,
        "end_time": end.time().replace(tzinfo=None) if end else None,
        "timezone": zone,
        "confirmed": False,
        "location_or_url": str(existing.get("location_or_url", "")) if existing else "",
        "notes": str(existing.get("notes", "")) if existing else "",
        "start_fold": None,
        "end_fold": None,
    }
    for name, default in defaults.items():
        key = f"{prefix}_{name}"
        if key not in st.session_state:
            st.session_state[key] = default
    kind_labels = dict(zip(REMINDER_KINDS, ["Interview", "Assessment", "Deadline", "Follow-up", "Other"]))
    st.subheader("Edit Reminder" if existing else "Add Reminder")
    if not zone:
        st.info("A local IANA time zone could not be determined. Enter and confirm the event time zone below, or set it in Settings.")
    st.caption("Times belong to the selected time zone. A Deadline is a cutoff point; an end time is optional.")
    with st.form(f"{prefix}_form", enter_to_submit=False):
        title = st.text_input("Title *", placeholder="e.g. Technical interview", key=f"{prefix}_title")
        kind = st.selectbox(
            "Type", options=list(REMINDER_KINDS), format_func=lambda item: kind_labels[item],
            key=f"{prefix}_kind",
        )
        day_col, today_col, time_col = st.columns([3, 1, 3], vertical_alignment="bottom")
        with day_col:
            start_date = st.date_input(
                "Date *", value=None, min_value=date.min, max_value=date.max,
                format="YYYY-MM-DD", key=f"{prefix}_start_date",
            )
        with today_col:
            st.form_submit_button(
                "Today", key=f"{prefix}_today", on_click=_reminder_set_today,
                args=(f"{prefix}_start_date", f"{prefix}_timezone"), width="stretch",
            )
        with time_col:
            start_time = st.time_input("Time *", value=None, key=f"{prefix}_start_time")
        timezone_name = st.text_input(
            "Time zone (IANA) *", placeholder="America/New_York", key=f"{prefix}_timezone",
        )
        confirmed = st.checkbox("I confirm the event time and time zone", key=f"{prefix}_confirmed")
        end_day_col, end_time_col = st.columns(2)
        with end_day_col:
            end_date = st.date_input(
                "End date (optional)", value=None, min_value=date.min, max_value=date.max,
                format="YYYY-MM-DD", key=f"{prefix}_end_date",
            )
        with end_time_col:
            end_time = st.time_input("End time (optional)", value=None, key=f"{prefix}_end_time")
        with st.expander("Daylight saving time: repeated hours"):
            st.caption("If a clock change repeats your selected time, explicitly choose its first or second occurrence. Nonexistent times must be corrected.")
            fold_labels = {None: "Choose only if the time occurs twice", 0: "First occurrence (earlier instant)", 1: "Second occurrence (later instant)"}
            start_fold = st.selectbox(
                "Start time occurrence", [None, 0, 1], format_func=lambda value: fold_labels[value],
                key=f"{prefix}_start_fold",
            )
            end_fold = st.selectbox(
                "End time occurrence", [None, 0, 1], format_func=lambda value: fold_labels[value],
                key=f"{prefix}_end_fold",
            )
        location = st.text_input("Location or meeting URL", key=f"{prefix}_location_or_url")
        notes = st.text_area("Reminder notes", key=f"{prefix}_notes")
        submitted = st.form_submit_button("Save Reminder", type="primary", width="stretch")

    if existing and st.button("Discard reminder edits", key=f"{prefix}_discard"):
        _reminder_reset_form(job_id)
        st.rerun()
    if not submitted:
        return
    try:
        payload = _reminder_form_payload({
            "title": title, "kind": kind, "start_date": start_date, "start_time": start_time,
            "timezone": timezone_name, "confirmed": confirmed, "end_date": end_date,
            "end_time": end_time, "start_fold": start_fold, "end_fold": end_fold,
            "location_or_url": location, "notes": notes,
        })
        if existing:
            update_reminder(job_id, reminder_id, payload)
        else:
            create_reminder(job_id, payload)
    except Exception as exc:
        st.error(f"Could not save reminder: {exc}")
    else:
        _reminder_reset_form(job_id)
        _set_flash("success", "Reminder updated." if existing else "Reminder saved.")
        st.rerun()


def _render_reminders_tab(job: dict[str, Any], settings: dict[str, Any]) -> None:
    from calendar_utils import parse_aware_datetime
    from storage import delete_reminder, list_reminders, set_reminder_status
    from zoneinfo import ZoneInfo

    job_id = str(job["id"])
    st.caption("Local reminders appear in Calendar and in-app summaries. There are no notifications when the app is closed.")
    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            reminders = list_reminders(job_id)
        for warning_record in caught:
            st.warning(f"Reminder storage warning: {warning_record.message}")
    except Exception as exc:
        st.error(f"Could not read reminders: {exc}")
        st.warning("Reminder editing is unavailable until a valid reminder file or backup can be read. The damaged data has not been replaced.")
        return

    by_id = {str(item["id"]): item for item in reminders}
    edit_key = f"reminder_editing_{job_id}"
    editing_id = st.session_state.get(edit_key)
    existing = by_id.get(str(editing_id)) if editing_id else None
    _reminder_render_form(job_id, settings, existing)
    st.divider()
    st.subheader("Reminders")
    if not reminders:
        st.info("No reminders yet. Save a reminder above to add it to Calendar.")
        return
    labels = {"interview": "Interview", "assessment": "Assessment", "deadline": "Deadline", "follow_up": "Follow-up", "other": "Other"}
    for reminder in sorted(reminders, key=lambda item: (parse_aware_datetime(item["start_at"]).timestamp(), str(item["id"]))):
        reminder_id = str(reminder["id"])
        key = f"reminder_{job_id}_{reminder_id}"
        event_zone = ZoneInfo(reminder["timezone"])
        start = parse_aware_datetime(reminder["start_at"]).astimezone(event_zone)
        with st.container(border=True):
            st.text(f"[{labels[reminder['kind']]}] {reminder['title']}")
            st.caption(f"{start.strftime('%Y-%m-%d %H:%M %z')} · {reminder['timezone']} · {reminder['status']}")
            if reminder.get("end_at"):
                end = parse_aware_datetime(reminder["end_at"]).astimezone(event_zone)
                st.caption(f"Ends: {end.strftime('%Y-%m-%d %H:%M %z')} · {reminder['timezone']}")
            if reminder.get("location_or_url"):
                st.text(f"Location / meeting URL: {reminder['location_or_url']}")
            if reminder.get("notes"):
                st.text(reminder["notes"])
            edit_col, done_col, reopen_col, cancel_col, calendar_col = st.columns(5)
            with edit_col:
                if st.button("Edit", key=f"{key}_edit", width="stretch"):
                    _reminder_reset_form(job_id)
                    st.session_state[edit_key] = reminder_id
                    st.rerun()
            action = None
            with done_col:
                if st.button("Mark completed", key=f"{key}_complete", disabled=reminder["status"] == "completed", width="stretch"):
                    action = "completed"
            with reopen_col:
                if st.button("Reopen", key=f"{key}_reopen", disabled=reminder["status"] == "scheduled", width="stretch"):
                    action = "scheduled"
            with cancel_col:
                if st.button("Cancel", key=f"{key}_cancel", disabled=reminder["status"] == "cancelled", width="stretch"):
                    action = "cancelled"
            with calendar_col:
                if st.button("View in Calendar", key=f"{key}_calendar", width="stretch"):
                    _view_reminder_in_calendar(job_id, reminder, settings)
            if action is not None:
                try:
                    set_reminder_status(job_id, reminder_id, action)
                except Exception as exc:
                    st.error(f"Could not update reminder status: {exc}")
                else:
                    _set_flash("success", f"Reminder marked {action}.")
                    st.rerun()
            with st.expander("Delete reminder"):
                confirmed = st.checkbox("Confirm permanent deletion of this reminder", key=f"{key}_delete_confirm")
                if st.button("Delete Reminder", key=f"{key}_delete", disabled=not confirmed):
                    try:
                        delete_reminder(job_id, reminder_id)
                    except Exception as exc:
                        st.error(f"Could not delete reminder: {exc}")
                    else:
                        if st.session_state.get(edit_key) == reminder_id:
                            _reminder_reset_form(job_id)
                        _set_flash("success", "Reminder deleted.")
                        st.rerun()


def _render_job_detail(
    jobs: list[dict[str, Any]], settings: dict[str, Any]
) -> None:
    job_id = str(st.session_state.get("selected_job_id", ""))
    job = next((item for item in jobs if str(item.get("id", "")) == job_id), None)
    if job is None and job_id:
        try:
            loaded_job = get_job_by_id(job_id)
            if isinstance(loaded_job, dict):
                job = _jobs_from_payload([loaded_job])[0]
        except Exception as exc:
            st.error(f"Could not load job details: {exc}")
            return

    if job is None:
        st.error("This job could not be found. It may have been deleted.")
        if st.button("Back to Dashboard", key="missing_job_back"):
            _navigate("dashboard")
            st.rerun()
        return

    statuses = _status_records(settings)
    status_labels = _status_label_map(statuses)
    header, back_col = st.columns([5, 1])
    with header:
        st.title(str(job.get("company", "")) or "Untitled Company")
        st.subheader(str(job.get("job_title", "")) or "Untitled Job")
        status_id = str(job.get("status_id", ""))
        archived_text = " | Archived" if bool(job.get("archived", False)) else ""
        st.caption(f"Current status: {status_labels.get(status_id, status_id or 'Unknown')}{archived_text}")
    with back_col:
        if st.button("< Dashboard", width="stretch", key=f"detail_back_{job_id}"):
            _navigate("dashboard")
            st.rerun()

    basic_tab, resume_tab, notes_tab, files_tab, reminders_tab = st.tabs(
        ["Details", "Resume", "Markdown Notes", "Files", "Reminders"],
        key=f"job_tabs_{job_id}", on_change="rerun",
    )
    with basic_tab:
        _render_basic_job_tab(job, settings)
    with resume_tab:
        _render_resume_tab(job)
    with notes_tab:
        _render_notes_tab(job)
    with files_tab:
        _render_files_tab(job)
    with reminders_tab:
        _render_reminders_tab(job, settings)


def _replace_record(
    records: list[dict[str, Any]], record_id: str, updated: dict[str, Any]
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    replaced = False
    for record in records:
        if not replaced and str(record.get("id", "")) == record_id:
            result.append(updated)
            replaced = True
        else:
            result.append(record)
    if not replaced:
        result.append(updated)
    return result


def _save_settings_or_error(settings: dict[str, Any], success_message: str) -> bool:
    try:
        save_settings(settings)
    except Exception as exc:
        st.error(f"Could not save settings: {exc}")
        return False
    _set_flash("success", success_message)
    st.rerun()
    return True


def _render_status_settings(
    jobs: list[dict[str, Any]], settings: dict[str, Any]
) -> None:
    statuses = _status_records(settings)
    st.subheader("Add Status")
    next_order = max((_safe_int(status.get("order")) for status in statuses), default=0) + 10
    with st.form("add_status_form", clear_on_submit=True):
        add_label = st.text_input("Display Name *", key="add_status_label")
        add_group = st.selectbox(
            "Dashboard Summary Group",
            options=["pending", "offer", "rejected"],
            format_func=lambda value: SUMMARY_GROUP_LABELS[value],
            key="add_status_group",
        )
        add_order = st.number_input(
            "Sort Order", value=next_order, step=10, key="add_status_order"
        )
        add_active = st.checkbox("Active", value=True, key="add_status_active")
        add_submitted = st.form_submit_button("Add Status", type="primary")

    if add_submitted:
        if not add_label.strip():
            st.error("Status display name is required.")
        else:
            existing_ids = {str(status.get("id", "")) for status in statuses}
            status_id = f"status_{uuid.uuid4().hex[:12]}"
            while status_id in existing_ids:
                status_id = f"status_{uuid.uuid4().hex[:12]}"
            updated_settings = dict(settings)
            updated_settings["statuses"] = statuses + [
                {
                    "id": status_id,
                    "label": add_label.strip(),
                    "summary_group": add_group,
                    "order": int(add_order),
                    "active": bool(add_active),
                }
            ]
            _save_settings_or_error(updated_settings, "Status added.")

    st.divider()
    st.subheader("All Statuses")
    if not statuses:
        st.info("No statuses have been created yet.")
        return

    for index, status in enumerate(statuses):
        status_id = str(status.get("id", ""))
        used_count = sum(1 for job in jobs if str(job.get("status_id", "")) == status_id)
        with st.expander(f"{_status_display_label(status)} | {status_id}"):
            st.caption(f"The internal ID cannot be changed after creation. This status is used by {used_count} job(s).")
            with st.form(f"edit_status_{index}_{status_id}"):
                edit_label = st.text_input(
                    "Display Name *",
                    value=_status_display_label(status),
                    key=f"status_label_{index}_{status_id}",
                )
                group_options = ["pending", "offer", "rejected"]
                current_group = str(status.get("summary_group", "pending"))
                edit_group = st.selectbox(
                    "Dashboard Summary Group",
                    options=group_options,
                    index=group_options.index(current_group) if current_group in group_options else 0,
                    format_func=lambda value: SUMMARY_GROUP_LABELS[value],
                    key=f"status_group_{index}_{status_id}",
                )
                edit_order = st.number_input(
                    "Sort Order",
                    value=_safe_int(status.get("order")),
                    step=10,
                    key=f"status_order_{index}_{status_id}",
                )
                edit_active = st.checkbox(
                    "Active",
                    value=bool(status.get("active", True)),
                    key=f"status_active_{index}_{status_id}",
                )
                submitted = st.form_submit_button("Save Status")

            if submitted:
                if not edit_label.strip():
                    st.error("Status display name is required.")
                else:
                    updated_status = dict(status)
                    updated_status.update(
                        {
                            "label": edit_label.strip(),
                            "summary_group": edit_group,
                            "order": int(edit_order),
                            "active": bool(edit_active),
                        }
                    )
                    updated_settings = dict(settings)
                    updated_settings["statuses"] = _replace_record(
                        statuses, status_id, updated_status
                    )
                    _save_settings_or_error(updated_settings, "Status settings updated.")


def _parse_option_lines(text: str) -> list[str]:
    return _deduplicated_options(text.splitlines())


def _render_custom_field_settings(settings: dict[str, Any]) -> None:
    fields = _custom_field_records(settings)
    st.subheader("Add Custom Field")
    st.caption("Internal IDs may contain lowercase letters, numbers, and underscores, and must begin with a letter.")
    next_order = max((_safe_int(field.get("order")) for field in fields), default=0) + 10
    with st.form("add_custom_field_form", clear_on_submit=True):
        add_id = st.text_input("Internal ID *", placeholder="For example: salary", key="add_field_id")
        add_label = st.text_input("Display Name *", key="add_field_label")
        add_type = st.selectbox(
            "Type",
            options=["text", "date", "select", "checkbox"],
            format_func=lambda value: CUSTOM_TYPE_LABELS[value],
            key="add_field_type",
        )
        add_options_text = st.text_area(
            "Dropdown Options (required for Dropdown; one per line)",
            key="add_field_options",
        )
        add_order = st.number_input("Sort Order", value=next_order, step=10, key="add_field_order")
        add_show = st.checkbox("Show in Dashboard Table", value=True, key="add_field_show")
        add_active = st.checkbox("Active", value=True, key="add_field_active")
        add_submitted = st.form_submit_button("Add Field", type="primary")

    if add_submitted:
        field_id = add_id.strip()
        options = _parse_option_lines(add_options_text)
        errors: list[str] = []
        if not SAFE_FIELD_ID.fullmatch(field_id):
            errors.append("The internal ID format is invalid.")
        if field_id in {str(field.get("id", "")) for field in fields}:
            errors.append("The internal ID must be unique.")
        if not add_label.strip():
            errors.append("Field display name is required.")
        if add_type == "select" and not options:
            errors.append("A Dropdown field requires at least one option.")
        if errors:
            for error in errors:
                st.error(error)
        else:
            updated_settings = dict(settings)
            updated_settings["custom_fields"] = fields + [
                {
                    "id": field_id,
                    "label": add_label.strip(),
                    "type": add_type,
                    "options": options if add_type == "select" else [],
                    "show_in_table": bool(add_show),
                    "order": int(add_order),
                    "active": bool(add_active),
                }
            ]
            _save_settings_or_error(updated_settings, "Custom field added.")

    st.divider()
    st.subheader("All Custom Fields")
    if not fields:
        st.info("No custom fields have been created yet.")
        return

    for index, field in enumerate(fields):
        field_id = str(field.get("id", ""))
        field_type = str(field.get("type", "text"))
        with st.expander(f"{field.get('label', field_id)} | {field_id}"):
            st.caption("The internal ID and type cannot be changed after creation. Deactivating a field preserves existing values.")
            with st.form(f"edit_custom_field_{index}_{field_id}"):
                st.text_input(
                    "Internal ID",
                    value=field_id,
                    disabled=True,
                    key=f"field_readonly_id_{index}_{field_id}",
                )
                st.text_input(
                    "Type",
                    value=CUSTOM_TYPE_LABELS.get(field_type, field_type),
                    disabled=True,
                    key=f"field_readonly_type_{index}_{field_id}",
                )
                edit_label = st.text_input(
                    "Display Name *",
                    value=str(field.get("label", "")),
                    key=f"field_label_{index}_{field_id}",
                )
                if field_type == "select":
                    edit_options_text = st.text_area(
                        "Dropdown Options (one per line)",
                        value="\n".join(str(option) for option in field.get("options", [])),
                        key=f"field_options_{index}_{field_id}",
                    )
                else:
                    edit_options_text = ""
                edit_order = st.number_input(
                    "Sort Order",
                    value=_safe_int(field.get("order")),
                    step=10,
                    key=f"field_order_{index}_{field_id}",
                )
                edit_show = st.checkbox(
                    "Show in Dashboard Table",
                    value=bool(field.get("show_in_table", False)),
                    key=f"field_show_{index}_{field_id}",
                )
                edit_active = st.checkbox(
                    "Active",
                    value=bool(field.get("active", True)),
                    key=f"field_active_{index}_{field_id}",
                )
                submitted = st.form_submit_button("Save Field")

            if submitted:
                options = _parse_option_lines(edit_options_text) if field_type == "select" else []
                errors: list[str] = []
                if not edit_label.strip():
                    errors.append("Field display name is required.")
                if field_type == "select" and not options:
                    errors.append("A Dropdown field requires at least one option.")
                if errors:
                    for error in errors:
                        st.error(error)
                else:
                    updated_field = dict(field)
                    updated_field.update(
                        {
                            "label": edit_label.strip(),
                            "options": options,
                            "order": int(edit_order),
                            "show_in_table": bool(edit_show),
                            "active": bool(edit_active),
                        }
                    )
                    updated_settings = dict(settings)
                    updated_settings["custom_fields"] = _replace_record(
                        fields, field_id, updated_field
                    )
                    _save_settings_or_error(updated_settings, "Custom field settings updated.")


def _read_browser_timezone() -> str | None:
    # Tiny inline bridge using Streamlit's existing runtime: no frontend build,
    # dependency, remote script, polling, or access beyond the browser's zone.
    component = st.components.v2.component(
        "calendar_browser_timezone",
        js="""export default function(component) {
            const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (zone && zone !== component.data) component.setStateValue('zone', zone);
        }""",
    )
    return component(
        key="calendar_browser_timezone", data=st.session_state.get("calendar_display_timezone"),
        on_zone_change=lambda: None,
    ).zone


def _get_reminder_timezone(settings: dict[str, Any]) -> str | None:
    """Use a confirmed local IANA zone or reliable OS detection, never an offset."""
    zone = settings.get("local_timezone") or detect_local_timezone()
    if not isinstance(zone, str) or not zone:
        return None
    try:
        ZoneInfo(zone)
    except (ValueError, KeyError):
        return None
    return zone


def _render_timezone_settings(settings: dict[str, Any]) -> None:
    st.subheader("Local time zone")
    detected = detect_local_timezone()
    st.caption(f"Detected on this computer: {detected or 'Unavailable — please confirm below.'}")
    st.caption(
        "Calendar uses your browser's local time. Confirm the IANA time zone used by "
        "this computer and browser. New reminders use it by default; existing reminders keep their own zone."
    )
    with st.form("local_timezone_form", enter_to_submit=False):
        zone = st.text_input(
            "Local IANA time zone", value=settings.get("local_timezone") or detected or "",
            placeholder="Area/City", key="local_timezone_input",
        ).strip()
        confirmed = st.checkbox("I confirm this matches my computer and browser's local time zone")
        submitted = st.form_submit_button("Save Time Zone")
    if submitted:
        try:
            ZoneInfo(zone)
            if not confirmed:
                raise ValueError("Confirm the local time zone before saving.")
        except (ValueError, KeyError) as exc:
            st.error(f"Please enter and confirm a valid IANA time zone: {exc}")
        else:
            _save_settings_or_error({**settings, "local_timezone": zone}, "Local time zone saved.")


def _open_calendar_job(job_id: str, reminder_id: str | None = None) -> None:
    _navigate("job_detail", job_id)
    st.session_state[f"job_tabs_{job_id}"] = "Reminders" if reminder_id else "Details"


def _calendar_reposition(day: date, view: str | None = None) -> None:
    """Remount only for deliberate navigation; always restore the saved view/date."""
    st.session_state["calendar_anchor"] = day
    if view is not None:
        st.session_state["calendar_view"] = view
    st.session_state["calendar_revision"] = st.session_state.get("calendar_revision", 0) + 1
    st.session_state.pop("calendar_last_callback", None)


def _view_reminder_in_calendar(
    job_id: str, reminder: dict[str, Any], settings: dict[str, Any]
) -> None:
    zone = st.session_state.get("calendar_display_timezone") or _get_reminder_timezone(settings)
    if not zone:
        st.error("Confirm your local time zone in Settings before opening Calendar.")
        return
    day = parse_aware_datetime(reminder["start_at"]).astimezone(ZoneInfo(zone)).date()
    _calendar_reposition(day, "Month")
    st.session_state["calendar_selected_day"] = day
    st.session_state["calendar_selected_event"] = f"reminder:{job_id}:{reminder['id']}"
    st.session_state["calendar_show_reminders"] = True
    if reminder["status"] != "scheduled":
        st.session_state["calendar_show_inactive"] = True
    _navigate("calendar")
    st.rerun()


def _calendar_step(direction: int, zone: str) -> None:
    anchor = st.session_state["calendar_anchor"]
    if direction == 0:
        target = datetime.now(ZoneInfo(zone)).date()
    elif st.session_state["calendar_view"] == "Week":
        target = anchor + timedelta(days=7 * direction)
    else:
        month = anchor.year * 12 + anchor.month - 1 + direction
        target = date(month // 12, month % 12 + 1, 1)
    _calendar_reposition(target)


def _calendar_change_view() -> None:
    _calendar_reposition(st.session_state["calendar_anchor"], st.session_state["calendar_view_picker"])


def _calendar_filter_changed(state_key: str) -> None:
    st.session_state[state_key] = st.session_state[f"{state_key}_widget"]


def _calendar_select_event(event_id: str) -> None:
    # Reset retained component click values after selection outside the calendar.
    # Date/view survive this intentional remount, so clicking the same event
    # again is observable rather than indistinguishable from an old callback.
    _calendar_reposition(st.session_state["calendar_anchor"])
    st.session_state["calendar_selected_event"] = event_id


def _calendar_handle_callback(payload: Any, events: list[dict[str, Any]], zone: str) -> None:
    """Callbacks only change selection, and never navigate, mutate jobs, or save events."""
    if not isinstance(payload, dict) or payload.get("callback") not in ("dateClick", "eventClick"):
        return
    fingerprint = json.dumps(payload, sort_keys=True)
    if st.session_state.get("calendar_last_callback") == fingerprint:
        return
    st.session_state["calendar_last_callback"] = fingerprint
    try:
        if payload["callback"] == "dateClick":
            # 1.4.0 returns Date.toISOString(), even for an all-day cell.
            day = parse_aware_datetime(payload["dateClick"]["date"]).astimezone(ZoneInfo(zone)).date()
            st.session_state["calendar_selected_day"] = day
            st.session_state.pop("calendar_selected_event", None)
        else:
            event_id = payload["eventClick"]["event"]["id"]
            event = next((item for item in events if item["id"] == event_id), None)
            if event is not None:
                st.session_state["calendar_selected_event"] = event_id
                st.session_state["calendar_selected_day"] = event_local_date(event, zone)
    except (KeyError, TypeError, ValueError):
        st.warning("The calendar selection could not be read. Please select the date or event again.")


def _calendar_event_details(
    event: dict[str, Any], jobs_by_id: dict[str, dict[str, Any]],
    reminders: dict[str, list[dict[str, Any]]], settings: dict[str, Any], zone: str,
) -> None:
    props = event["extendedProps"]
    job_id = props["job_id"]
    job = jobs_by_id.get(job_id)
    if job is None:
        return
    st.subheader("Selected event")
    st.text(f"{job['company']} — {job['job_title']}")
    labels = _status_label_map(_status_records(settings))
    status = labels.get(job["status_id"], job["status_id"])
    st.caption(f"Job status: {status}" + (" | Archived" if job.get("archived") else ""))
    reminder_id = props.get("reminder_id")
    if reminder_id:
        reminder = next((r for r in reminders.get(job_id, []) if r["id"] == reminder_id), None)
        if reminder is None:
            return
        st.text(event["title"])
        start = parse_aware_datetime(reminder["start_at"])
        st.text(f"Local: {start.astimezone(ZoneInfo(zone)).isoformat(sep=' ', timespec='minutes')} ({zone})")
        st.text(f"Original appointment: {reminder['start_at']} ({reminder['timezone']})")
        if reminder.get("end_at"):
            end = parse_aware_datetime(reminder["end_at"])
            st.text(f"End (local): {end.astimezone(ZoneInfo(zone)).isoformat(sep=' ', timespec='minutes')}")
            st.caption(f"Original end: {reminder['end_at']} ({reminder['timezone']})")
        elif reminder["kind"] == "deadline":
            st.caption("Deadline: this time is the cutoff point.")
        st.text(f"Reminder status: {reminder['status']}")
        if reminder.get("location_or_url"):
            st.text(f"Location / meeting URL: {reminder['location_or_url']}")
        if reminder.get("notes"):
            st.text(reminder["notes"])
    else:
        st.text(f"Applied · All day · {event['start']}")
    st.button(
        "Open Job", key="calendar_detail_open", on_click=_open_calendar_job,
        args=(job_id, reminder_id),
    )
    if reminder_id:
        st.caption("Open Job opens this job's Reminders tab, where you can edit the reminder.")


def _render_calendar(jobs: list[dict[str, Any]], settings: dict[str, Any]) -> None:
    st.title("Calendar")
    st.caption("Local calendar and in-app to-do hints. No notifications are sent when the app is closed.")
    local_zone = _get_reminder_timezone(settings)
    browser_zone = _read_browser_timezone()
    zone = browser_zone or st.session_state.get("calendar_display_timezone") or local_zone
    try:
        if zone:
            ZoneInfo(zone)
    except (ValueError, KeyError, TypeError):
        zone = local_zone
        browser_zone = None
    if not zone:
        st.warning("The local IANA time zone could not be determined. Confirm it in Settings to use Calendar.")
        st.button("Open Settings", on_click=_navigate, args=("settings",), key="calendar_timezone_settings")
        return
    previous_zone = st.session_state.get("calendar_display_timezone")
    st.session_state["calendar_display_timezone"] = zone
    if previous_zone and previous_zone != zone:
        # A browser timezone change invalidates dateClick's retained UTC payload.
        _calendar_reposition(st.session_state.get("calendar_anchor", datetime.now(ZoneInfo(zone)).date()))
    if browser_zone and local_zone and browser_zone != local_zone:
        st.info(f"Your browser displays {browser_zone}. Reminder forms default to {local_zone}; each reminder keeps its confirmed time zone.")
    st.caption(f"Display: browser local time ({zone}). Applied dates are all-day dates and never shifted.")
    now = datetime.now(ZoneInfo(zone))
    st.session_state.setdefault("calendar_anchor", now.date())
    st.session_state.setdefault("calendar_view", "Month")
    st.session_state.setdefault("calendar_selected_day", now.date())
    st.session_state.setdefault("calendar_revision", 0)
    filters = st.columns(3)
    for col, key, label, default in (
        (filters[0], "calendar_show_applications", "Show applications", True),
        (filters[1], "calendar_show_reminders", "Show reminders", True),
        (filters[2], "calendar_show_inactive", "Show completed/cancelled reminders", False),
    ):
        st.session_state.setdefault(key, default)
        st.session_state[f"{key}_widget"] = st.session_state[key]
        col.checkbox(label, key=f"{key}_widget", on_change=_calendar_filter_changed, args=(key,))
    reminders: dict[str, list[dict[str, Any]]] = {}
    jobs_by_id = {str(job["id"]): job for job in jobs}
    # Read every existing job, independently of Dashboard filters and without caching.
    for job_id, job in jobs_by_id.items():
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            try:
                reminders[job_id] = list_reminders(job_id)
            except Exception as exc:
                st.warning(f"Reminders unavailable for {job['company']} — {job['job_title']} ({job_id}): {exc}")
        for record in caught:
            st.warning(f"Storage warning: {record.message}")
    events, issues = build_calendar_events(
        jobs, reminders,
        show_applications=st.session_state["calendar_show_applications"],
        show_reminders=st.session_state["calendar_show_reminders"],
        show_inactive=st.session_state["calendar_show_inactive"],
    )
    for issue in issues:
        st.warning(issue)
    if previous_zone != zone:
        focused = next((event for event in events if event["id"] == st.session_state.get("calendar_selected_event")), None)
        if focused:
            focused_day = event_local_date(focused, zone)
            st.session_state["calendar_selected_day"] = focused_day
            _calendar_reposition(focused_day)
    st.caption("Applied · Interview · Assessment · Deadline · Follow-up · Other")
    previous, today, following, view_col, refresh = st.columns([1, 1, 1, 2, 1])
    previous.button("Previous", on_click=_calendar_step, args=(-1, zone), width="stretch")
    today.button("Today", on_click=_calendar_step, args=(0, zone), key="calendar_today", width="stretch")
    following.button("Next", on_click=_calendar_step, args=(1, zone), width="stretch")
    st.session_state["calendar_view_picker"] = st.session_state["calendar_view"]
    view_col.selectbox("View", ["Month", "Week", "List"], key="calendar_view_picker", on_change=_calendar_change_view, label_visibility="collapsed")
    refresh.button("Refresh", key="calendar_refresh", width="stretch")
    if not events:
        st.info("No events to display with these filters. You can still browse dates and change the view.")
    options = {
        "initialView": {"Month": "dayGridMonth", "Week": "timeGridWeek", "List": "listMonth"}[st.session_state["calendar_view"]],
        "initialDate": st.session_state["calendar_anchor"].isoformat(),
        # 1.4.0 has no datesSet callback. Navigation above owns the persistent state.
        "headerToolbar": {"left": "", "center": "title", "right": ""},
        "timeZone": "local", "firstDay": 1, "height": 650,
        "editable": False, "eventStartEditable": False, "eventDurationEditable": False,
        "selectable": False, "navLinks": False, "dayMaxEvents": 3,
        "moreLinkClick": "popover", "displayEventEnd": False,
        "eventTimeFormat": {"hour": "2-digit", "minute": "2-digit", "hour12": False},
    }
    payload = render_calendar(
        events=events, options=options, callbacks=["dateClick", "eventClick"],
        key=f"local_calendar_{st.session_state['calendar_revision']}",
    )
    _calendar_handle_callback(payload, events, zone)
    day = st.session_state["calendar_selected_day"]
    st.subheader(f"Events on {day.isoformat()}")
    daily = events_for_day(events, day, zone)
    if not daily:
        st.caption("No events on this date with the current filters.")
    for event in daily:
        row, detail = st.columns([6, 1])
        time_label = "All day" if event.get("allDay") else parse_aware_datetime(event["start"]).astimezone(ZoneInfo(zone)).strftime("%Y-%m-%d %H:%M")
        row.text(f"{time_label} · {event['title']}")
        detail.button("Details", key=f"calendar_day_{event['id']}", on_click=_calendar_select_event, args=(event["id"],))
    selected = next((event for event in events if event["id"] == st.session_state.get("calendar_selected_event")), None)
    if selected:
        _calendar_event_details(selected, jobs_by_id, reminders, settings, zone)
    st.divider()
    st.subheader("Reminder summary")
    st.caption("Scheduled only. Today includes the whole local day; Upcoming covers the next seven calendar days. Past time means start < now and may also appear in Today.")
    summary = reminder_summary(jobs, reminders, zone, now=now)
    st.caption(f"Updated: {now.isoformat(sep=' ', timespec='seconds')} · Refresh to recalculate.")
    for key, label in (("today", "Today"), ("upcoming", "Upcoming 7 days"), ("past", "Past time, not completed")):
        rows = summary[key]
        with st.expander(f"{label} ({len(rows)})", expanded=True):
            if not rows:
                st.caption("No scheduled reminders.")
            for item in rows:
                job = jobs_by_id[item["job_id"]]
                text_col, open_col = st.columns([6, 1])
                local_start = item["start_at"].astimezone(ZoneInfo(zone))
                text_col.text(f"{local_start:%Y-%m-%d %H:%M} · {item['reminder']['title']} · {job['company']} — {job['job_title']}")
                open_col.button("Open Job", key=f"summary_{key}_{item['job_id']}_{item['reminder_id']}", on_click=_open_calendar_job, args=(item["job_id"], item["reminder_id"]))


def _render_settings(
    jobs: list[dict[str, Any]], settings: dict[str, Any],
    service: local_service.LocalService,
) -> None:
    st.title("Settings")
    status_tab, custom_field_tab, timezone_tab, api_tab = st.tabs([
        "Status Management", "Custom Field Management", "Time Zone", "Local API",
    ])
    with status_tab:
        _render_status_settings(jobs, settings)
    with custom_field_tab:
        _render_custom_field_settings(settings)
    with timezone_tab:
        _render_timezone_settings(settings)
    with api_tab:
        st.subheader("Local tracker API")
        if service.running:
            st.success(f"Running at {service.url}")
        else:
            st.error(f"Local API unavailable: {service.error or 'The API thread stopped.'}")
        st.caption("Tracker URL")
        st.code(service.url, language=None)
        st.caption("Copy this token into the extension's Tracker settings.")
        st.code(service.token, language=None)


def main() -> None:
    try:
        service = local_service.start_local_service()
        jobs, settings = _load_application_data()
    except Exception as exc:
        st.error("Local data could not be loaded safely. All editing features have been disabled.")
        st.error(str(exc))
        st.info("Check the JSON files in data/ and backups/, then refresh the page.")
        st.stop()

    if not service.running:
        st.warning(f"Local API unavailable: {service.error or 'The API thread stopped.'}")

    if st.session_state.get("page") == "import_jobs":
        _keep_import_dashboard_filters()
    _render_sidebar()
    _show_flash()
    page = str(st.session_state.setdefault("page", "dashboard"))
    if page == "settings":
        _render_settings(jobs, settings, service)
    elif page == "calendar":
        _render_calendar(jobs, settings)
    elif page == "companies":
        _render_companies()
    elif page == "prompts":
        _render_prompts()
    elif page == "new_job":
        _render_new_job(settings)
    elif page == "import_jobs":
        _render_import_jobs(settings)
    elif page == "job_detail":
        _render_job_detail(jobs, settings)
    else:
        st.session_state["page"] = "dashboard"
        _render_dashboard(jobs, settings)


if __name__ == "__main__":
    main()
