# Evaluation

AutoApply's implementation evidence is linked below; browser measurements can be collected alongside the demo recording.

## Implementation evidence

As of 2026-11-05:

- **14 resume operations:** the [executable allowlist](../extension/options/resumeFunctions.js) matches the [tools table](tools.md): 3 contact, 4 section, 3 entry, and 4 line operations.
- **259 Python tests:** `python -m pytest --collect-only -q` collects the [job-tracker suite](../tests/job-tracker/). The passing run also reports 294 subtests separately.
- **CI:** the [workflow](../.github/workflows/ci.yml) runs the Python suite, extension JavaScript syntax checks, and ZIP packaging. [View runs](https://github.com/YuexinJ778/AutoApply/actions/workflows/ci.yml).

## Browser measurement plan

Use the same fictional profile for recording and measurement.

### Autofill

1. Choose **3 portals × 2 job postings**, for 6 application forms.
2. For each form, count fields with an applicable value in the fictional profile, then count how many AutoApply filled correctly before manual correction.
3. Record `correctly filled fields / applicable fields` for each form and in total. Record skipped fields, corrections, and failed runs alongside those counts.

### Timing

1. Choose one of those forms and complete **3 paired manual and assisted runs**, resetting the form between runs and using the same profile and answers.
2. Start before data entry; stop when the fields and resume attachment have been reviewed and are ready to submit. Include resume generation, navigation, and retries in the assisted run.
3. Keep all 3 manual durations and all 3 assisted durations in seconds, including failed attempts and their outcomes.

Publish the raw field counts and durations with the date, portal/posting URLs, Chrome version, provider/model, extension commit, and fictional profile. Add measured results to the README after collecting this small dataset.
