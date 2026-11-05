"""Isolated AppTests for prompt selection, drafts, saved copy payloads and CRUD."""

import importlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from streamlit.testing.v1 import AppTest

import storage
from test_prompts_storage import CONTENT


class PromptsUITests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve() / "tracker"
        paths = patch.multiple(
            storage, PROJECT_ROOT=self.root, DATA_DIR=self.root / "data",
            APPLICATIONS_DIR=self.root / "applications", BACKUPS_DIR=self.root / "backups",
            JOBS_FILE=self.root / "data/jobs.json", SETTINGS_FILE=self.root / "data/settings.json",
        )
        paths.start()
        self.addCleanup(paths.stop)
        storage.ensure_storage()
        self.app = importlib.import_module("app")

    def start(self, page="prompts"):
        tracker = AppTest.from_string("import app\napp.main()", default_timeout=15)
        tracker.session_state["page"] = page
        tracker.run()
        self.assert_ok(tracker)
        return tracker

    def assert_ok(self, tracker):
        self.assertEqual([item.message for item in tracker.exception], [])

    @staticmethod
    def by_label(elements, label):
        return next(item for item in elements if item.label == label)

    def snapshot(self):
        return {str(path.relative_to(self.root)): (path.read_bytes(), path.stat().st_mtime_ns)
                for path in self.root.rglob("*") if path.is_file()}

    def fill(self, tracker, description, content):
        self.by_label(tracker.text_area, "Description").set_value(description)
        self.by_label(tracker.text_area, "Prompt").set_value(content)

    def submit(self, tracker, label="Save"):
        self.by_label(tracker.button, label).click().run()
        self.assert_ok(tracker)

    def select(self, tracker, prompt_id):
        tracker.selectbox(key="prompts_selector").set_value(prompt_id).run()
        self.assert_ok(tracker)

    def test_navigation_empty_page_and_rerun_do_not_write(self):
        tracker = self.start("dashboard")
        self.assertEqual([item.label for item in tracker.sidebar.button if item.key.startswith("nav_")],
                         ["Dashboard", "Calendar", "Companies", "Prompts", "Import JSON", "Settings"])
        before = self.snapshot()
        tracker.button(key="nav_prompts").click().run()
        self.assert_ok(tracker)
        self.assertEqual(tracker.title[0].value, "Prompts")
        self.assertEqual(tracker.session_state["page"], "prompts")
        self.assertIn("No prompts saved yet", [item.value for item in tracker.info])
        tracker.run()
        self.assertEqual(self.snapshot(), before)

    def test_add_validation_date_sort_selection_reload_and_no_duplicate_rerun(self):
        with patch.object(storage, "_utc_now", return_value="2025-01-02T12:00:00+00:00"):
            older = storage.create_prompt("Earlier", "earlier")
        tracker = self.start()
        tracker.button(key="prompts_add").click().run()
        self.assertEqual(len(tracker.date_input), 0)
        before = self.snapshot()
        for description, content in ((" ", CONTENT), ("Valid", " \n\t")):
            self.fill(tracker, description, content)
            self.submit(tracker)
            self.assertTrue(tracker.error)
            self.assertEqual(self.snapshot(), before)
        self.fill(tracker, "  中文用途  ", CONTENT)
        with patch.object(storage, "_utc_now", return_value="2026-10-01T14:00:00+00:00"):
            self.submit(tracker)
        saved = storage.load_prompts()[-1]
        self.assertEqual(saved["description"], "中文用途")
        self.assertEqual(saved["content"], CONTENT)
        self.assertEqual(tracker.selectbox(key="prompts_selector").value, saved["id"])
        self.assertEqual(tracker.dataframe[0].value.to_dict("records"), [
            {"Created Date": "2026-10-01", "Description": "中文用途"},
            {"Created Date": "2025-01-02", "Description": older["description"]},
        ])
        self.assertTrue(self.by_label(tracker.text_area, "Prompt").disabled)
        self.assertEqual(self.by_label(tracker.text_area, "Prompt").value, CONTENT)
        before = self.snapshot()
        tracker.run()
        reopened = self.start()
        self.select(reopened, saved["id"])
        self.assertEqual(self.by_label(reopened.text_area, "Prompt").value, CONTENT)
        self.assertEqual(self.snapshot(), before)

    def test_edit_keeps_identity_and_copy_receives_saved_raw_text_only(self):
        original = storage.create_prompt("Original", CONTENT)
        tracker = self.start()
        with patch.object(self.app, "_render_copy_button") as copy_button:
            self.select(tracker, original["id"])
            self.assertEqual(copy_button.call_args.args, (CONTENT,))
            self.assertEqual(copy_button.call_args.kwargs["label"], "Copy Prompt")
            copy_button.reset_mock()
            tracker.button(key="prompts_edit").click().run()
            self.assertEqual(self.by_label(tracker.text_area, "Prompt").value, CONTENT)
            self.assertIn(original["id"], self.by_label(tracker.text_area, "Prompt").key)
            changed = CONTENT + "  Updated\n"
            self.fill(tracker, " Updated ", changed)
            tracker.run()
            copy_button.assert_not_called()
            self.assertEqual(storage.load_prompts(), [original])
            self.submit(tracker)
            self.assertEqual(copy_button.call_args.args, (changed,))
        self.assertEqual(storage.load_prompts(), [{**original, "description": "Updated", "content": changed}])
        self.assertEqual(self.by_label(tracker.text_area, "Prompt").value, changed)

    def test_cancel_and_switching_uuids_cannot_save_stale_drafts(self):
        first = storage.create_prompt("Same", "first")
        second = storage.create_prompt("Same", "second")
        tracker = self.start()
        before = self.snapshot()
        tracker.button(key="prompts_add").click().run()
        self.fill(tracker, "Cancelled", CONTENT)
        self.submit(tracker, "Cancel")
        self.select(tracker, first["id"])
        tracker.button(key="prompts_edit").click().run()
        self.fill(tracker, "Unsaved first", "First draft")
        self.select(tracker, second["id"])
        self.assertEqual(self.by_label(tracker.text_area, "Prompt").value, "second")
        tracker.button(key="prompts_edit").click().run()
        self.assertEqual(self.by_label(tracker.text_area, "Prompt").value, "second")
        self.fill(tracker, "Unsaved second", "Second draft")
        self.submit(tracker, "Cancel")
        self.select(tracker, first["id"])
        tracker.button(key="prompts_edit").click().run()
        self.assertEqual(self.by_label(tracker.text_area, "Prompt").value, "first")
        self.submit(tracker, "Cancel")
        self.assertEqual(self.snapshot(), before)
        tracker.button(key="nav_dashboard").click().run()
        tracker.button(key="nav_prompts").click().run()
        self.assertEqual(tracker.selectbox(key="prompts_selector").value, first["id"])
        self.assertEqual(self.by_label(tracker.text_area, "Prompt").value, "first")

    def test_delete_confirmation_selection_reset_and_empty_state(self):
        first = storage.create_prompt("Same", "first")
        second = storage.create_prompt("Same", "second")
        tracker = self.start()
        self.select(tracker, first["id"])
        before = self.snapshot()
        tracker.button(key="prompts_delete").click().run()
        tracker.run()
        tracker.button(key="prompts_cancel_delete").click().run()
        self.assertEqual(self.snapshot(), before)
        tracker.button(key="prompts_delete").click().run()
        self.select(tracker, second["id"])
        self.assertFalse(any(item.key == "prompts_confirm_delete" for item in tracker.button))
        self.select(tracker, first["id"])
        tracker.button(key="prompts_delete").click().run()
        tracker.button(key="prompts_confirm_delete").click().run()
        self.assert_ok(tracker)
        self.assertEqual(storage.load_prompts(), [second])
        self.assertIsNone(tracker.selectbox(key="prompts_selector").value)
        self.select(tracker, second["id"])
        tracker.button(key="prompts_delete").click().run()
        tracker.button(key="prompts_confirm_delete").click().run()
        self.assertIn("No prompts saved yet", [item.value for item in tracker.info])

    def test_load_save_and_delete_errors_are_visible_and_keep_data(self):
        original = storage.create_prompt("Original", CONTENT)
        tracker = self.start()
        self.select(tracker, original["id"])
        before = self.snapshot()
        tracker.button(key="prompts_edit").click().run()
        self.fill(tracker, "Draft", "draft")
        with patch.object(self.app, "update_prompt", side_effect=OSError("disk failure")):
            self.submit(tracker)
        self.assertTrue(any("disk failure" in item.value for item in tracker.error))
        self.assertEqual(self.by_label(tracker.text_area, "Prompt").value, "draft")
        self.submit(tracker, "Cancel")
        tracker.button(key="prompts_delete").click().run()
        with patch.object(self.app, "delete_prompt", side_effect=OSError("disk failure")):
            tracker.button(key="prompts_confirm_delete").click().run()
        self.assertTrue(any("disk failure" in item.value for item in tracker.error))
        self.assertEqual(self.snapshot(), before)
        with patch.object(self.app, "load_prompts", side_effect=storage.CorruptStorageError("unreadable")):
            tracker.run()
        self.assertTrue(any("unreadable" in item.value for item in tracker.error))
        self.assertFalse(any(item.key == "prompts_add" for item in tracker.button))
        self.assertEqual(self.snapshot(), before)


if __name__ == "__main__":
    unittest.main()
