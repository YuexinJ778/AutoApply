# Record the main workflow

Record one real Chrome run to produce the demo and verify Quick start.

1. Create a fresh Chrome profile, load `extension/` with **Load unpacked**, and follow the README Quick start. Enter a fictional Demo Applicant profile and your MiniMax key; save settings and run **Test Connection** before recording.
2. Close unrelated tabs and notifications. Use a fixed window size and 100% browser zoom. Record only: **public job posting → Start Apply → tailored resume → application form autofill → Console Applications**. Keep the API-key settings page out of the recording and stop before final submission.
3. Use QuickTime or macOS screen recording to capture 25–35 seconds of the actual workflow. Save the recording as a `.mov` file.
4. Convert it to `docs/assets/demo.gif` with ffmpeg:

```bash
mkdir -p docs/assets
ffmpeg -i demo.mov -vf "fps=12,scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" docs/assets/demo.gif
```

Keep the GIF under 10 MB. If necessary, reduce width to 960, then frame rate to 10. Once the recording is checked, embed it in the README Demo section with the caption **Fictional profile**.

Record the date, Chrome/extension version, platform and posting, and whether every Quick start step succeeded. If a step fails, retain the error and fix it before marking the run complete.
