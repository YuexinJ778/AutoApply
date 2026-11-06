# Evaluation

AutoApply reports implemented operations, automated tests and workflow integration separately. A screenshot or fixed model response demonstrates a workflow; it does not establish LLM quality or performance across job portals.

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

## Integration workflow validation

The Chrome walkthrough uses a fictional local job and form with deterministic local provider responses. It exercises job capture, application-specific PDF generation, form filling, the shared dashboard and Tracker assistant actions. The provider fixture makes no paid model requests; the workflow does not evaluate model quality.

The form run verified that text controls were filled, the generated PDF was selected and the resulting autofill statistics reached the same application in the tracker. Repeating Start Apply preserved that application's existing status and applied date. This is integration validation, not a coverage benchmark.

Coverage has not been measured on real recruiting websites. The [real-portal benchmark](https://github.com/YuexinJ778/AutoApply/issues/3) tracks that work. The [demo guide](demo.md) describes the fictional setup and the five visible workflow steps.

## Broader portal measurements

For a portal benchmark, use the same fictional profile across at least three portals and two forms per portal. Preserve failed and partial runs, the detected and filled counts, unresolved controls and any manual corrections. Report correctness separately if it is reviewed; it must not be called coverage.

For timing, record three paired manual and assisted runs on the same reset form. Start before entry and stop after reviewing fields and the resume attachment. Include generation, navigation and retries in assisted durations, and publish all raw durations with failure outcomes.

No real-portal benchmark or paired timing result is claimed here. No speedup factor is claimed without those measurements.
