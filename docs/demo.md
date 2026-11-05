# Workflow demo

The demo follows one fictional application through the extension and the shared local tracker. The media uses fictional profile and application data.

## Five steps

| Step | Screenshot | Captured view |
| --- | --- | --- |
| 1. Capture | [Job posting](assets/01-job.png) | The visible role and company before **Start Apply**. |
| 2. Tailor | [Resume](assets/02-resume.png) | The tailored resume or A4 PDF preview for that application. |
| 3. Autofill | [Filled form](assets/03-autofill.png) | Fields after a real Chrome autofill run, including any unresolved controls. |
| 4. Track | [Dashboard](assets/04-dashboard.png) | The same job row in the shared Python tracker. |
| 5. Remind | [Calendar](assets/05-calendar.png) | A reminder attached to the same job. |

[Step GIF](assets/demo.gif) uses these five screenshots in order. It is assembled from browser captures; generated artwork is not substituted for the interface. The individual screenshots retain the real controls and visible field values.

## Capture record

| Capture detail | Value |
| --- | --- |
| Date | 2026-11-05 |
| Browser | Chrome 156.0.8078.80 |
| Job fixture | `http://127.0.0.1:18888/job` |
| Form fixture | `http://127.0.0.1:18888/apply` |
| Provider | Deterministic local MiniMax-compatible fixture at `http://127.0.0.1:18888/anthropic` |
| Model label | `deterministic-local-fixture` |
| Source | `merge-tracker` working tree based on `06fdd5c`; [capture fingerprints](assets/capture-record.json) |
| Visible form result | Four text controls filled and a new PDF selected; popup reports `Filled=5/5` |
| Application/site scope | 1 fictional application on 1 local fictional site |
| Persisted autofill coverage | 5 filled / 5 detected (100%) |
| Sample timestamp | `2026-11-05T22:44:27.088Z` |

Start Apply uses a copy of the current saved Profile resume with the configured provider. This capture uses fixed responses from the local MiniMax-compatible fixture, with no paid provider request. It demonstrates browser/API/storage integration and PDF generation rather than live-model tailoring quality or a real-portal benchmark. The job, form and provider URLs belong to the temporary local demo fixture, not public job portals.

The persisted `autofill_stats` matched the visible filled form and popup count: four text controls and one PDF upload control, **5/5** in total. This is coverage, not an assessment of semantic correctness. See [Evaluation](evaluation.md).

Final application submission is performed by the user on the portal. The popup's **I have submitted** control records that explicit confirmation; autofill and tracker agent requests must not imply that a form was submitted automatically.
