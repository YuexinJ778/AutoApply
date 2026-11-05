# Demo recording

The README GIF shows the actual extension Console with fictional profile and application data, recorded model responses, and the production A4 HTML renderer.

The clip focuses on the resume assistant, preview updates, and application tracking. It is a UI replay, not evidence of live provider quality/latency or a complete portal capture/autofill run. The full job-portal workflow remains a separate recording task.

## Recording inputs

- Name: Demo Applicant; contact details use `example.com` and a fictional `555-01xx` phone number.
- Employer and school: Example Labs and Example University.
- Prompt facts: a Python workflow project, validated JSON inputs, isolated tests, and recovery from failed writes.
- The recorded plan uses four allowed operations: one `addEntry` and three `addLine` calls. The unchanged local validator/executor applies the plan.

## Runtime adapters

An isolated localhost preview loads the Console's production JavaScript and styles. A temporary browser-storage adapter supplies the fictional fixtures. Network requests to the demo provider endpoint return a recorded plan and self-check result; no provider key or external provider request is used.

The recording browser does not display inline PDF blobs, so its preview adapter displays the HTML produced by `ResumeA4Template.renderA4Html`. Production extension code and PDF-export behavior are unchanged. The visible recording banner identifies the replay, fictional data, recorded response, and HTML preview.

The GIF's playback duration is presentation timing, not a measured application or model response time. No actual application history or account settings were recorded.
