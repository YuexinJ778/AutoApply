# AutoApply extension

The extension runs directly from JavaScript, HTML, and CSS. No build or package installation is required.

## Load locally

1. Open `chrome://extensions/` and enable **Developer mode**.
2. Click **Load unpacked** and select this repository's `extension/` directory.
3. Open AutoApply from the toolbar, then click **Console** to configure your profile and provider.

**Start Apply** tailors a copy of the current saved Profile resume using your configured MiniMax, OpenAI, DeepSeek or Ollama provider. Console supports English/Chinese resume editing and preview; Start Apply PDFs currently support ASCII text only. Use Console PDF export for Chinese. See the [project README](../README.md) for the shared local tracker setup and full application workflow.

## Reload changes

1. Save the JavaScript, HTML, CSS, or manifest changes.
2. Click **Reload** on AutoApply's card at `chrome://extensions/`.
3. Reopen the popup or Console and refresh any job page that already had a content script loaded.

Inspect the popup or Console with their DevTools. Inspect the background service worker from the extension's card, and inspect page scripts from the job page's DevTools.

## Source layout

- `popup/` opens the job workflow; `options/` contains the Console and resume assistant.
- `background/` handles extension messages and page extraction requests.
- `content/` extracts page content and fills application forms.
- `lib/` contains provider requests, normalization, tailoring, and resume rendering.
- `storage/` persists Profile, settings, main resumes and autofill knowledge. Old application records remain read only for explicit legacy import; current applications and notes are stored by the local Python tracker.

The [manifest](manifest.json) and page HTML files define script loading order. Modules expose shared `Stage*` globals; these names are runtime interfaces, so keep their producers and consumers consistent when changing them. The [architecture guide](../docs/architecture.md) describes the data flow and site-specific form handling.
