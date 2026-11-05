# AutoApply v1.0.0

AutoApply connects resume tailoring and application autofill to one local job tracker. Start a job from the Chrome popup, review the tailored PDF and filled form, and find the same application, PDF versions, notes and reminders in the dashboard.

## Included

- **One application store:** FastAPI and Streamlit share Python storage in one process. One command launches the local service; a token protects API data endpoints.
- **Capture, tailor and track:** Start Apply tailors a copy of the current saved Profile resume without changing the original, finds or creates an application, saves the tailored PDF to its version library and records autofill coverage. Submission remains a user action with explicit popup confirmation.
- **19 agent tools:** 14 local resume operations and 5 tracker operations. The Tracker assistant answers questions across saved notes or changes status, applied date, notes and reminders when explicitly requested.
- **Shared notes and calendar:** Applications opens the dashboard; Console notes and summary counts read the same server data. Agent reminders appear in the existing calendar.
- **Legacy import:** Import older extension applications and notes without keeping a second writable application database. Withdrawn records are archived.

## Start using it

Follow the [five-step quick start](../README.md#quick-start). Requirements are desktop Chrome 105+, Python 3.12+ and a configured MiniMax, OpenAI, DeepSeek or Ollama provider. Open the dashboard once to start its local API, then copy the token to Console settings.

Provider keys, Profile, main resumes and autofill knowledge remain in the extension. Relevant job, resume or notes context is sent to the configured model provider for AI requests; the Python tracker does not call a model. API responses omit application accounts and passwords. Local files are not encrypted by the project. See [Privacy & Security](../README.md#privacy--security).

## Evidence and scope

The two registries expose **19 tools**. The automated suites contain **367 Python tests** and **133 extension tests** (**500 total**); the [CI workflow](../.github/workflows/ci.yml) also checks lint, JavaScript syntax and packaging.

The [five-step demo](demo.md) uses fictional application data. Its capture record identifies the browser, fixture and provider configuration; fixed model responses demonstrate integration rather than NLP quality. [Evaluation](evaluation.md) defines coverage as `Σfilled / Σdetected`, using only samples with `detected > 0`. The measured fictional local form recorded **5 filled / 5 detected fields**, across **1 application and 1 local site** on **2026-11-05** in Chrome **156.0.8078.80**. This is fixture coverage, not a real-portal benchmark or correctness score. No unmeasured speedup is claimed.

Console supports English/Chinese resume editing and preview. Start Apply PDFs currently support ASCII text only; use Console PDF export for Chinese.

Autofill varies by portal. Review generated text, fields and attachments; handle login, MFA and CAPTCHA yourself. Tracking needs the running local service. There is no offline synchronization queue or notification delivery when the tracker is closed.

Roadmap: [reproducible portal coverage benchmark](https://github.com/YuexinJ778/AutoApply/issues/3) and [custom controls and embedded forms](https://github.com/YuexinJ778/AutoApply/issues/4).

See the [changelog](../CHANGELOG.md), [API contract](local-api.md) and [tracker guide](tracker-extension.md).
