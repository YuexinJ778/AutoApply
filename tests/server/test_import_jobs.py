"""Import boundary and batch-storage tests; every storage path is temporary."""

from __future__ import annotations

import copy
import json
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import storage
from import_jobs import IMPORT_FIELDS, build_import_template, parse_and_validate_import


class ImportJobsTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "tracker"
        self.jobs_file = self.root / "data" / "jobs.json"
        self.applications_dir = self.root / "applications"
        path_patch = patch.multiple(
            storage,
            PROJECT_ROOT=self.root,
            DATA_DIR=self.root / "data",
            APPLICATIONS_DIR=self.applications_dir,
            BACKUPS_DIR=self.root / "backups",
            JOBS_FILE=self.jobs_file,
            SETTINGS_FILE=self.root / "data" / "settings.json",
        )
        path_patch.start()
        self.addCleanup(path_patch.stop)
        self.settings = copy.deepcopy(storage.DEFAULT_SETTINGS)
        self.settings["statuses"].append({
            "id": "inactive_status", "label": "Disabled status", "active": False,
            "summary_group": "pending", "order": 90,
        })
        self.settings["custom_fields"] = [
            {"id": "notes", "label": "補充", "type": "text", "active": True},
            {"id": "due", "label": "Deadline", "type": "date", "active": True},
            {"id": "category", "label": "Category", "type": "select", "active": True,
             "options": ["研究", "Engineering"]},
            {"id": "remote", "label": "Remote", "type": "checkbox", "active": True},
            {"id": "inactive_field", "label": "Disabled", "type": "text", "active": False},
        ]

    @staticmethod
    def job(**changes: object) -> dict[str, object]:
        result: dict[str, object] = {
            "company": "Example Company", "job_title": "Analyst", "status_id": "planning"
        }
        result.update(changes)
        return result

    def parse(self, jobs: list[object], **root_values: object) -> list[dict[str, object]]:
        return parse_and_validate_import(
            json.dumps({**root_values, "jobs": jobs}, ensure_ascii=False), self.settings
        )

    def test_three_jobs_append_to_latest_data_with_distinct_uuids_and_one_save(self) -> None:
        original = storage.create_job(self.job(company="Original"))
        parsed = self.parse([self.job(), self.job(), self.job()])
        newer = storage.create_job(self.job(company="Added after preview"))
        with (
            patch.object(storage, "load_jobs", wraps=storage.load_jobs) as read,
            patch.object(storage, "save_jobs", wraps=storage.save_jobs) as save,
            patch.object(storage, "atomic_write_json", wraps=storage.atomic_write_json) as write,
        ):
            imported = storage.create_jobs_batch(parsed)
        self.assertEqual(read.call_count, 1)
        self.assertEqual(save.call_count, 1)
        self.assertEqual(write.call_count, 1)
        persisted = storage.load_jobs()["jobs"]
        self.assertEqual(persisted[:2], [original, newer])
        self.assertEqual(persisted[2:], imported)
        self.assertEqual(len({job["id"] for job in persisted}), 5)
        for job in imported:
            self.assertEqual(str(uuid.UUID(job["id"])), job["id"])
            self.assertTrue(job["created_at"])
            self.assertEqual(job["created_at"], job["updated_at"])
            self.assertFalse(job["archived"])
            self.assertTrue(storage.get_job_directory(job["id"]).is_dir())
            self.assertEqual(storage.get_job_by_id(job["id"]), job)
        backup = json.loads((self.root / "backups" / "jobs.json.bak").read_text())
        self.assertEqual(backup["jobs"], [original, newer])

    def test_invalid_second_job_leaves_all_storage_and_folders_unchanged(self) -> None:
        storage.create_job(self.job())
        before = self.jobs_file.read_bytes()
        folders_before = list(self.applications_dir.iterdir())
        with self.assertRaisesRegex(ValueError, r"Job 2: applied_date"):
            parsed = self.parse([self.job(), self.job(applied_date="2026-02-30"), self.job()])
            storage.create_jobs_batch(parsed)
        self.assertEqual(self.jobs_file.read_bytes(), before)
        self.assertEqual(list(self.applications_dir.iterdir()), folders_before)

    def test_preview_and_template_never_initialise_storage(self) -> None:
        with patch.object(storage, "load_jobs", side_effect=AssertionError("No job reads")):
            build_import_template(self.settings)
            self.parse([self.job()])
        self.assertFalse(self.root.exists())

    def test_unicode_quotes_commas_and_newlines_survive_save(self) -> None:
        message = '中文公司, "研究"\n第二行'
        parsed = self.parse([self.job(
            company=message, job_title='工程師 "A", B',
            custom_fields={"notes": message},
        )])
        saved = storage.create_jobs_batch(parsed)[0]
        reloaded = storage.get_job_by_id(saved["id"])
        self.assertEqual(reloaded["company"], message)
        self.assertEqual(reloaded["job_title"], '工程師 "A", B')
        self.assertEqual(reloaded["custom_fields"]["notes"], message)
        self.assertIn("中文公司", self.jobs_file.read_text(encoding="utf-8"))

    def test_credentials_stay_separate_and_password_characters_are_unchanged(self) -> None:
        password = '  空 白,"$()`\n\t  '
        parsed = self.parse([
            self.job(email=" email@example.test ", account=" account-name ", password=password),
            self.job(account="account@example.test"),
        ])
        first, second = storage.create_jobs_batch(parsed)
        self.assertEqual(first["email"], "email@example.test")
        self.assertEqual(first["account"], "account-name")
        self.assertEqual(first["password"], password)
        self.assertEqual(second["email"], "")
        self.assertEqual(second["account"], "account@example.test")
        self.assertEqual(second["password"], "")

    def test_missing_optional_fields_use_manual_add_defaults(self) -> None:
        job = self.parse([self.job()])[0]
        for field in ("applied_date", "location", "job_url", "email", "account", "password"):
            self.assertEqual(job[field], "")
        self.assertEqual(job["custom_fields"], {
            "notes": "", "due": "", "category": "", "remote": False,
        })
        self.assertEqual(set(job), set(IMPORT_FIELDS))

    def test_imported_and_manual_jobs_share_record_defaults(self) -> None:
        values = self.parse([self.job(custom_fields={"remote": True})])[0]
        manual = storage.create_job(values)
        imported = storage.create_jobs_batch([values])[0]
        for key in ("id", "created_at", "updated_at"):
            manual.pop(key)
            imported.pop(key)
        self.assertEqual(manual, imported)

    def test_custom_field_types_and_select_options(self) -> None:
        supplied = {"notes": "詳細", "due": "2028-02-29", "category": "研究", "remote": True}
        self.assertEqual(self.parse([self.job(custom_fields=supplied)])[0]["custom_fields"], supplied)
        cases = [
            ("notes", 123), ("notes", None), ("due", "20260901"),
            ("due", "2026-W01-1"), ("due", "2026-02-29"), ("due", " 2026-09-01 "),
            ("category", "unknown"), ("category", 3),
            ("remote", "false"), ("remote", 0), ("remote", 1), ("remote", None),
            ("inactive_field", "anything"), ("not_configured", "anything"),
        ]
        for field, value in cases:
            with self.subTest(field=field, value=value), self.assertRaisesRegex(ValueError, field):
                self.parse([self.job(custom_fields={field: value})])
        for value in ([], None, ""):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "custom_fields"):
                self.parse([self.job(custom_fields=value)])

    def test_only_current_active_status_ids_are_allowed(self) -> None:
        for status_id in ("inactive_status", "Preparing to Apply", "unknown", "", None, 1):
            with self.subTest(status_id=status_id), self.assertRaisesRegex(ValueError, "status_id"):
                self.parse([self.job(status_id=status_id)])
        missing_status = self.job()
        missing_status.pop("status_id")
        with self.assertRaisesRegex(ValueError, "status_id"):
            self.parse([missing_status])
        self.assertEqual(self.parse([self.job(status_id="rejected")])[0]["status_id"], "rejected")

    def test_applied_date_requires_exact_iso_calendar_date(self) -> None:
        for value in ("2026-09-01", "2028-02-29", ""):
            self.assertEqual(self.parse([self.job(applied_date=value)])[0]["applied_date"], value)
        for value in ("20260901", "2026-W01-1", "2026-9-1", "2026-02-30", " 2026-09-01 ", None, 123):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "Job 1: applied_date"):
                self.parse([self.job(applied_date=value)])

    def test_required_company_and_title_and_strict_builtin_types(self) -> None:
        for field in ("company", "job_title"):
            for value in ("", "   "):
                with self.subTest(field=field, value=value), self.assertRaisesRegex(ValueError, field):
                    self.parse([self.job(**{field: value})])
        for field in IMPORT_FIELDS:
            if field == "custom_fields":
                continue
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, field):
                self.parse([self.job(**{field: False})])

    def test_unknown_and_system_owned_fields_are_rejected(self) -> None:
        for field in ("id", "uuid", "created_at", "updated_at", "archived", "application_path", "title"):
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, field):
                self.parse([self.job(**{field: "not allowed"})])
        with self.assertRaisesRegex(ValueError, "unexpected"):
            self.parse([self.job()], unexpected={})

    def test_help_is_ignored_and_cannot_override_current_settings(self) -> None:
        settings_before = copy.deepcopy(self.settings)
        help_text = {"statuses": [{"id": "invented"}], "custom_fields": [{"id": "invented"}]}
        parsed = self.parse([self.job()], _help=help_text)
        self.assertNotIn("_help", storage.create_jobs_batch(parsed)[0])
        with self.assertRaisesRegex(ValueError, "status_id"):
            self.parse([self.job(status_id="invented")], _help=help_text)
        with self.assertRaisesRegex(ValueError, "invented"):
            self.parse([self.job(custom_fields={"invented": "value"})], _help=help_text)
        self.assertEqual(self.settings, settings_before)

    def test_template_uses_current_settings_and_only_blank_values(self) -> None:
        template = build_import_template(self.settings)
        self.assertEqual(set(template["jobs"][0]), set(IMPORT_FIELDS))
        self.assertEqual(template["jobs"][0]["status_id"], "")
        self.assertEqual(template["jobs"][0]["applied_date"], "")
        self.assertNotIn("inactive_status", [status["id"] for status in template["_help"]["statuses"]])
        self.assertNotIn("inactive_field", template["jobs"][0]["custom_fields"])
        for status in template["_help"]["statuses"]:
            self.assertEqual(set(status), {"id", "label", "summary_group"})
        self.settings["statuses"].append({
            "id": "sourced", "label": "已找到", "active": True,
            "summary_group": "pending", "order": 100,
        })
        self.settings["custom_fields"].append({
            "id": "source", "label": "來源", "type": "select", "active": True,
            "options": ["朋友", "公司官網"],
        })
        updated = build_import_template(self.settings)
        self.assertIn("sourced", [status["id"] for status in updated["_help"]["statuses"]])
        self.assertEqual(updated["jobs"][0]["custom_fields"]["source"], "")
        field = next(field for field in updated["_help"]["custom_fields"] if field["id"] == "source")
        self.assertEqual(field["options"], ["朋友", "公司官網"])
        serialized = json.dumps(updated, ensure_ascii=False, indent=2)
        self.assertIn("已找到", serialized)
        self.assertEqual(json.loads(serialized), updated)
        with self.assertRaises(ValueError):
            parse_and_validate_import(serialized, self.settings)

    def test_completed_template_matches_pasted_and_uploaded_utf8(self) -> None:
        template = build_import_template(self.settings)
        template["jobs"][0].update(company="中文公司", job_title="工程師", status_id="planning")
        text = json.dumps(template, ensure_ascii=False, indent=2)
        pasted = parse_and_validate_import(text, self.settings)
        uploaded = parse_and_validate_import(text.encode("utf-8").decode("utf-8"), self.settings)
        self.assertEqual(pasted, uploaded)

    def test_json_shape_and_nonstandard_syntax_are_rejected(self) -> None:
        cases = [
            "", "[]", "null", "{}", '{"jobs": []}', '{"jobs": {}}',
            '{"jobs": [null]}', '{"jobs": [3]}', '{"jobs": ["text"]}',
            '```json\n{"jobs": []}\n```', '{"jobs": [],}', '{// comment\n"jobs": []}',
            '{"jobs": [], "_help": NaN}', '{"jobs": [], "_help": Infinity}',
            '{"jobs": [], "jobs": []}', 'Some text {"jobs": []}',
        ]
        for text in cases:
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse_and_validate_import(text, self.settings)

    def test_save_failure_does_not_claim_success_or_create_job_folders(self) -> None:
        storage.create_job(self.job())
        before = self.jobs_file.read_bytes()
        folders_before = list(self.applications_dir.iterdir())
        parsed = self.parse([self.job(), self.job()])
        with patch.object(storage, "atomic_write_json", side_effect=OSError("Disk full")):
            with self.assertRaisesRegex(OSError, "Disk full"):
                storage.create_jobs_batch(parsed)
        self.assertEqual(self.jobs_file.read_bytes(), before)
        self.assertEqual(list(self.applications_dir.iterdir()), folders_before)

    def test_folder_failure_reports_all_saved_records_without_reimporting(self) -> None:
        storage.ensure_storage()
        parsed = self.parse([self.job(), self.job()])
        with patch.object(storage, "get_job_directory", side_effect=OSError("Folder denied")) as create:
            with self.assertRaises(storage.JobDirectoriesError) as raised:
                storage.create_jobs_batch(parsed)
        self.assertEqual(create.call_count, 2)
        error = raised.exception
        self.assertEqual(len(error.saved_jobs), 2)
        self.assertEqual(error.failed_job_ids, [job["id"] for job in error.saved_jobs])
        self.assertEqual(storage.load_jobs()["jobs"], error.saved_jobs)
        self.assertIn("Do not import these jobs again", str(error))


if __name__ == "__main__":
    unittest.main()
