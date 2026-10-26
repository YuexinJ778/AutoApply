# Auto Apply

A Chrome extension that helps you prepare job applications: tailor your resume with AI, fill application forms, and track your progress in one place.

## Features

- Read job details from the page you are viewing.
- Generate a tailored resume from your profile and the job description.
- Edit resumes manually or with an AI assistant, with English and Chinese support and a live A4 preview.
- Autofill application fields and attach a generated resume on supported forms.
- Save jobs, track application stages, and keep notes for each application.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions/` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select the `Chrome extension` folder.

No build step is required.

## Use

1. Open the extension and click **Console**.
2. Add your profile and base resume under **Profile**.
3. In **Settings**, select **minimax**, enter your API key, then click **Save Settings** and **Test Connection**.
4. Open a job posting and click **Start Apply** to generate a tailored resume.
5. Click the job page's Apply button. Once the form opens, reopen the extension to autofill it.
6. Review the resume and form before submitting. Manage saved jobs and application status under **Applications**.

## Status and data

This project is under active development. Autofill support varies by website; final submission is handled by the user.

Profiles, settings, and application records are stored locally in Chrome. AI features send the relevant job and resume content to the configured AI provider.

Built with JavaScript, HTML, CSS, and Chrome Extension Manifest V3.
