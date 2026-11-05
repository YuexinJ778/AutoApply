"""HTTP adapters for the local tracker; storage owns validation and persistence."""

from __future__ import annotations

from secrets import compare_digest
from typing import Any

from fastapi import APIRouter, Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import storage
from tracker_actions import execute_actions


API_VERSION = "0.1.0"


class JobInput(BaseModel):
    company: str
    job_title: str
    job_url: str
    location: str = ""
    email: str = ""
    applied_date: str = ""
    autofill_stats: dict[str, Any] | None = None


class JobUpdates(BaseModel):
    status_id: str = ""
    applied_date: str = ""
    autofill_stats: dict[str, Any] | None = None


class NotesInput(BaseModel):
    notes: str


class ImportInput(BaseModel):
    jobs: list[dict[str, Any]]


class ActionsInput(BaseModel):
    functionCalls: list[dict[str, Any]]
    timezone: str = ""


def _public(value: Any) -> Any:
    """Keep saved website credentials out of every structured API response."""

    if isinstance(value, dict):
        return {
            key: _public(item)
            for key, item in value.items()
            if key not in {"account", "password"}
        }
    if isinstance(value, list):
        return [_public(item) for item in value]
    return value


def create_app(token: str | None = None) -> FastAPI:
    """Create the API with a persistent token, or an explicit token for tests."""

    expected_token = storage.get_api_token() if token is None else token
    app = FastAPI(title="AutoApply local tracker", version=API_VERSION)

    def authenticate(authorization: str | None = Header(default=None)) -> None:
        if not authorization or not compare_digest(
            authorization.encode("utf-8"), f"Bearer {expected_token}".encode("utf-8")
        ):
            raise HTTPException(
                status_code=401,
                detail="Tracker token required.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    @app.exception_handler(ValueError)
    def invalid_data(_request, error):
        return JSONResponse(status_code=422, content={"detail": str(error)})

    @app.exception_handler(KeyError)
    def missing_job(_request, error):
        return JSONResponse(status_code=404, content={"detail": str(error.args[0])})

    @app.get("/api/health")
    def health():
        return {"ok": True, "version": API_VERSION}

    router = APIRouter(prefix="/api", dependencies=[Depends(authenticate)])

    @router.get("/statuses")
    def statuses():
        return _public(storage.load_settings()["statuses"])

    @router.get("/summary")
    def summary():
        with storage._STORAGE_LOCK:
            return storage.calculate_summary_counts(storage.load_jobs(), storage.load_settings())

    @router.get("/jobs")
    def jobs(url: str | None = None):
        return _public(storage.find_jobs_by_url(url))

    @router.post("/jobs")
    def get_or_create_job(values: JobInput):
        payload = values.model_dump(exclude_unset=True)
        payload["source"] = "extension"
        return _public(storage.get_or_create_job_by_url(payload))

    @router.patch("/jobs/{job_id}")
    def update_job(job_id: str, values: JobUpdates):
        return _public(storage.update_job(job_id, values.model_dump(exclude_unset=True)))

    @router.post("/jobs/{job_id}/resumes")
    def upload_resume(
        job_id: str,
        file: UploadFile = File(),
        label: str = Form(default=""),
    ):
        return _public(storage.add_uploaded_pdf_version(
            job_id,
            file.file,
            label or file.filename or "Resume",
            file.filename or "resume.pdf",
            source="extension",
        ))

    @router.get("/jobs/{job_id}/notes")
    def get_notes(job_id: str):
        return {"notes": storage.get_job_notes(job_id)}

    @router.put("/jobs/{job_id}/notes")
    def put_notes(job_id: str, values: NotesInput):
        storage.save_job_notes(job_id, values.notes)
        return {"notes": values.notes}

    @router.post("/import")
    def import_jobs(values: ImportInput):
        return _public(storage.import_extension_jobs(values.jobs))

    @router.post("/actions")
    def actions(values: ActionsInput):
        return _public(execute_actions(values.functionCalls, values.timezone))

    app.include_router(router)
    return app
