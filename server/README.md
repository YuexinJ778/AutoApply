# Local tracker

The tracker is AutoApply's application store: a Streamlit dashboard and a FastAPI service running in one Python process on your computer. It saves JSON, Markdown and ordinary files under `server/`; there is no database or cloud account.

## Run

From the repository root:

```bash
python -m pip install -r server/requirements.txt
python -m streamlit run server/app.py --server.address 127.0.0.1 --browser.gatherUsageStats false
```

The first run creates `server/data/`, `server/applications/` and `server/backups/`, wherever you start it from. [`.streamlit/config.toml`](.streamlit/config.toml) keeps the dashboard on `127.0.0.1` and turns off usage statistics.

LaTeX compilation needs `pdflatex` (on macOS, install MacTeX or BasicTeX). Everything else works without it; only **Compile** is disabled.

## Local API

The first browser tab that opens the dashboard starts the API on `127.0.0.1:8765`. **Settings → Local API** shows whether it is running, its URL and a token to copy into the extension. Every endpoint except `/api/health` requires `Authorization: Bearer <token>`, and responses never include saved account or password fields.

The API and the dashboard call the same [`storage.py`](storage.py) under one lock, so the extension and the dashboard always see the same data. See the [API contract](../docs/local-api.md) and the [extension setup](../docs/tracker-extension.md).

## Pages

- **Dashboard:** Offers, Rejected and Pending counts; search and filters; add, edit, archive and delete jobs (including multi-select delete with confirmation); export the filtered table as CSV or JSON.
- **Job page:** tabs for Details, Resume, Markdown Notes, Files and Reminders.
  - *Resume:* one `resume.tex` per job, compiled only when you click **Compile**. A PDF library keeps uploaded, compiled and extension-generated versions.
  - *Files:* attachments up to 50 MB each, with local previews for PDF, images, text, Markdown, CSV and JSON.
  - *Reminders:* interview, assessment, deadline, follow-up and other, each with its own IANA time zone.
- **Calendar:** month, week and list views of applied dates and reminders, plus a summary of today, the next 7 days and overdue items. Reminders show only inside the app; nothing is sent when it is closed.
- **Companies:** a separate company list with custom text, date, select and checkbox columns.
- **Prompts:** saved prompt texts you can reuse.
- **Import JSON:** copy a template built from your current statuses and fields, fill it, then paste or upload it to add many jobs at once. If any job is invalid, nothing is added. Import only adds jobs; it does not update or deduplicate.
- **Settings:** custom statuses, custom job fields, time zone and the Local API.

Each custom status maps to one of the three dashboard groups (`offer`, `rejected`, `pending`), so adding statuses such as "Second interview" does not add more cards. Renaming a status keeps its ID.

## Data layout

```text
server/
├── data/            jobs.json, settings.json, companies.csv, prompts.csv
├── applications/
│   └── <job UUID>/  resume.tex, notes.md, reminders.json,
│                    build/ (preview and compile log), pdfs/, attachments/
└── backups/         previous versions of the data files
```

Folders are named by generated UUIDs, never by company or job title. Writes are atomic: each file is replaced in one step, and the previous version is kept as a `.bak`. If a JSON file is damaged, the tracker reads the backup and shows a warning instead of resetting your data.

To restore a backup by hand: stop Streamlit, keep a copy of the damaged file, check that the `.bak` file is valid JSON, copy it over the original (for example `backups/jobs.json.bak` → `data/jobs.json`), then restart. Each `.bak` holds only the previous version, not a full history.

## Security

- Saved website passwords are stored **as plain text** in `data/jobs.json`. Use the tracker only on a computer you trust, preferably with disk encryption.
- Never commit or share `data/` or `applications/`; they hold your passwords, resumes and notes. `.gitignore` excludes them, but check before each commit.
- Do not put real passwords in JSON that you paste into another tool for Import JSON. Leave those fields empty and fill them in the app.
- LaTeX runs locally with shell escape disabled and a time limit, but this is not a full sandbox. Compile only `.tex` files you trust, and do not deploy the tracker publicly.

## Tests

From the repository root (tests use temporary data, never your files):

```bash
python -m pip install -r tests/requirements.txt
python -m pytest -q
```

## Limitations

- Single user on one computer.
- One `resume.tex` per job, with no BibTeX, `latexmk` or automatic TeX package installation.
- No notifications outside the app, recurring events or calendar import/export.
- Whether a PDF displays inline depends on the browser; downloading always works.
