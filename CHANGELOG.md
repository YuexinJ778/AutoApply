# Changelog

## 1.0.0 — 2026-11-05

- Combine the Chrome extension and local Python tracker into one application workflow with a single application store.
- Start Streamlit and the loopback FastAPI service with one launch command; authenticate data endpoints with a local token and omit saved application accounts/passwords from API responses.
- Preserve saved editable Profile sections and tailor application copies from the current resume without changing the original.
- Capture jobs from **Start Apply**, save tailored PDFs into each application's version library, record distinct-field autofill coverage and record submission only after user confirmation.
- Open the shared dashboard from **Applications**; use server notes and dashboard counts throughout the Console. Import older extension records without rewriting their browser data; archive Withdrawn records.
- Provide 19 validated agent operations: 14 resume tools and 5 tracker tools for status, applied date, appended notes and reminders. Resolve tracker targets on the server and ask for clarification when they are ambiguous or missing.
- Keep provider credentials, Profile, main resumes and autofill knowledge in the extension. Tracker conversations remain in the current tab until explicitly saved to shared notes.
- Include 367 Python tests and 133 extension tests (500 total), plus lint, syntax and packaging checks in CI.
