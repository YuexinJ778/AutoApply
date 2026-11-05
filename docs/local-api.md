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
[extension setup and validation](tracker-extension.md).

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
| POST | `/api/import` | `{ "jobs": [legacy extension records] }`; returns the imported/existing jobs. |

Use server status **IDs**, such as `planning`, `applied`, and `interviewing`.
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

## Verify

Copy the Settings token into a shell variable named `TRACKER_TOKEN`, then run:

```sh
curl -i http://127.0.0.1:8765/api/health
curl -i http://127.0.0.1:8765/api/jobs
curl -i -H "Authorization: Bearer $TRACKER_TOKEN" http://127.0.0.1:8765/api/jobs
```

Expected statuses: 200, 401, 200. Run the regression suite with:

```sh
python -m pip install -r tests/requirements.txt
python -m pytest -q
node --test tests/extension/*.test.js
```

The tests use temporary storage. UI tests stub the service launcher; API tests
exercise real storage through FastAPI TestClient. The API and dashboard share
one process lock around storage reads and writes. LaTeX compilation executes
`pdflatex` outside that lock against a snapshot of the submitted source; its
file preparation and result publication use short locked sections. Existing jobs gain missing
field defaults when read, while the on-disk schema version remains 1.

## M1.1 validation — 2026-11-05

- Python 3.14.3 / Streamlit 1.62.0: **331 passed**, plus 294 subtests.
  Starlette emits one TestClient/httpx deprecation warning.
- Regression coverage includes POST preserving all existing fields and file
  bytes, readable storage errors, import sample counts, indexed import errors
  without writes, and jobs reads/writes while a fake pdflatex process is blocked.
- Local service tests cover one cached daemon thread, live running status,
  the original bind error, and Settings URL/token display. The service ends
  with its owning process; it has no shutdown/restart interface.
- Extension: **28 passed**. Ruff, ESLint, JavaScript syntax, dependency checks,
  extension packaging and ZIP integrity passed.
- A real browser session started the simplified service and Settings showed it
  running. Live curl checks returned 200 / 401 / 200; repeated POST preserved
  the stored bytes, zero-field imports had null statistics, and an invalid
  third record returned its original reason with no batch writes. Both listeners
  belonged to one process. The isolated process and test data were removed.
