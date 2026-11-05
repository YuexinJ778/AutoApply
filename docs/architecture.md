# Architecture

AutoApply contains a Chrome extension and a separate local Streamlit job manager. They do not share storage or synchronize through a Python API.

## Chrome extension

The browser loads the JavaScript listed in the [manifest](../extension/manifest.json) and each page's HTML; there is no compilation step.

| Entry point | Responsibility |
| --- | --- |
| [Popup](../extension/popup/popup.html) and [controller](../extension/popup/popup.js) | Start job capture, resume preparation, and application autofill from the active tab. |
| [Console](../extension/options/options.html) and [controller](../extension/options/options.js) | Edit profiles and resumes, configure providers, and manage applications and notes. |
| [Background service worker](../extension/background/background.js) | Route extension messages, request page content, parse job details, and inject extraction scripts when needed. |
| [Page content script](../extension/content/content.js) | Read page content and handle commands sent to the job tab. |
| [Application pipeline](../extension/content/applyPipeline.js) | Scan fields, map profile values, attach resume files, and check readiness without submitting the application. |
| [Keyword autofill](../extension/content/keywordAutofill.js) | Match saved field knowledge, request review for unresolved fields, and persist confirmed mappings. |

The popup requests page data through the background worker and content script. [Provider requests](../extension/lib/api.js) combine the relevant job, resume, and user instructions, then return results to the popup or Console. [Resume operations](../extension/options/resumeFunctions.js) validate and apply the assistant's editing instructions. Rendering modules under [`extension/lib/render/`](../extension/lib/render/) turn resume content into previews and downloadable files.

Scripts communicate through extension messages and shared `Stage*` globals. Script order in the manifest and HTML pages is part of the runtime contract.

## Storage and provider requests

The extension's [`storage/`](../extension/storage/) modules use `chrome.storage.local` for profiles, provider settings and API keys, resume versions, application records, notes, and autofill knowledge. Configured provider requests go directly from the extension to that provider; a locally configured Ollama endpoint is also supported.

AI actions can send job and resume content, conversation or notes context, and user instructions. PDF import can send the selected PDF to a provider that supports it. API keys authenticate requests. The [application pipeline](../extension/content/applyPipeline.js) prefers the saved profile and uses the bundled [mock profile](../extension/data/mockCandidateProfile.json) as its fallback when a usable local profile is unavailable.

## HSBC and SuccessFactors form handling

Site-specific handling lives in the loaded [application pipeline](../extension/content/applyPipeline.js). The HSBC rules cover repeated email/password fields, legal and preferred names, calling codes, and conditional questions about relatives or prior employment.

Detection combines page hostname, title, and field labels. SuccessFactors detection also inspects known form and upload containers, such as `form#careerform`, `#fieldsContainer`, and `#rcmQuickApplyAttachmentCtr`, plus the company identifier when present.

Field mapping follows this order:

1. Skip unsupported input types and route protected categories to the review fallback.
2. When HSBC handling is detected, match known SuccessFactors field IDs, then normalized HSBC label aliases.
3. Skip conditional detail fields when the controlling answer is negative. A missing profile value remains unresolved.
4. Use generic profile-key matching for fields with no HSBC match.

The same pipeline performs filling and validation after matching. It records HSBC-specific reasons with the result, so callers can distinguish a site rule from a generic match. Final application submission remains a user action.

## Local job manager

The [Streamlit app](../server/job_manage/app.py) manages a separate set of jobs, companies, resume files, attachments, notes, and reminders. [Storage](../server/job_manage/storage.py) writes beneath the job manager's own directory, independent of the shell's current directory:

- `data/` stores JSON and CSV records and settings.
- `applications/` stores per-job resume files, attachments, notes, and reminders.
- `backups/` stores recovery copies.

These runtime directories are excluded from Git. The app does not make LLM requests. The [local configuration](../server/job_manage/.streamlit/config.toml) binds Streamlit to loopback and disables usage telemetry; the root README's launch command supplies the same options when starting outside this directory. Calendar and reminder behavior is implemented in [calendar utilities](../server/job_manage/calendar_utils.py).
