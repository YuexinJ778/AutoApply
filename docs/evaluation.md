# Evaluation

AutoApply currently has verified implementation counts, not a retained portal-performance benchmark.

## Available evidence

As of 2026-11-05:

- The [resume allowlist](../extension/options/resumeFunctions.js) contains 14 editing operations. [docs/tools.md](tools.md) lists the same 14 names, grouped 3/4/3/4.
- `python -m pytest --collect-only -q` collects 259 Python tests. The last local run on macOS, Python 3.14.3, Streamlit 1.62.0 passed all 259 tests and 294 subtests. Subtests are not counted as additional test methods.
- [CI](../.github/workflows/ci.yml) runs the Python suite, extension JavaScript syntax checks, and ZIP packaging. These checks do not measure the accuracy of browser autofill or model-generated resume content.
- The [demo](demo.md) uses fictional data and recorded model responses. Its playback time is not a latency measurement.

## Unverified performance claims

| Claim | Platforms | Applications / timing pairs | Measurement date | Status |
| --- | --- | --- | --- | --- |
| 90% of fields autofilled | Not recorded | Not recorded | Not recorded | Unverified; do not use as a measured result. |
| 60× faster, or 5 minutes → 5 seconds | Not recorded | Not recorded | Not recorded | Unverified; no retained manual/tool baseline. |

No numbers in the missing sample columns should be inferred from the Python test count or from a single UI demo.

## Protocol for a future benchmark

1. Freeze the extension commit, browser version, provider/model, date, and fictional profile. List each tested portal and form revision.
2. Record visible, editable, applicable fields before filling. Count excluded fields separately: CAPTCHA, login/MFA, consent or protected questions requiring review, unsupported widgets, and unavailable profile values.
3. Mark each eligible field correct only when its final value matches the expected fixture. Report `correct eligible fields / all eligible fields`, with raw counts per portal and overall; also report exclusions, manual corrections, failed runs, and upload results.
4. Use the same posting, profile, and expected answers for a manual run and an assisted run. Start before data entry; stop when all fields and attachments have been reviewed and are ready to submit. Leave final submission out of both runs.
5. Repeat paired runs and retain every duration, including failures. Report sample size, median and range for each path, and the ratio `manual median / assisted median`. Separate model/network time from local filling time when instrumented.
6. Publish the fixtures, run sheet, raw field outcomes and timing pairs with the commit and date. Only then replace the unverified rows in the README.

A benchmark must include the complete assisted path, including generation, navigation, retries, and review. A five-second local fill measurement alone cannot support a sixty-fold end-to-end speedup claim.
