"""Resume UI regression tests using Streamlit against isolated temporary data."""

from __future__ import annotations

import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import storage
import test_resume_workspace as workspace_tests

try:
    from streamlit.testing.v1 import AppTest
except ImportError:
    AppTest = None


@unittest.skipIf(AppTest is None, "Run with .venv/bin/python for Streamlit AppTest")
class ResumeModesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.root = Path(self.temporary_directory.name) / "tracker"
        self.path_patch = patch.multiple(
            storage,
            PROJECT_ROOT=self.root,
            DATA_DIR=self.root / "data",
            APPLICATIONS_DIR=self.root / "applications",
            BACKUPS_DIR=self.root / "backups",
            JOBS_FILE=self.root / "data" / "jobs.json",
            SETTINGS_FILE=self.root / "data" / "settings.json",
        )
        self.path_patch.start()
        self.addCleanup(self.path_patch.stop)
        self.job = storage.create_job({"company": "Example", "job_title": "Analyst"})
        self.job_id = str(self.job["id"])
        self.tex_path = storage.get_job_directory(self.job_id) / "resume.tex"
        self.tex_path.write_text("disk source", encoding="utf-8")
        for target, kwargs in (
            ("find_pdflatex", {"return_value": "/mock/pdflatex"}),
            ("compile_resume_latex", {"wraps": storage.compile_resume_latex}),
            ("load_text_file", {"wraps": storage.load_text_file}),
        ):
            patcher = patch.object(storage, target, **kwargs)
            setattr(self, target + "_mock", patcher.start())
            self.addCleanup(patcher.stop)
        process_patch = patch(
            "storage.subprocess.run",
            side_effect=workspace_tests.ResumeWorkspaceTests.successful_pdflatex(
                workspace_tests.ResumeWorkspaceTests.PDF_ONE
            ),
        )
        self.process_mock = process_patch.start()
        self.addCleanup(process_patch.stop)
        self.editor_key = f"resume_tex_editor_{self.job_id}"
        self.draft_key = f"resume_tex_draft_{self.job_id}"
        self.mode_key = f"resume_mode_{self.job_id}"
        self.app_path = Path(__file__).with_name("app.py")

    def app(self):
        at = AppTest.from_file(str(self.app_path), default_timeout=10)
        at.session_state["page"] = "job_detail"
        at.session_state["selected_job_id"] = self.job_id
        at.run()
        self.assertFalse(at.exception)
        return at

    def snapshot(self):
        return {
            str(path.relative_to(self.root)): (path.read_bytes(), path.stat().st_mtime_ns)
            for path in self.root.rglob("*") if path.is_file()
        }

    @staticmethod
    def ancestor_types(block, target, ancestors=()):
        if block is target:
            return ancestors
        for child in getattr(block, "children", {}).values():
            found = ResumeModesTests.ancestor_types(
                child, target, (*ancestors, block.type)
            )
            if found is not None:
                return found
        return None

    def test_modes_layout_toolbar_library_and_read_only_reruns(self) -> None:
        storage.add_uploaded_pdf_version(
            self.job_id, workspace_tests.ResumeWorkspaceTests.PDF_ONE, "First", "one.pdf"
        )
        storage.add_uploaded_pdf_version(
            self.job_id, workspace_tests.ResumeWorkspaceTests.PDF_TWO, "Second", "two.pdf"
        )
        at = self.app()
        self.assertEqual(at.radio(key=self.mode_key).value, "Split view")
        snapshot = self.snapshot()
        for mode in ("LaTeX only", "Compiled preview only", "Split view"):
            with self.subTest(mode=mode):
                at.radio(key=self.mode_key).set_value(mode).run()
                self.assertFalse(at.exception)
                headings = [item.value for item in at.markdown]
                self.assertEqual("#### LaTeX Source" in headings, mode != "Compiled preview only")
                self.assertEqual("#### Compiled Preview" in headings, mode != "LaTeX only")
                if mode != "Compiled preview only":
                    ancestors = self.ancestor_types(at.main, at.text_area(key=self.editor_key))
                    self.assertEqual("column" in ancestors, mode == "Split view")
                    self.assertNotIn("form", ancestors)
                if mode != "LaTeX only":
                    heading = next(item for item in at.markdown if item.value == "#### Compiled Preview")
                    ancestors = self.ancestor_types(at.main, heading)
                    self.assertEqual("column" in ancestors, mode == "Split view")
                button_labels = {item.label for item in at.button}
                download_labels = {item.label for item in at.get("download_button")}
                self.assertTrue({"Save .tex", "Compile", "Save to PDF Library"} <= button_labels)
                self.assertTrue({"Download .tex", "Download Compiled PDF", "Download Selected"} <= download_labels)
                self.assertIn("Saved PDF Resumes", [item.value for item in at.subheader])
                self.assertEqual(len(next(item for item in at.selectbox if item.label == "PDF version").options), 2)
                next(item for item in at.selectbox if item.label == "PDF version").select_index(1).run()
                next(item for item in at.get("download_button") if item.label == "Download .tex").click().run()
                self.assertEqual(at.radio(key=self.mode_key).value, mode)
                self.assertEqual(self.snapshot(), snapshot)
        self.compile_resume_latex_mock.assert_not_called()
        self.process_mock.assert_not_called()

    def test_pending_edit_survives_hidden_widget_cleanup_and_disk_changes(self) -> None:
        at = self.app()
        draft = "unsaved draft\n\\section{測試} trailing spaces  \n"
        # Submit both changed widget values in one event, as when clicking a mode
        # while an edited text area has focus (browser focus itself is separate QA).
        at.text_area(key=self.editor_key).set_value(draft)
        at.radio(key=self.mode_key).set_value("Compiled preview only").run()
        self.assertEqual(at.session_state[self.draft_key], draft)
        self.assertNotIn(self.editor_key, at.session_state)
        self.assertEqual(self.tex_path.read_text(encoding="utf-8"), "disk source")
        at.run()
        self.tex_path.write_text("external disk change", encoding="utf-8")
        at.radio(key=self.mode_key).set_value("LaTeX only").run()
        self.assertFalse(at.exception)
        self.assertEqual(at.text_area(key=self.editor_key).value, draft)
        resume_reads = [
            call for call in self.load_text_file_mock.call_args_list
            if Path(call.args[0]).name == "resume.tex"
        ]
        self.assertEqual(len(resume_reads), 1)
        self.compile_resume_latex_mock.assert_not_called()

    def test_unreadable_source_does_not_create_an_empty_editable_draft(self) -> None:
        original_reader = self.load_text_file_mock._mock_wraps

        def read_text(path):
            if Path(path) == self.tex_path:
                raise PermissionError("Source is not readable")
            return original_reader(path)

        self.load_text_file_mock.side_effect = read_text
        at = self.app()
        self.assertTrue(any("Could not read resume.tex" in item.value for item in at.error))
        self.assertNotIn(self.draft_key, at.session_state)
        self.assertFalse(any(item.label == "Save .tex" for item in at.button))
        self.assertEqual(self.tex_path.read_text(encoding="utf-8"), "disk source")
        self.compile_resume_latex_mock.assert_not_called()

    def test_save_compile_and_download_use_latest_hidden_draft(self) -> None:
        at = self.app()
        draft = "latest source from hidden editor\n"
        at.text_area(key=self.editor_key).set_value(draft)
        at.radio(key=self.mode_key).set_value("Compiled preview only").run()
        at.button(key=f"save_tex_{self.job_id}").click().run()
        self.assertEqual(self.tex_path.read_text(encoding="utf-8"), draft)
        self.compile_resume_latex_mock.assert_not_called()
        at.button(key=f"compile_tex_{self.job_id}").click().run()
        self.assertFalse(at.exception)
        self.compile_resume_latex_mock.assert_called_once_with(self.job_id, draft)
        self.assertEqual(at.radio(key=self.mode_key).value, "Compiled preview only")
        status = storage.load_compile_status(self.job_id)
        self.assertEqual(status["preview_source_hash"], hashlib.sha256(draft.encode()).hexdigest())
        # AppTest's download widget exercises its click path without a browser.
        with patch("streamlit.download_button", wraps=__import__("streamlit").download_button) as downloads:
            next(item for item in at.get("download_button") if item.label == "Download .tex").click().run()
            source_download = next(call for call in downloads.call_args_list if call.args[0] == "Download .tex")
            self.assertEqual(source_download.kwargs["data"], draft.encode("utf-8"))
        self.assertEqual(self.compile_resume_latex_mock.call_count, 1)
        self.assertEqual(storage.load_compile_status(self.job_id), status)

    def test_files_and_notes_reruns_preserve_resume_and_save_pending_upload_once(self) -> None:
        first, second = storage.add_attachments(self.job_id, [
            ("first.txt", b"First file preview"),
            ("second.txt", b"Second file preview"),
        ])
        at = self.app()
        self.assertEqual(
            [tab.label for tab in at.tabs],
            ["Details", "Resume", "Markdown Notes", "Files", "Reminders"],
        )
        picker_key = f"attachment_picker_{self.job_id}"
        at.radio(key=picker_key).set_value(first["id"]).run()
        snapshot = self.snapshot()
        draft = "Pending resume source across Files and Notes\n"
        with patch.object(storage, "add_attachments", wraps=storage.add_attachments) as save:
            at.file_uploader(key=f"attachment_upload_{self.job_id}_0").set_value([
                ("pending.tex", b"Attachment only; do not compile", "text/plain"),
            ])
            at.text_area(key=self.editor_key).set_value(draft)
            at.radio(key=self.mode_key).set_value("Compiled preview only").run()
            self.assertFalse(at.exception)
            self.assertEqual(at.session_state[self.draft_key], draft)
            self.assertEqual(len(storage.list_attachments(self.job_id)), 2)
            self.assertEqual(self.snapshot(), snapshot)
            save.assert_not_called()

            at.radio(key=picker_key).set_value(second["id"]).run()
            self.assertIn("Second file preview", [item.value for item in at.code])
            self.assertNotIn("First file preview", [item.value for item in at.code])
            self.assertEqual(at.session_state[f"attachment_selection_{self.job_id}"], second["id"])
            self.assertEqual(at.radio(key=self.mode_key).value, "Compiled preview only")
            self.assertEqual(self.snapshot(), snapshot)
            next(
                item for item in at.get("download_button")
                if item.label == "Download Selected File"
            ).click().run()
            self.assertFalse(at.exception)
            self.assertEqual(at.session_state[self.draft_key], draft)
            self.assertEqual(at.radio(key=self.mode_key).value, "Compiled preview only")
            self.assertEqual(self.snapshot(), snapshot)

            at.text_area(key=f"markdown_notes_editor_{self.job_id}").set_value(
                "# Unsaved note edited in the other tab"
            ).run()
            self.assertEqual(at.radio(key=self.mode_key).value, "Compiled preview only")
            at.radio(key=self.mode_key).set_value("LaTeX only").run()
            self.assertFalse(at.exception)
            self.assertEqual(at.text_area(key=self.editor_key).value, draft)
            self.assertEqual(self.snapshot(), snapshot)
            save.assert_not_called()

            at.button(key=f"save_attachments_{self.job_id}").click().run()
            self.assertFalse(at.exception)
            save.assert_called_once_with(
                self.job_id, [("pending.tex", b"Attachment only; do not compile")]
            )
            files = storage.list_attachments(self.job_id)
            self.assertEqual(len(files), 3)
            self.assertEqual(at.file_uploader(key=f"attachment_upload_{self.job_id}_1").value, [])
            self.assertTrue(at.button(key=f"save_attachments_{self.job_id}").disabled)
            self.assertEqual(at.radio(key=self.mode_key).value, "LaTeX only")
            self.assertEqual(at.text_area(key=self.editor_key).value, draft)
            self.assertEqual(self.tex_path.read_text(encoding="utf-8"), "disk source")
            saved_snapshot = self.snapshot()
            at.radio(key=self.mode_key).set_value("Split view").run()
            at.radio(key=picker_key).set_value(first["id"]).run()
            at.run()
            self.assertFalse(at.exception)
            self.assertEqual(at.text_area(key=self.editor_key).value, draft)
            self.assertEqual(at.radio(key=self.mode_key).value, "Split view")
            self.assertEqual(self.snapshot(), saved_snapshot)
            self.assertEqual(len(storage.list_attachments(self.job_id)), 3)
            save.assert_called_once()
        self.compile_resume_latex_mock.assert_not_called()
        self.process_mock.assert_not_called()

    def test_open_resets_mode_while_job_drafts_stay_isolated(self) -> None:
        second = storage.create_job({"company": "Second", "job_title": "Different"})
        second_id = str(second["id"])
        (storage.get_job_directory(second_id) / "resume.tex").write_text("second disk", encoding="utf-8")
        # Use the existing Dashboard callback and its row-to-UUID mapping; the
        # testing wrapper only supplies the native ButtonColumn click event.
        script = f'''
import runpy
import streamlit as st
app = runpy.run_path({str(self.app_path)!r}, run_name="tracker_ui_test")
if st.session_state.pop("test_open_event", False):
    app["_handle_dashboard_open"]()
app["main"]()
'''
        at = AppTest.from_string(script, default_timeout=10)
        at.session_state["page"] = "dashboard"
        at.session_state[self.mode_key] = "LaTeX only"
        at.session_state["dashboard_visible_job_ids"] = [self.job_id, second_id]
        at.session_state["dashboard_open_click"] = {"row": 0}
        at.session_state["test_open_event"] = True
        at.run()
        self.assertFalse(at.exception)
        self.assertEqual(at.radio(key=self.mode_key).value, "Split view")
        at.text_area(key=self.editor_key).set_value("first draft")
        at.radio(key=self.mode_key).set_value("Compiled preview only").run()
        at.session_state["dashboard_open_click"] = {"row": 1}
        at.session_state["test_open_event"] = True
        at.run()
        self.assertFalse(at.exception)
        self.assertEqual(at.text_area(key=f"resume_tex_editor_{second_id}").value, "second disk")
        at.text_area(key=f"resume_tex_editor_{second_id}").set_value("second draft").run()
        at.session_state["dashboard_open_click"] = {"row": 0}
        at.session_state["test_open_event"] = True
        at.run()
        self.assertFalse(at.exception)
        self.assertEqual(at.radio(key=self.mode_key).value, "Split view")
        self.assertEqual(at.text_area(key=self.editor_key).value, "first draft")
        self.assertEqual(at.session_state[f"resume_tex_draft_{second_id}"], "second draft")
        self.compile_resume_latex_mock.assert_not_called()

    def test_failed_compile_and_mode_changes_preserve_successful_pdf(self) -> None:
        storage.compile_resume_latex(self.job_id, "disk source")
        previous_status = storage.load_compile_status(self.job_id)
        previous_pdf = storage.load_compiled_preview(self.job_id)
        self.compile_resume_latex_mock.reset_mock()
        self.process_mock.side_effect = workspace_tests.ResumeWorkspaceTests.failing_pdflatex
        at = self.app()
        at.text_area(key=self.editor_key).set_value("broken new source")
        at.radio(key=self.mode_key).set_value("Compiled preview only").run()
        at.button(key=f"compile_tex_{self.job_id}").click().run()
        self.assertFalse(at.exception)
        failed_status = storage.load_compile_status(self.job_id)
        self.assertFalse(failed_status["success"])
        self.assertEqual(failed_status["compiled_at"], previous_status["compiled_at"])
        self.assertEqual(storage.load_compiled_preview(self.job_id), previous_pdf)
        self.assertTrue(any("previous successful preview" in item.value for item in at.error))
        self.assertTrue(any("not been compiled yet" in item.value for item in at.info))
        snapshot = self.snapshot()
        for mode in ("LaTeX only", "Split view", "Compiled preview only"):
            at.radio(key=self.mode_key).set_value(mode).run()
            self.assertFalse(at.exception)
            self.assertEqual(storage.load_compiled_preview(self.job_id), previous_pdf)
            self.assertEqual(storage.load_compile_status(self.job_id), failed_status)
            self.assertEqual(self.snapshot(), snapshot)
        self.compile_resume_latex_mock.assert_called_once_with(self.job_id, "broken new source")


if __name__ == "__main__":
    unittest.main()
