# Local tracker API (M1)

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
M2's client must run in background, popup, or options. A content script must
send a runtime message to background for tracker operations.

## Contract

| Method | Path | Request / response |
| --- | --- | --- |
| GET | `/api/statuses` | Returns the configured status records (`id`, `label`, etc.). |
| GET | `/api/jobs` | Returns jobs; optional `?url=` matches normalized URLs. |
| POST | `/api/jobs` | JSON `company`, `job_title`, `job_url`; optional `location`, `email`, `status_id`, `applied_date`, `autofill_stats`. Returns the created/updated job with `source="extension"`. New jobs default to `planning`; omitted update fields are preserved. |
| PATCH | `/api/jobs/{id}` | JSON containing any of `status_id`, `applied_date`, `autofill_stats`; returns the updated job. |
| POST | `/api/jobs/{id}/resumes` | Multipart `file`, optional `label`; returns PDF version metadata with `source="extension"`. |
| GET / PUT | `/api/jobs/{id}/notes` | Returns / accepts `{ "notes": "Markdown text" }`, using the dashboard's `notes.md`. |
| POST | `/api/import` | `{ "jobs": [legacy extension records] }`; returns the imported/existing jobs. |

Use server status **IDs**, such as `planning`, `applied`, and `interviewing`.
Dates use `YYYY-MM-DD`. Autofill statistics are
`{ "filled": 9, "detected": 10, "recorded_at": "2026-11-05T17:00:00Z" }`.
Recording autofill statistics does not change status. Submission confirmation
will be wired to a user action in M2.

URL identity ignores fragments, default ports, trailing slashes, and known
tracking query parameters; meaningful job identifiers remain. Repeated imports
skip existing normalized URLs, preserving subsequent dashboard edits and notes.
Legacy records use `company`, `jobTitle` (or `role`), `jobUrl`, `status`, and
optional `location`, `appliedAt`, `notes`, `filledFieldCount`, `formFieldCount`.
`notes` accepts text or the Console's note array; array entries retain their
date, title, and Markdown content in the single dashboard notes file.
Saved → planning, Applied → applied, Interview → interviewing, Offer → offer,
Rejected → rejected, Withdrawn → archived. Other existing extension preparation
states map to planning.

Missing/wrong token returns 401, missing job returns 404, and invalid request or
storage values return 422. No LLM calls run on the server.

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
one process lock around complete storage operations. Existing jobs gain missing
field defaults when read, while the on-disk schema version remains 1.

## M1 validation — 2026-11-05

- Python 3.14.3 / Streamlit 1.62.0: **317 passed**, plus 294 subtests.
  This includes 40 API cases, 13 tracker storage cases, and 5 service/UI cases
  added to the existing 259 tests. Starlette emits one TestClient/httpx
  deprecation warning.
- Extension: **28 passed**. Ruff, ESLint, JavaScript syntax, dependency checks,
  extension packaging and ZIP integrity passed.
- Started the dashboard from an isolated copy of `server/` with one Streamlit
  command, then opened it in a real browser. Settings showed the running API and
  token. `lsof` showed dashboard port 18501 and API port 8765 owned by the same
  PID, both listening only on `127.0.0.1`.
- Live curl statuses were health **200**, jobs without token **401**, jobs with
  token **200**. Two POSTs of a normalized URL produced one job. Notes persisted,
  and an uploaded PDF version had `source="extension"`. Returning to the
  dashboard showed Pending = 1 and Showing 1 jobs.
- The isolated service was stopped after validation. The repository's runtime
  data directories were not created by tests; no demo screenshots were captured.
- A second live check kept an HTTP client open while stopping and immediately
  restarting the API on the same temporary port. Both health checks returned
  200; the listener uses `SO_REUSEADDR` for normal restarts.
- Regression cases cover PDF upload after job deletion (no recreated folder),
  real Console note arrays, and rejection of malformed imported notes before
  any writes.
