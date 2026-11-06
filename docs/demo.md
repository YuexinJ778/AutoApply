# Workflow demo

The demo follows one fictional application through the extension and the shared local tracker. The media uses fictional profile and application data.

## Five steps

| Step | Screenshot | Captured view |
| --- | --- | --- |
| 1. Capture | [Job posting and popup](assets/01-job.png) | The fictional job page with the extension popup open and **Start Apply** visible. |
| 2. Tailor | [Console resume preview](assets/02-resume.png) | The Console's A4 preview of the tailored resume. |
| 3. Autofill | [Filled form](assets/03-autofill.png) | Fields after a real Chrome autofill run, including any unresolved controls. |
| 4. Track | [Dashboard](assets/04-dashboard.png) | The same job row in the shared Python tracker. |
| 5. Act | [Tracker assistant](assets/05-tracker-assistant.png) | A request to change status and add an interview reminder, with the assistant's execution results visible in the Console. |

[Step GIF](assets/demo.gif) uses these five screenshots in order. It is assembled from browser captures; generated artwork is not substituted for the interface. The individual screenshots retain the real controls and visible field values.

## Demo setup

| Capture detail | Value |
| --- | --- |
| Date | 2026-11-05 |
| Browser | Chrome 156.0.8078.80 |
| Job fixture | `http://127.0.0.1:18888/job` |
| Form fixture | `http://127.0.0.1:18888/apply` |
| Provider | Deterministic local MiniMax-compatible fixture at `http://127.0.0.1:18888/anthropic` |
| Model label | `deterministic-local-fixture` |
| Visible form result | Text controls filled and the generated PDF selected |
| Application/site scope | A fictional application on a local fixture site |

Start Apply uses a copy of the current saved Profile resume with the configured provider. This capture uses fixed responses from the local MiniMax-compatible fixture, with no paid provider request. It demonstrates browser/API/storage integration and PDF generation rather than live-model tailoring quality or a real-portal benchmark. The job, form and provider URLs belong to the temporary local demo fixture, not public job portals.

The form run checks that visible filling and PDF selection are recorded for the same tracker application. Per-application `autofill_stats` supports later coverage measurement; this fictional form is not a real-portal benchmark. See [Evaluation](evaluation.md).

Final application submission is performed by the user on the portal. The popup's **I have submitted** control records that explicit confirmation; autofill and tracker agent requests must not imply that a form was submitted automatically.
