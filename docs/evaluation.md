# Evaluation

AutoApply reports implemented operations, automated tests and measured form coverage separately. A screenshot or fixed model response demonstrates a workflow; it does not establish LLM quality or performance across job portals.

## Implementation evidence

The automated suites contain **500 tests**. The **294 Python subtests** are reported separately.

- **19 tools:** 14 [resume operations](../extension/options/resumeFunctions.js) and 5 [tracker operations](../extension/options/trackerFunctions.js), matching the [tool reference](tools.md).
- **367 Python tests**, with 294 subtests reported separately: storage, API, tracker actions, calendar, imports, exports and Streamlit UI behavior. [Server tests](../tests/server/).
- **133 extension tests:** both registries, planner and self-check handling, API client, background/content routing, popup workflows, legacy import, Profile storage, shared notes, dashboard counts and distinct-field counting. [Extension tests](../tests/extension/).
- [CI](../.github/workflows/ci.yml) runs both test suites, Ruff correctness checks, ESLint recommended rules, JavaScript syntax checks and extension packaging. [CI runs](https://github.com/YuexinJ778/AutoApply/actions/workflows/ci.yml).

## Autofill coverage

Coverage is **filled fields / detected fields**:

```text
samples = applications whose latest autofill_stats has detected > 0
coverage = sum(sample.filled) / sum(sample.detected)
```

Use the ratio of totals, not the average of per-form percentages. Runs without detected fields are excluded from both the sample count and ratio. `autofill_stats` stores the latest sample for each application; it is not a history of every fill attempt.

A detected field is a distinct control in the form scan. The base and keyword passes count the same control once; separate controls with the same name or ID remain distinct. Filled counts include only successful results associated with scanned controls. This measure does not determine whether a filled answer is semantically correct, an attachment is accepted, or a submission succeeds. Review remains part of the workflow.

A measurement report should include the raw `filled`, `detected`, `recorded_at` and job URL for every sample, the sample count, distinct sites, date, Chrome version and extension revision. Local demonstration fixtures must be identified separately from real portal forms. The [demo guide](demo.md) describes the media and its configuration.

## Measured local fixture

| Measure | Recorded value |
| --- | --- |
| Date | 2026-11-05 |
| Browser | Chrome 156.0.8078.80 |
| Job / form | `http://127.0.0.1:18888/job` / `http://127.0.0.1:18888/apply` |
| Provider / model | Local MiniMax-compatible fixed responses / `deterministic-local-fixture` |
| Source | Working tree based on `06fdd5c`; [capture fingerprints](assets/capture-record.json) |
| Samples with `detected > 0` | 1 fictional application |
| Sites | 1 local fictional site; 0 real portals |
| Filled / detected | 5 / 5 |
| Aggregate coverage | 100% (`5 / 5`) |
| Persisted sample timestamp | `2026-11-05T22:44:27.088Z` |

The persisted `autofill_stats` sample is:

```json
{
  "filled": 5,
  "detected": 5,
  "recorded_at": "2026-11-05T22:44:27.088Z"
}
```

This run used Chrome, a fictional local form and a deterministic local provider fixture; no paid provider request was made. Four text controls were filled and a new PDF was selected in the file control. The native popup and persisted sample both reported 5/5. It demonstrates field filling and coverage recording through the extension and local API; it is not evidence of general portal coverage, semantic answer correctness or model quality. The sample counts once, not once per screenshot or workflow step.

## Broader portal measurements

For a portal benchmark, use the same fictional profile across at least three portals and two forms per portal. Preserve failed and partial runs, the detected and filled counts, unresolved controls and any manual corrections. Report correctness separately if it is reviewed; it must not be called coverage.

For timing, record three paired manual and assisted runs on the same reset form. Start before entry and stop after reviewing fields and the resume attachment. Include generation, navigation and retries in assisted durations, and publish all raw durations with failure outcomes.

No real-portal benchmark or paired timing result is claimed here. No speedup factor is claimed without those measurements.
