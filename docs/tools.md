# Agent tools

AutoApply exposes **19 operations**: **14 resume tools** in the Chrome extension and **5 tracker tools** executed by the local server. The model returns a JSON `functionCalls` plan; the extension validates and executes it. Provider-native tools APIs are not used.

The executable [resume allowlist and validator](../extension/options/resumeFunctions.js) define the resume names; the [tracker registry](../extension/options/trackerFunctions.js) defines tracker names and signatures. The [planner](../extension/lib/api.js) supplies the corresponding manual to the model.

## Resume tools (14)

### Categories

| Category | Count | Examples |
| --- | ---: | --- |
| Contact | 3 | `setContactField`, `addContactLink` |
| Sections | 4 | `addSection`, `moveSection` |
| Entries | 3 | `addEntry`, `deleteEntry` |
| Lines | 4 | `addLine`, `setLine` |
| **Total** | **14** | |

### Operations

Arguments marked `?` are optional. Target IDs come from the current resume summary.

| Category | Operation | Arguments | Effect |
| --- | --- | --- | --- |
| Contact | `setContactField` | `field`, `value` | Set `firstName`, `lastName`, `email`, `phone`, or `location`. |
| Contact | `addContactLink` | `text` | Add a plain-text contact link without an `http://` or `https://` prefix. |
| Contact | `deleteContactLink` | `linkId` | Remove an existing contact link. |
| Sections | `addSection` | `name` | Append a named section and return its new ID. |
| Sections | `setSection` | `sectionId`, `name` | Rename an existing section. |
| Sections | `deleteSection` | `sectionId` | Remove a section and its contents. |
| Sections | `moveSection` | `sectionId`, `direction` | Move a section `up` or `down`. |
| Entries | `addEntry` | `sectionId` | Append an empty entry and return its new ID. |
| Entries | `deleteEntry` | `sectionId`, `entryId` | Remove an entry and its lines. |
| Entries | `moveEntry` | `sectionId`, `entryId`, `direction` | Move an entry `up` or `down` within its section. |
| Lines | `addLine` | `sectionId`, `entryId`, `type`, `text`, `bold?`, `italic?` | Append a line to an entry. |
| Lines | `setLine` | `sectionId`, `entryId`, `lineId`, `type?`, `text?`, `bold?`, `italic?` | Change selected properties of a line. |
| Lines | `deleteLine` | `sectionId`, `entryId`, `lineId` | Remove a line. |
| Lines | `moveLine` | `sectionId`, `entryId`, `lineId`, `direction` | Move a line `up` or `down` within its entry. |

Line types are `title`, `date`, `subtitle`, `bullet`, and `paragraph`. Title lines are always bold; subtitle lines are always italic. Moving an item past its first or last position leaves the order unchanged.

A creation chain can use `$lastSection` after `addSection` and `$lastEntry` after `addEntry`, for example:

```json
{
  "assistantMessage": "Add the project information you supplied.",
  "functionCalls": [
    { "name": "addSection", "args": { "name": "Projects" } },
    { "name": "addEntry", "args": { "sectionId": "$lastSection" } },
    {
      "name": "addLine",
      "args": {
        "sectionId": "$lastSection",
        "entryId": "$lastEntry",
        "type": "title",
        "text": "Example Project"
      }
    }
  ]
}
```

### Resume execution and limits

A normal chat request produces one batch of **at most 10 operations**. The [planner](../extension/lib/api.js) checks the JSON shape and requests one smaller plan if the initial response exceeds that limit. An oversized or malformed correction fails without executing edits.

The [Console handler](../extension/options/options.js) sends the proposed batch for a model self-check, then calls the local executor. A failed, malformed, or rejected self-check stops execution. The local [batch validator](../extension/options/resumeFunctions.js) independently checks the allowlist, argument objects, field/type/direction values, target IDs, and forbidden full-resume/profile/application payload keys before applying operations.

Each operation builds a cloned resume. The executor returns the original input state if validation or a later operation fails; the Console persists and renders the result only after the batch succeeds. This boundary applies to a batch, not to every batch previously completed during a longer import.

### Configuration and failure handling

The [provider request boundary](../extension/lib/api.js) validates the prompt and resolved provider configuration before sending a request. **Settings → Test Connection** is a separate user-triggered check; it is not an extra network preflight automatically run before every edit.

For a missing section, entry, line, or link, the Console makes one [recovery attempt](../extension/options/options.js) using the current resume and candidate targets. Recovery can revise calls, create a missing target, ask the user, or abort. A proposed recovery batch goes through another model self-check and the same local executor; a failed recovery asks for clarification instead of recursively retrying.

PDF/text import uses a separate bounded workflow: up to **120 import rounds**, **3 attempts per AI stage**, and **3 rejected proposals per step**. Its [limits](../extension/options/options.js) and [import loop](../extension/options/options.js) stop unproductive work. Cancelling import keeps batches already imported; it does not roll back the entire session.

## Tracker tools (5)

The [tracker registry](../extension/options/trackerFunctions.js) defines these names, their argument validation and the function manual used in the model prompt. Tracker requests use a separate batch from resume edits. The model plans one batch, a model self-check reviews it, and the extension validates it before one API request. There is no model-driven lookup/retry loop.

| Category | Operation | Arguments | Effect |
| --- | --- | --- | --- |
| Tracker | `setJobStatus` | `company`, `jobTitle?`, `status` | Set a configured status by ID or label. |
| Tracker | `setAppliedDate` | `company`, `jobTitle?`, `date` | Set the application date using `YYYY-MM-DD`. |
| Tracker | `addJobNote` | `company`, `jobTitle?`, `text` | Append text to the application's Markdown notes. |
| Tracker | `addReminder` | `company`, `jobTitle?`, `kind`, `datetime`, `title` | Create a scheduled reminder in the existing calendar store. |
| Tracker | `completeReminder` | `company`, `jobTitle?`, `title` | Complete a matching reminder. |

For example, in the Tracker assistant:

> Set Example Labs to Interviewing and add an interview reminder on 2026-11-12 at 10:00 titled Technical interview.

The company and optional job title match existing, unarchived applications on the server, ignoring case and surrounding whitespace. The server resolves every target before executing the batch. `AMBIGUOUS` asks the user to identify the job or reminder; `NOT_FOUND` reports the missing target. The assistant cannot create an application or choose an arbitrary match through these tools. If multiple records share both company and job title, use the dashboard to select the exact application.

Reminder kinds are `interview`, `assessment`, `deadline`, `follow_up` and `other`. A local ISO date/time is interpreted in the browser's IANA time zone sent with the batch. An explicit offset must agree with that time zone. The existing calendar functions reject nonexistent or unconfirmed repeated wall times; the assistant asks for clarification rather than guessing a time zone or UTC offset.

Only the user's request authorizes changes. Saved notes and application context are input data, not instructions. Read-only questions produce no function calls. Start Apply and autofill continue to leave submission status unchanged; tracker updates happen only through an explicit submission confirmation or an explicit user request to the assistant.

Provider calls, page capture, autofill and rendering are supporting workflows, not extra operations in either registry.
