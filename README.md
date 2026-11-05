# AutoApply

AI-assisted resume tailoring and application autofill, with a local Python job tracker, 14 resume tools, and 259 tests.

## Repository layout

```text
extension/    Chrome extension (Manifest V3, JavaScript)
job-tracker/  Standalone local Python job tracker
tests/        Job-tracker test suite
docs/         Architecture
scripts/      Extension packaging
```

See [architecture](docs/architecture.md) for runtime boundaries and site-specific form matching.

## Features

- Read job details from the page you are viewing.
- Generate a tailored resume from your profile and the job description.
- Edit resumes manually or with an AI assistant, with English and Chinese support and a live A4 preview.
- Autofill application fields and attach a generated resume on supported forms.
- Save jobs, track application stages, and keep notes for each application.

The resume assistant asks the model for a JSON `functionCalls` plan, validates it against [14 allowed local editing operations](extension/options/resumeFunctions.js), and executes the allowed calls in the extension, with a limit of 10 calls per batch. This is a JSON planning protocol; provider-native tools APIs are not used. The separate [local job tracker](job-tracker/) adds a dashboard, company tracking, interview reminders and calendar, resume PDF versions, attachments, and recovery from local backups.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions/` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select the `extension` folder.

No build step is required.

## Local job tracker

The Python job tracker runs as a separate Streamlit app. It does not provide an LLM API to the extension, and the two applications do not synchronize their data.

With Python 3.12 or newer, run these commands from the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r job-tracker/requirements.txt
python -m streamlit run job-tracker/app.py --server.address 127.0.0.1 --browser.gatherUsageStats false
```

The app creates its own data under `job-tracker/`, regardless of the shell's current directory. It needs no API key. LaTeX compilation additionally requires `pdflatex`; other features work without it. See the [job tracker guide](job-tracker/README.md) for details.

To collect or run its tests:

```bash
python -m pip install pytest
python -m pytest tests --collect-only -q
python -m pytest tests -q
```

The job-tracker suite contains 259 tests. All passed on Python 3.14.3 with Streamlit 1.62.0; Streamlit 1.66.1 currently fails UI state tests, so the requirements pin the tested version.

## Use

1. Open the extension and click **Console**.
2. Add your profile and base resume under **Profile**.
3. In **Settings**, select **minimax**, enter your API key, then click **Save Settings** and **Test Connection**.
4. Open a job posting and click **Start Apply** to generate a tailored resume.
5. Click the job page's Apply button. Once the form opens, reopen the extension to autofill it.
6. Review the resume and form before submitting. Manage saved jobs and application status under **Applications**.

## Privacy & Security

The extension stores profiles, resumes, provider settings, API keys, application records, and notes in `chrome.storage.local`. AI actions send the relevant job content, resume content, instructions, and conversation or notes context to the selected provider. PDF import can send the selected PDF to a provider that supports it. Provider API keys are used for request authentication. Ollama requests go to the configured Ollama endpoint, which defaults to localhost.

The job tracker stores JSON, CSV, notes, resume files, and attachments in local `data/`, `applications/`, and `backups/` directories under `job-tracker/`. These user data directories are excluded from Git. The job tracker does not call an LLM provider. Local storage is not encrypted by this project; account and password fields in the job tracker are saved as plain text.

The [extension manifest](extension/manifest.json) retains the following permissions for existing features:

| Permission | Purpose |
| --- | --- |
| `storage` | Save profiles, settings, resume versions, and application state locally. |
| `tabs` | Read and follow application-tab URL/state and reuse the Console tab. |
| `activeTab` | Access the current page after the user invokes the extension. |
| `scripting` | Inject the extraction and autofill scripts when a page has no active content script. |
| `downloads` | Save generated resume PDFs and exported files. |
| `debugger` | Use Chrome DevTools Protocol for application-button clicks and A4 PDF generation with `Page.printToPDF`. |
| `<all_urls>` (host access) | Support job portals on different domains and requests to configurable provider endpoints, including local Ollama. |

Content scripts also match `<all_urls>` so the extension can extract and fill forms across job portals. The bundled synthetic profile is available to matching pages. Site-specific grants and on-demand content-script injection remain future permission-reduction work.

Autofill support varies by website. Review the generated resume and filled fields; final application submission is handled by the user.

## Contributors & License

Contributions are listed by implemented modules.

| Contributor | Contributions |
| --- | --- |
| [yushliu](https://github.com/yushliu) | Primary implementation of the Chrome extension workflow and resume assistant, including [validated resume operations](extension/options/resumeFunctions.js), [AI planning and recovery](extension/lib/api.js), and [resume version tracking](extension/storage/resumeRegistryStore.js); implemented the [local Python job tracker](job-tracker/app.py), [storage](job-tracker/storage.py), [calendar](job-tracker/calendar_utils.py), and [test suite](tests/job-tracker/). |
| [YuexinJ778](https://github.com/YuexinJ778) | Implemented [resume import, application notes, and custom AI instructions](extension/options/options.js); contributed extension fixes and maintains the public repository. |

Licensed under the [MIT License](LICENSE).
