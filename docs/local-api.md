# Local tracker API

From the repository root, install and start the dashboard:

```sh
python -m pip install -r server/requirements.txt
python -m streamlit run server/app.py --server.address 127.0.0.1 --browser.gatherUsageStats false
```

Open the dashboard in your browser. Its first session starts FastAPI in a cached
uvicorn thread in the same Python process, listening on `127.0.0.1:8765`.
**Settings → Local API** shows its current status, URL, and a copyable token.
The token is generated once and persisted in `server/data/settings.json`.

All data routes require `Authorization: Bearer <token>`. Only
`GET /api/health` is public and returns `{ "ok": true, "version": "0.1.0" }`.
API responses omit saved `account` and `password` fields. The API has no CORS or
Host middleware and adds no upload size limit; storage performs PDF validation.
The extension client runs in background, popup, or options. A content script
sends a runtime message to background for tracker operations. See
[extension setup](tracker-extension.md).

## Contract

| Method | Path | Request / response |
| --- | --- | --- |
| GET | `/api/statuses` | Returns the configured status records (`id`, `label`, etc.). |
| GET | `/api/summary` | Returns `offer`, `rejected` and `pending` counts from the dashboard’s `calculate_summary_counts`, excluding archived jobs and respecting configured status groups. |
| GET | `/api/jobs` | Returns jobs; optional `?url=` matches normalized URLs. |
| POST | `/api/jobs` | JSON `company`, `job_title`, `job_url`; optional `location`, `email`, `applied_date`, `autofill_stats`. Finds the normalized URL and returns the existing job unchanged, or creates a new job with `source="extension"` and `status_id="planning"`. A supplied `status_id` is ignored. All updates use PATCH. |
| PATCH | `/api/jobs/{id}` | JSON containing any of `status_id`, `applied_date`, `autofill_stats`; returns the updated job. |
| POST | `/api/jobs/{id}/resumes` | Multipart `file`, optional `label`; returns PDF version metadata with `source="extension"`. |
| GET / PUT | `/api/jobs/{id}/notes` | Returns / accepts `{ "notes": "Markdown text" }`, using the dashboard's `notes.md`. |
| POST | `/api/actions` | `{ "functionCalls": [{ "name": "setJobStatus", "args": { "company": "Example Labs", "status": "interviewing" } }], "timezone": "America/Indianapolis" }`; executes a validated tracker batch. See below. |
| POST | `/api/import` | `{ "jobs": [legacy extension records] }`; returns the imported/existing jobs. |

PATCH uses configured status **IDs**, such as `planning`, `applied`, and `interviewing`; agent `setJobStatus` also accepts a configured label.
Dates use `YYYY-MM-DD`. Autofill statistics are
`{ "filled": 9, "detected": 10, "recorded_at": "2026-11-05T17:00:00Z" }`.
Recording autofill statistics does not change status. The popup records
submission only when the user clicks **I have submitted**.

URL identity ignores fragments, default ports, trailing slashes, and known
tracking query parameters; meaningful job identifiers remain. Repeated imports
skip existing normalized URLs, preserving subsequent dashboard edits and notes.
Autofill statistics are recorded only for imports with `formFieldCount > 0`;
missing or zero counts leave `autofill_stats` null. URL identity is calculated
from `job_url` on each lookup.
Legacy records use `company`, `jobTitle` (or `role`), `jobUrl`, `status`, and
optional `location`, `appliedAt`, `notes`, `filledFieldCount`, `formFieldCount`.
`notes` accepts text or the Console's note array; array entries retain their
date, title, and Markdown content in the single dashboard notes file.
Saved → planning, Applied → applied, Interview → interviewing, Offer → offer,
Rejected → rejected, Withdrawn → archived. Other existing extension preparation
states map to planning.

Missing/wrong token returns 401, missing job returns 404, and invalid request or
storage values return 422. Storage errors retain their original message in
`detail`; import validation errors identify the one-based record number, for
example `Record 3: job_url must be an HTTP URL.` The whole batch is validated
before writing. Request shape errors use FastAPI's standard validation response.
No LLM calls run on the server.

## Tracker action batches

`POST /api/actions` accepts at most ten calls from the five [tracker operations](tools.md#tracker-tools-5). The server matches unarchived jobs by company and optional job title, ignoring surrounding whitespace and case. It resolves all targets and validates all values under the existing storage lock before executing writes.

Success returns `{ "ok": true, "results": [...] }`. Each result contains `name` and the resulting public `job`; reminder operations also contain `reminder`. A missing target returns HTTP 200 with `{ "ok": false, "code": "NOT_FOUND", "error": "..." }`. Multiple matches return `AMBIGUOUS`, with job candidates when relevant. These resolution failures do not execute any operation. Unknown operations, invalid arguments, dates, status values or reminders return the existing 422 `detail` error.

`setJobStatus` accepts a configured status ID or label; the server uses its current status list. `addJobNote` appends Markdown without replacing existing notes. `completeReminder` prefers a uniquely matching scheduled reminder, or accepts a uniquely matching completed reminder as an unchanged result. Cancelled reminders are excluded. Duplicate eligible titles require the user to choose by date in the dashboard.

For `addReminder`, `datetime` is an ISO local date/time, for example `2026-11-12T10:00:00`. The request's `timezone` is the browser's IANA zone. The server uses the existing calendar functions to resolve a local time and reject DST gaps or unconfirmed repeated times. If an offset is supplied, it must match that zone on the requested date. The stored reminder uses the existing `start_at`, `timezone` and validation rules.

Operations execute sequentially through existing storage functions. Completed file writes are not rolled back if a later disk write fails; a transport or storage failure is reported as an error, without claiming that no writes occurred. No LLM runs on the server.

## Calling the API

Copy the Settings token into a shell variable named `TRACKER_TOKEN`:

```sh
curl http://127.0.0.1:8765/api/health
curl -H "Authorization: Bearer $TRACKER_TOKEN" http://127.0.0.1:8765/api/jobs
```

The dashboard and API use the same storage. LaTeX compilation runs `pdflatex` outside the storage lock against a snapshot of the submitted source; file preparation and result publication use short locked sections. Missing extension metadata fields receive defaults when older jobs are read, without changing the on-disk schema version.
