# Resume tools

The resume assistant can execute **14 local editing operations** in the Chrome extension. The model returns a JSON `functionCalls` plan; the extension validates and executes it. Provider-native tools APIs are not used.

The executable [allowlist and validator](../extension/options/resumeFunctions.js) define the accepted names. The [prompt-side function manual](../extension/lib/api.js) supplies the model with their signatures.

## Categories

| Category | Count | Examples |
| --- | ---: | --- |
| Contact | 3 | `setContactField`, `addContactLink` |
| Sections | 4 | `addSection`, `moveSection` |
| Entries | 3 | `addEntry`, `deleteEntry` |
| Lines | 4 | `addLine`, `setLine` |
| **Total** | **14** | |

## Operations

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

## Execution and limits

A normal chat request produces one batch of **at most 10 operations**. The [planner](../extension/lib/api.js) checks the JSON shape and requests one smaller plan if the initial response exceeds that limit. An oversized or malformed correction fails without executing edits.

The [Console handler](../extension/options/options.js) sends the proposed batch for a model self-check, then calls the local executor. A failed, malformed, or rejected self-check stops execution. The local [batch validator](../extension/options/resumeFunctions.js) independently checks the allowlist, argument objects, field/type/direction values, target IDs, and forbidden full-resume/profile/application payload keys before applying operations.

Each operation builds a cloned resume. The executor returns the original input state if validation or a later operation fails; the Console persists and renders the result only after the batch succeeds. This boundary applies to a batch, not to every batch previously completed during a longer import.

## Configuration and failure handling

The [provider request boundary](../extension/lib/api.js) validates the prompt and resolved provider configuration before sending a request. **Settings → Test Connection** is a separate user-triggered check; it is not an extra network preflight automatically run before every edit.

For a missing section, entry, line, or link, the Console makes one [recovery attempt](../extension/options/options.js) using the current resume and candidate targets. Recovery can revise calls, create a missing target, ask the user, or abort. A proposed recovery batch goes through another model self-check and the same local executor; a failed recovery asks for clarification instead of recursively retrying.

PDF/text import uses a separate bounded workflow: up to **120 import rounds**, **3 attempts per AI stage**, and **3 rejected proposals per step**. Its [limits](../extension/options/options.js) and [import loop](../extension/options/options.js) stop unproductive work. Cancelling import keeps batches already imported; it does not roll back the entire session.

The 14-operation count describes resume editing only. Provider requests, job capture, notes assistance, form autofill, PDF rendering, and the standalone job tracker are not additional entries in this allowlist.
