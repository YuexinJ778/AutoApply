"""Streamlit interaction tests using temporary jobs and attachment storage only."""

from __future__ import annotations

import importlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from streamlit.testing.v1 import AppTest

import storage


class FilesAndEmailUITests(unittest.TestCase):
    def setUp(self) -> None:
        temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(temporary_directory.cleanup)
        self.root = Path(temporary_directory.name) / "test_tracker"
        self.jobs_file = self.root / "data" / "jobs.json"
        paths = patch.multiple(
            storage,
            PROJECT_ROOT=self.root,
            DATA_DIR=self.root / "data",
            APPLICATIONS_DIR=self.root / "applications",
            BACKUPS_DIR=self.root / "backups",
            JOBS_FILE=self.jobs_file,
            SETTINGS_FILE=self.root / "data" / "settings.json",
        )
        paths.start()
        self.addCleanup(paths.stop)
        storage.ensure_storage()
        self.app = importlib.import_module("app")

    @staticmethod
    def job_data(**overrides: object) -> dict[str, object]:
        values = {
            "company": "Test Company",
            "job_title": "Software Engineer",
            "status_id": "applied",
            "applied_date": "2026-09-01",
            "account": "separate-login",
            "password": "plain text password",
            "custom_fields": {},
        }
        values.update(overrides)
        return values

    def assert_no_exception(self, app_test: AppTest) -> None:
        self.assertEqual([error.message for error in app_test.exception], [])

    @staticmethod
    def by_label(elements: object, label: str):
        return next(element for element in elements if element.label == label)

    def files_app(self, job_id: str) -> AppTest:
        app_test = AppTest.from_string(
            "import app, storage, streamlit as st\n"
            "app._render_files_tab(storage.get_job_by_id(st.session_state['test_job_id']))",
            default_timeout=10,
        )
        app_test.session_state["test_job_id"] = job_id
        return app_test.run()

    def select_file(self, app_test: AppTest, job_id: str, file_id: str) -> AppTest:
        app_test.radio(key=f"attachment_picker_{job_id}").set_value(file_id).run()
        self.assert_no_exception(app_test)
        self.assertEqual(app_test.session_state[f"attachment_selection_{job_id}"], file_id)
        return app_test

    def test_add_job_email_is_trimmed_and_independent_of_account(self) -> None:
        app_test = AppTest.from_string("import app\napp.main()", default_timeout=10)
        app_test.session_state["page"] = "new_job"
        app_test.run()
        self.assert_no_exception(app_test)
        for label, value in {
            "Company *": "UI Created Company",
            "Job Title *": "UI Created Job",
            "Email": "  applicant@example.com  ",
            "Account": "another-login",
            "Password": "literal secret",
        }.items():
            self.by_label(app_test.text_input, label).set_value(value)
        self.by_label(app_test.button, "Create Job").click().run()
        self.assert_no_exception(app_test)
        jobs = storage.load_jobs()["jobs"]
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["email"], "applicant@example.com")
        self.assertEqual(jobs[0]["account"], "another-login")
        self.assertEqual(jobs[0]["password"], "literal secret")
        self.assertEqual(self.by_label(app_test.text_input, "Email").value, "applicant@example.com")
        self.assertEqual([tab.label for tab in app_test.tabs], ["Details", "Resume", "Markdown Notes", "Files", "Reminders"])

    def test_legacy_details_email_reloads_without_changing_other_fields(self) -> None:
        job = storage.create_job(self.job_data(
            custom_fields={"visible_field": "Keep visible", "orphan_field": "Keep unknown"},
            legacy_metadata={"nested": ["preserve"]},
        ))
        settings = storage.load_settings()
        settings["custom_fields"] = [{
            "id": "visible_field", "label": "Custom value", "type": "text",
            "active": True, "order": 1,
        }]
        storage.save_settings(settings)
        document = json.loads(self.jobs_file.read_text(encoding="utf-8"))
        del document["jobs"][0]["email"]
        self.jobs_file.write_text(json.dumps(document), encoding="utf-8")
        legacy_bytes = self.jobs_file.read_bytes()
        app_test = AppTest.from_string("import app\napp.main()", default_timeout=10)
        app_test.session_state["page"] = "job_detail"
        app_test.session_state["selected_job_id"] = job["id"]
        app_test.run()
        self.assert_no_exception(app_test)
        self.assertEqual(self.by_label(app_test.text_input, "Email").value, "")
        self.assertEqual(self.jobs_file.read_bytes(), legacy_bytes)
        self.by_label(app_test.text_input, "Email").set_value("  new-mail@example.com  ")
        self.by_label(app_test.button, "Save Changes").click().run()
        self.assert_no_exception(app_test)
        saved = storage.get_job_by_id(job["id"])
        self.assertEqual(saved["email"], "new-mail@example.com")
        for field in ("account", "password", "custom_fields", "legacy_metadata", "created_at"):
            self.assertEqual(saved[field], job[field])

        reopened = AppTest.from_string("import app\napp.main()", default_timeout=10)
        reopened.session_state["page"] = "job_detail"
        reopened.session_state["selected_job_id"] = job["id"]
        reopened.run()
        self.assert_no_exception(reopened)
        self.assertEqual(self.by_label(reopened.text_input, "Email").value, "new-mail@example.com")
        self.by_label(reopened.text_input, "Email").set_value("  ")
        self.by_label(reopened.button, "Save Changes").click().run()
        self.assert_no_exception(reopened)
        self.assertEqual(storage.get_job_by_id(job["id"])["email"], "")

    def test_uuid_selection_changes_preview_immediately_and_survives_new_session(self) -> None:
        job = storage.create_job(self.job_data())
        first, second = storage.add_attachments(job["id"], [
            ("same.txt", b"First attachment content"),
            ("same.txt", b"Second attachment content"),
        ])
        with patch.object(self.app, "_render_attachment_preview", wraps=self.app._render_attachment_preview) as preview:
            app_test = self.files_app(job["id"])
            self.assert_no_exception(app_test)
            preview.reset_mock()
            self.select_file(app_test, job["id"], first["id"])
            self.assertEqual([element.value for element in app_test.code], ["First attachment content"])
            preview.assert_called_once()
            self.assertEqual(preview.call_args.args[1]["id"], first["id"])
            self.select_file(app_test, job["id"], second["id"])
            self.assertEqual([element.value for element in app_test.code], ["Second attachment content"])
        picker = app_test.radio(key=f"attachment_picker_{job['id']}")
        self.assertEqual(len(picker.options), 2)
        self.assertTrue(all("same.txt" in label for label in picker.options))
        self.assertFalse(any(button.label in {"Open", "Preview", "Submit"} for button in app_test.button))

        reopened = self.files_app(job["id"])
        self.assert_no_exception(reopened)
        self.select_file(reopened, job["id"], first["id"])
        self.assertEqual(reopened.code[0].value, "First attachment content")
        self.assertEqual(storage.load_attachment(job["id"], second["id"]), b"Second attachment content")

    def test_upload_requires_button_saves_batch_once_and_resets_uploader(self) -> None:
        job = storage.create_job(self.job_data())
        with (
            patch.object(self.app, "add_attachments", wraps=self.app.add_attachments) as save,
            patch.object(self.app, "compile_resume_latex") as compile_resume,
        ):
            app_test = self.files_app(job["id"])
            self.assert_no_exception(app_test)
            uploader = app_test.file_uploader(key=f"attachment_upload_{job['id']}_0")
            self.assertTrue(uploader.accept_multiple_files)
            self.assertEqual(uploader.proto.max_upload_size_mb, 50)
            uploader.set_value([
                ("same.txt", b"uploaded one", "text/plain"),
                ("same.txt", b"uploaded two", "text/plain"),
            ]).run()
            self.assert_no_exception(app_test)
            app_test.run()
            save.assert_not_called()
            self.assertEqual(storage.list_attachments(job["id"]), [])
            app_test.button(key=f"save_attachments_{job['id']}").click().run()
            self.assert_no_exception(app_test)
            save.assert_called_once()
            files = storage.list_attachments(job["id"])
            self.assertEqual(len(files), 2)
            self.assertIn(app_test.session_state[f"attachment_selection_{job['id']}"], {file["id"] for file in files})
            self.assertEqual(app_test.session_state[f"attachment_upload_round_{job['id']}"], 1)
            self.assertEqual(app_test.file_uploader(key=f"attachment_upload_{job['id']}_1").value, [])
            self.assertTrue(app_test.button(key=f"save_attachments_{job['id']}").disabled)
            for file in files:
                self.select_file(app_test, job["id"], file["id"])
                app_test.run()
            save.assert_called_once()
            compile_resume.assert_not_called()
            self.assertEqual(len(storage.list_attachments(job["id"])), 2)

    def test_job_selection_isolation_and_confirmed_delete_fallback(self) -> None:
        first_job = storage.create_job(self.job_data(company="First"))
        second_job = storage.create_job(self.job_data(company="Second"))
        first, other = storage.add_attachments(first_job["id"], [("first.txt", b"first"), ("other.txt", b"other")])
        second = storage.add_attachments(second_job["id"], [("second.txt", b"second")])[0]
        app_test = self.files_app(first_job["id"])
        self.select_file(app_test, first_job["id"], first["id"])
        app_test.session_state["test_job_id"] = second_job["id"]
        app_test.run()
        self.assert_no_exception(app_test)
        self.assertEqual(app_test.code[0].value, "second")
        self.assertEqual(app_test.session_state[f"attachment_selection_{first_job['id']}"], first["id"])
        self.assertEqual(app_test.session_state[f"attachment_selection_{second_job['id']}"], second["id"])
        self.assertEqual(len(app_test.radio[0].options), 1)
        app_test.session_state["test_job_id"] = first_job["id"]
        app_test.run()
        self.assert_no_exception(app_test)
        self.assertEqual(app_test.code[0].value, "first")
        self.assertTrue(app_test.button(key=f"delete_attachment_{first_job['id']}_{first['id']}").disabled)
        app_test.checkbox(key=f"confirm_delete_attachment_{first_job['id']}_{first['id']}").check().run()
        app_test.button(key=f"delete_attachment_{first_job['id']}_{first['id']}").click().run()
        self.assert_no_exception(app_test)
        self.assertEqual(app_test.session_state[f"attachment_selection_{first_job['id']}"], other["id"])
        self.assertEqual(app_test.code[0].value, "other")
        app_test.checkbox(key=f"confirm_delete_attachment_{first_job['id']}_{other['id']}").check().run()
        app_test.button(key=f"delete_attachment_{first_job['id']}_{other['id']}").click().run()
        self.assert_no_exception(app_test)
        self.assertIsNone(app_test.session_state[f"attachment_selection_{first_job['id']}"])
        self.assertEqual(len(app_test.radio), 0)
        self.assertTrue(any("No files saved yet" in message.value for message in app_test.info))
        self.assertEqual(storage.load_attachment(second_job["id"], second["id"]), b"second")

    def test_unsupported_corrupt_empty_and_undecodable_files_keep_original_download(self) -> None:
        job = storage.create_job(self.job_data())
        cases = [
            ("document.docx", b"office bytes", "does not support inline preview"),
            ("damaged.pdf", b"invalid PDF", "damaged or incomplete"),
            ("damaged.png", b"invalid image", "Could not preview this file"),
            ("empty.txt", b"", "This file is empty"),
            ("blank.log", b" \n\t", "contains no visible text"),
            ("encoded.txt", b"\xff\xfe original bytes", "not valid UTF-8"),
            ("invalid.json", b"{not JSON}", "Invalid JSON"),
        ]
        metadata = storage.add_attachments(job["id"], [(name, data) for name, data, _ in cases])
        with patch.object(self.app.st, "download_button", wraps=self.app.st.download_button) as download:
            app_test = self.files_app(job["id"])
            for entry, (name, data, hint) in zip(metadata, cases):
                with self.subTest(filename=name):
                    download.reset_mock()
                    self.select_file(app_test, job["id"], entry["id"])
                    messages = [element.value for element in [*app_test.info, *app_test.warning]]
                    self.assertTrue(any(hint in message for message in messages), messages)
                    download.assert_called_once()
                    self.assertEqual(download.call_args.kwargs["file_name"], name)
                    self.assertEqual(download.call_args.kwargs["data"](), data)
                    self.assertEqual(download.call_args.kwargs["on_click"], "ignore")
                    self.assertEqual(len(app_test.get("download_button")), 1)
                    self.assertEqual(storage.load_attachment(job["id"], entry["id"]), data)

    def test_text_csv_and_json_previews_are_bounded(self) -> None:
        job = storage.create_job(self.job_data())
        long_text = b"a" * (self.app.TEXT_PREVIEW_BYTES + 1000)
        long_json = json.dumps({"value": "b" * self.app.TEXT_PREVIEW_BYTES}).encode()
        csv_data = ("name,count\n" + "example,12\n" * 250).encode()
        text_file, csv_file, large_json, valid_json = storage.add_attachments(job["id"], [
            ("large.tex", long_text), ("table.csv", csv_data),
            ("large.json", long_json), ("valid.json", b'{"value": [1, 2, 3]}'),
        ])
        with patch.object(self.app, "compile_resume_latex") as compile_resume:
            app_test = self.files_app(job["id"])
            self.select_file(app_test, job["id"], text_file["id"])
            self.assertEqual(len(app_test.code[0].value.encode()), self.app.TEXT_PREVIEW_BYTES)
            self.assertTrue(any("Partial preview" in element.value for element in app_test.caption))
            self.select_file(app_test, job["id"], csv_file["id"])
            self.assertEqual(app_test.dataframe[0].value.shape, (200, 2))
            self.assertTrue(any("Partial CSV preview" in element.value for element in app_test.caption))
            self.select_file(app_test, job["id"], large_json["id"])
            self.assertEqual(len(app_test.json), 0)
            self.assertLessEqual(len(app_test.code[0].value.encode()), self.app.TEXT_PREVIEW_BYTES)
            self.assertTrue(any("JSON is shown as text" in element.value for element in app_test.caption))
            self.select_file(app_test, job["id"], valid_json["id"])
            self.assertEqual(json.loads(app_test.json[0].value), {"value": [1, 2, 3]})
            compile_resume.assert_not_called()

    def test_csv_truncation_inside_quoted_record_keeps_complete_rows(self) -> None:
        job = storage.create_job(self.job_data())
        content = "name,value\n" + ("row," + "x" * 1700 + "\n") * 150
        content += 'last,"' + "y" * 20000 + '"\n'
        storage.add_attachments(job["id"], [("large.csv", content.encode())])
        app_test = self.files_app(job["id"])
        self.assert_no_exception(app_test)
        self.assertEqual(len(app_test.dataframe), 1)
        self.assertEqual(len(app_test.dataframe[0].value), 150)
        self.assertTrue(any("incomplete CSV record" in item.value for item in app_test.caption))
        self.assertFalse(app_test.warning)

    def test_markdown_disables_image_and_html_syntax(self) -> None:
        job = storage.create_job(self.job_data())
        markdown = (
            "# Company Notes\n\n**Readable content**\n\n"
            "![inline](https://example.invalid/image.png)\n"
            "![reference][image]\n[image]: https://example.invalid/reference.png\n"
            '<img src="https://example.invalid/html.png"><script>alert(1)</script>'
        )
        storage.add_attachments(job["id"], [("notes.md", markdown.encode())])
        with patch.object(self.app.st, "markdown", wraps=self.app.st.markdown) as render:
            app_test = self.files_app(job["id"])
        self.assert_no_exception(app_test)
        preview_call = next(call for call in render.call_args_list if "Company Notes" in call.args[0])
        sanitized = preview_call.args[0]
        self.assertIn("# Company Notes", sanitized)
        self.assertIn("**Readable content**", sanitized)
        self.assertNotIn("!", sanitized)
        self.assertNotIn("<", sanitized)
        self.assertIs(preview_call.kwargs["unsafe_allow_html"], False)
        self.assertEqual(len(app_test.get("image")), 0)

    def test_pdf_uses_existing_viewer_with_job_and_file_key_and_valid_image_renders(self) -> None:
        job = storage.create_job(self.job_data())
        pdf_data = b"%PDF-1.7\n test PDF\n%%EOF\n"
        image_data = io.BytesIO()
        Image.new("RGB", (2, 2), color="blue").save(image_data, format="PNG")
        pdf_file, image_file = storage.add_attachments(job["id"], [
            ("document.pdf", pdf_data), ("image.png", image_data.getvalue()),
        ])
        with patch.object(self.app, "_render_pdf_preview") as pdf_preview:
            app_test = self.files_app(job["id"])
            self.select_file(app_test, job["id"], pdf_file["id"])
            pdf_preview.assert_called_once_with(pdf_data, f"attachment-pdf-{job['id']}-{pdf_file['id']}")
            self.select_file(app_test, job["id"], image_file["id"])
            self.assertEqual(len(app_test.get("image")), 1)

    def test_corrupt_index_shows_error_without_replacing_index(self) -> None:
        job = storage.create_job(self.job_data())
        attachment = storage.add_attachments(job["id"], [("keep.txt", b"keep original")])[0]
        index_path = storage.get_job_directory(job["id"]) / "attachments" / "index.json"
        # Remove recovery copies so this exercises the UI's non-recoverable path.
        for backup in (self.root / "backups").rglob("*"):
            if backup.is_file():
                backup.unlink()
        index_path.write_bytes(b"{broken attachment index")
        attachment_path = index_path.parent / attachment["stored_filename"]
        app_test = self.files_app(job["id"])
        self.assert_no_exception(app_test)
        self.assertTrue(any("Could not safely open the attachment index" in message.value for message in app_test.error))
        self.assertEqual(index_path.read_bytes(), b"{broken attachment index")
        self.assertEqual(attachment_path.read_bytes(), b"keep original")


if __name__ == "__main__":
    unittest.main()
