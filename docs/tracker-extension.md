# Extension tracking

1. Install `server/requirements.txt` and start the tracker:
   `python -m streamlit run server/app.py --server.address 127.0.0.1 --browser.gatherUsageStats false`.
   Open the dashboard page; its first browser session starts the API.
2. Load the repository's `extension/` directory in Chrome. Moving an unpacked
   extension changes its ID, so an earlier checkout has separate saved settings.
3. In Console → Settings → Local Tracker, keep the default
   `http://127.0.0.1:8765`, copy the dashboard's Settings → Local API token,
   and click **Test tracker connection**. Tracker settings are saved separately
   from LLM provider settings.
4. Configure the existing resume provider and Profile. **Start Apply** and
   **Save Job** find or create the server application. Repeating either action
   leaves the server's existing status, company, title and dates unchanged.
5. Review the generated resume and filled form. Submit through the website
   yourself, then click **I have submitted** in the popup to record
   Applied and the local calendar date. Applications opens the tracker dashboard.

Generated tailored PDFs are uploaded into that application's PDF version
library with `source="extension"`. Autofill records the number of filled fields
and detected fields, without marking the application Applied. The original
posting URL is retained when navigating to an application form in the same tab
or a child tab opened from it. Unrelated tabs do not borrow a pending application.
Coverage counts distinct scanned controls; filling the same control in both
the base and keyword passes counts once.

The content script sends `TRACKER_AUTOFILL` to background. Only background,
popup and options load `trackerClient.js`; the server's CORS policy is unchanged.
All API requests use its token header and an eight-second timeout. Server error
details are shown directly. If the tracker is unavailable, capture, tailoring
and filling continue; the separate tracker notice includes the launch command
and a reminder to open the dashboard. There is no offline queue or later sync.

## Import existing applications

In Local Tracker settings, click **Import existing applications into Tracker**.
The request combines canonical application metadata and note arrays with legacy
autofill counts. Status mapping belongs to the server; Withdrawn is archived.
Repeated imports preserve existing tracker edits. Invalid batches show the
server's record number and reason and write nothing.

Application tracking and notes use the server as their only writable store.
Console dashboard counts come from the same summary function as the Streamlit
dashboard. Notes AI reads current server notes; saving a note writes through the
API. The Notes job picker selects the Markdown editor and save target; the AI
assistant reads saved notes across applications. Chat stays in the current tab
until **Save latest reply to selected job** writes it to that job's note.
Older extension application data stays read only for import, including
records saved before updating the extension. Profile and resume edits do not
rewrite those old records. Applications opens the tracker dashboard.

## M2 validation — 2026-11-05

- **331 Python tests** and **70 extension tests** pass. The 42 new extension
  cases cover the client/background, popup workflows with the real resume
  registry, import/navigation, content-to-background tracking, tab association
  and distinct-field coverage counting.
- In real Chrome, the OneDrive unpacked extension connected to an isolated
  Streamlit/API process. A local fictional job and deterministic MiniMax-format
  provider exercised capture and PDF generation without paid model requests or
  a real job submission.
- Start Apply created one planning application; the generated PDF appeared in
  its version index with source extension. Autofill on a different form URL
  wrote **filled=4, detected=5** to the original posting, keeping planning and
  an empty applied date. Only the explicit popup confirmation changed it to
  Applied with `2026-11-05`. The dashboard displayed that row and reopening the
  popup read Applied from the server.
- After the Chrome run, regression tests also verified tab association and
  selector-based counting, including distinct controls sharing a name or ID. These
  final corrections were checked in the Node suite.
- With the tracker process stopped, capture/tailoring still generated a resume
  and manual autofill completed four text fields. The tracker notice remained
  visible separately and explained how to start and open the dashboard.
- The fixture demonstrated coverage, not correctness: generic first/last-name
  controls received the full name and its file input remained empty. The server
  PDF version upload passed; portal autofill matching and attachment behavior
  still require user review. This is not a real-portal coverage benchmark or a
  measurement of LLM quality.

The test services are stopped after verification. A newly loaded test extension
retains its fictional Profile and local test provider settings; configure your
own provider and copy the active tracker's token before normal use. Demo
screenshots and release materials remain scheduled for M5.
