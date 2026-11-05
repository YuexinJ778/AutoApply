# AutoApply extension

The extension runs directly from JavaScript, HTML, and CSS. No build or package installation is required.

## Load locally

1. Open `chrome://extensions/` and enable **Developer mode**.
2. Click **Load unpacked** and select this repository's `extension/` directory.
3. Open AutoApply from the toolbar, then click **Console** to configure your profile and provider.

See the [project README](../README.md) for the application workflow and provider setup.

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
- `storage/` persists profiles, settings, resumes, and application records.

The [manifest](manifest.json) and page HTML files define script loading order. Modules expose shared `Stage*` globals; these names are runtime interfaces, so keep their producers and consumers consistent when changing them. The [architecture guide](../docs/architecture.md) describes the data flow and site-specific form handling.
