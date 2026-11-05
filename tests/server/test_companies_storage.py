"""Independent company CSV persistence tests using isolated project directories."""

from __future__ import annotations

import csv
import json
import subprocess
import sys
import tempfile
import unittest
import uuid
import warnings
from datetime import date
from pathlib import Path
from unittest.mock import patch

import storage


class CompanyStorageTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "tracker"
        self.path = self.root / "data" / "companies.csv"
        self.backup = self.root / "backups" / "companies.csv.bak"
        paths = patch.multiple(
            storage,
            PROJECT_ROOT=self.root,
            DATA_DIR=self.root / "data",
            APPLICATIONS_DIR=self.root / "applications",
            BACKUPS_DIR=self.root / "backups",
            JOBS_FILE=self.root / "data" / "jobs.json",
            SETTINGS_FILE=self.root / "data" / "settings.json",
        )
        paths.start()
        self.addCleanup(paths.stop)

    def test_missing_list_and_repeated_reads_do_not_create_records_or_job_files(self) -> None:
        for _ in range(3):
            self.assertEqual(storage.load_companies(), [])
        self.assertFalse(storage.delete_company(str(uuid.uuid4())))
        self.assertFalse(self.root.exists())

    def test_name_only_utf8_csv_round_trip_and_literal_quoting(self) -> None:
        name = '台灣, "科技" Company'
        company = storage.create_company({"company_name": f"  {name}  "})
        self.assertEqual(company["company_name"], name)
        self.assertEqual(company["last_fetched_date"], "")
        self.assertEqual(str(uuid.UUID(company["id"])), company["id"])
        self.assertEqual(storage.load_companies(), [company])
        with self.path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            self.assertEqual(reader.fieldnames, ["id", "company_name", "last_fetched_date"])
            self.assertEqual(list(reader), [company])
        self.assertIn('"台灣, ""科技"" Company"', self.path.read_text(encoding="utf-8"))
        self.assertFalse(storage.JOBS_FILE.exists())
        self.assertFalse(storage.SETTINGS_FILE.exists())
        self.assertFalse(storage.APPLICATIONS_DIR.exists())

    def test_updates_keep_uuid_and_only_change_the_supplied_date(self) -> None:
        original = storage.create_company({"company_name": "Example"})
        company_id = original["id"]
        renamed = storage.update_company(company_id, {"company_name": "中文公司", "id": str(uuid.uuid4())})
        self.assertEqual(renamed["id"], company_id)
        self.assertEqual(renamed["last_fetched_date"], "")
        dated = storage.update_company(company_id, {"last_fetched_date": "2026-09-22"})
        self.assertEqual(dated["id"], company_id)
        renamed = storage.update_company(company_id, {"company_name": "Another"})
        self.assertEqual(renamed["last_fetched_date"], "2026-09-22")
        changed = storage.update_company(company_id, {"last_fetched_date": "2025-01-02"})
        self.assertEqual(changed["last_fetched_date"], "2025-01-02")
        cleared = storage.update_company(company_id, {"last_fetched_date": ""})
        self.assertEqual(cleared["id"], company_id)
        self.assertEqual(storage.load_companies(), [cleared])
        self.assertEqual(cleared["last_fetched_date"], "")

    def test_identical_names_remain_independent_records_identified_by_uuid(self) -> None:
        first = storage.create_company({"company_name": "Same Name"})
        second = storage.create_company({"company_name": "Same Name"})
        self.assertNotEqual(first["id"], second["id"])
        storage.update_company(second["id"], {"last_fetched_date": "2026-01-01"})
        self.assertTrue(storage.delete_company(first["id"]))
        self.assertFalse(storage.delete_company(first["id"]))
        self.assertEqual([row["id"] for row in storage.load_companies()], [second["id"]])
        with self.assertRaises(KeyError):
            storage.update_company(first["id"], {"company_name": "Missing"})

    def test_invalid_values_do_not_change_existing_bytes(self) -> None:
        created = storage.create_company({"company_name": "Existing"})
        before = self.path.read_bytes()
        for updates in (
            {"company_name": " \t\n"}, {"company_name": None},
            {"last_fetched_date": "2026-02-30"}, {"last_fetched_date": "20260922"},
            {"last_fetched_date": "nan"}, {"last_fetched_date": "None"},
            {"last_fetched_date": "2026-09-22T00:00:00"},
        ):
            with self.subTest(updates=updates), self.assertRaises(ValueError):
                storage.update_company(created["id"], updates)
            self.assertEqual(self.path.read_bytes(), before)
        with self.assertRaises(ValueError):
            storage.save_companies([created, created])
        self.assertEqual(self.path.read_bytes(), before)

    def test_none_date_is_saved_as_empty_csv_cell(self) -> None:
        company = storage.create_company({"company_name": "Example", "last_fetched_date": None})
        self.assertEqual(company["last_fetched_date"], "")
        self.assertNotIn("None", self.path.read_text(encoding="utf-8"))

    def test_new_process_loads_same_file_from_another_working_directory(self) -> None:
        company = storage.create_company({"company_name": "重啟, Company", "last_fetched_date": "2026-01-02"})
        other_cwd = self.root / "other-cwd"
        other_cwd.mkdir()
        script = """
import json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import storage
root = Path(sys.argv[2])
storage.PROJECT_ROOT = root
storage.DATA_DIR = root / 'data'
storage.BACKUPS_DIR = root / 'backups'
storage.APPLICATIONS_DIR = root / 'applications'
storage.JOBS_FILE = root / 'data' / 'jobs.json'
storage.SETTINGS_FILE = root / 'data' / 'settings.json'
print(json.dumps(storage.load_companies()))
"""
        completed = subprocess.run(
            [sys.executable, "-c", script, str(Path(storage.__file__).parent), str(self.root)],
            cwd=other_cwd, check=True, capture_output=True, text=True,
        )
        self.assertEqual(json.loads(completed.stdout), [company])
        self.assertFalse((other_cwd / "data").exists())

    def test_company_and_job_mutations_are_completely_independent(self) -> None:
        job = storage.create_job({"company": "Same Company", "job_title": "Role"})
        job_bytes = storage.JOBS_FILE.read_bytes()
        company = storage.create_company({"company_name": "Same Company"})
        storage.update_company(company["id"], {"company_name": "Renamed", "last_fetched_date": "2026-09-01"})
        storage.delete_company(company["id"])
        self.assertEqual(storage.JOBS_FILE.read_bytes(), job_bytes)
        company = storage.create_company({"company_name": "Same Company"})
        company_bytes = self.path.read_bytes()
        storage.update_job(job["id"], {"company": "Different Job Company"})
        storage.create_jobs_batch([{"company": "Imported", "job_title": "New Role"}])
        storage.delete_job(job["id"])
        self.assertEqual(self.path.read_bytes(), company_bytes)
        self.assertEqual(storage.load_companies(), [company])

    def test_corruption_without_usable_backup_blocks_all_writes(self) -> None:
        self.path.parent.mkdir(parents=True)
        valid_id = str(uuid.uuid4())
        for broken in (
            b"", b"company_name,last_fetched_date\nExample,\n",
            f"id,company_name,last_fetched_date\n{valid_id},Missing date cell\n".encode(),
            f"id,company_name,last_fetched_date\n{valid_id},Extra,,column\n".encode(),
            f'id,company_name,last_fetched_date\n{valid_id},"Unclosed,\n'.encode(),
            f"id,company_name,last_fetched_date\n{valid_id},Invalid date,nan\n".encode(),
            b"id,company_name,last_fetched_date\nnot-a-uuid,Name,\n",
            b"id,company_name,last_fetched_date\n\xff\n",
        ):
            self.path.write_bytes(broken)
            for action in (
                storage.load_companies,
                lambda: storage.save_companies([]),
                lambda: storage.create_company({"company_name": "New"}),
                lambda: storage.update_company(valid_id, {"company_name": "New"}),
                lambda: storage.delete_company(valid_id),
            ):
                with self.subTest(broken=broken, action=action), self.assertRaises(storage.CorruptStorageError):
                    action()
                self.assertEqual(self.path.read_bytes(), broken)

    def test_recovery_keeps_the_last_usable_backup_on_next_save(self) -> None:
        original = storage.create_company({"company_name": "Existing"})
        storage.update_company(original["id"], {"company_name": "Changed"})
        good_backup = self.backup.read_bytes()
        self.path.write_text("broken csv", encoding="utf-8")
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            self.assertEqual(storage.load_companies(), [original])
            storage.update_company(original["id"], {"company_name": "Recovered"})
        self.assertTrue(any(item.category is storage.StorageRecoveryWarning for item in caught))
        self.assertEqual(self.backup.read_bytes(), good_backup)
        self.assertEqual(storage.load_companies()[0]["company_name"], "Recovered")

    def test_missing_primary_loads_backup_and_bad_backup_raises(self) -> None:
        original = storage.create_company({"company_name": "Existing"})
        storage.update_company(original["id"], {"company_name": "Changed"})
        self.path.unlink()
        with self.assertWarns(storage.StorageRecoveryWarning):
            self.assertEqual(storage.load_companies(), [original])
        self.backup.write_text("damaged backup", encoding="utf-8")
        with self.assertRaises(storage.CorruptStorageError):
            storage.save_companies([])
        self.assertFalse(self.path.exists())
        self.assertEqual(self.backup.read_text(encoding="utf-8"), "damaged backup")

    def test_permission_error_is_not_treated_as_an_empty_list(self) -> None:
        storage.create_company({"company_name": "Existing"})
        before = self.path.read_bytes()
        read_csv = storage._read_companies_csv

        def unreadable_primary(path: Path) -> list[dict[str, str]]:
            if path.resolve() == self.path.resolve():
                raise PermissionError("Unreadable company file")
            return read_csv(path)

        with patch.object(storage, "_read_companies_csv", side_effect=unreadable_primary):
            with self.assertRaises(storage.CorruptStorageError):
                storage.load_companies()
            with self.assertRaises(storage.CorruptStorageError):
                storage.save_companies([])
        self.assertEqual(self.path.read_bytes(), before)

    def test_failed_atomic_replace_preserves_primary(self) -> None:
        original = storage.create_company({"company_name": "Existing"})
        before = self.path.read_bytes()
        real_replace = storage.os.replace

        def replace(source: Path, destination: Path) -> None:
            if destination.resolve() == self.path.resolve():
                raise OSError("Simulated disk failure")
            real_replace(source, destination)

        with patch.object(storage.os, "replace", side_effect=replace), self.assertRaises(OSError):
            storage.update_company(original["id"], {"company_name": "Changed"})
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(storage.load_companies(), [original])
        self.assertFalse(self.path.with_suffix(".csv.tmp").exists())

    def test_symlink_primary_or_backup_is_rejected(self) -> None:
        self.path.parent.mkdir(parents=True)
        self.backup.parent.mkdir()
        outside = self.root / "outside.csv"
        outside.write_text("Leave untouched", encoding="utf-8")
        for target in (self.path, self.backup):
            target.symlink_to(outside)
            with self.subTest(target=target), self.assertRaises(ValueError):
                storage.create_company({"company_name": "Example"})
            target.unlink()
        self.assertEqual(outside.read_text(encoding="utf-8"), "Leave untouched")

    def test_reading_columns_is_read_only_and_legacy_settings_default_to_empty(self) -> None:
        self.assertEqual(storage.load_company_columns(), [])
        self.assertFalse(self.root.exists())
        storage.SETTINGS_FILE.parent.mkdir(parents=True)
        storage.SETTINGS_FILE.write_text('{"schema_version": 1, "custom_fields": []}', encoding="utf-8")
        original = storage.SETTINGS_FILE.read_bytes()
        self.assertEqual(storage.load_company_columns(), [])
        self.assertEqual(storage.SETTINGS_FILE.read_bytes(), original)
        self.assertFalse(storage.JOBS_FILE.exists())

    def test_column_creation_upgrades_header_and_keeps_existing_uuid_values(self) -> None:
        original = storage.create_company({"company_name": "原有公司", "last_fetched_date": "2026-02-01"})
        first = storage.add_company_column("  國家 Country  ")
        self.assertEqual(first["label"], "國家 Country")
        self.assertEqual(first["type"], "text")
        self.assertEqual(first["options"], [])
        self.assertTrue(first["id"].startswith("custom_"))
        self.assertEqual(storage.load_companies(), [{**original, first["id"]: ""}])
        storage.update_company(original["id"], {first["id"]: "台灣"})
        second = storage.add_company_column("Checked", "checkbox")
        self.assertEqual(storage.load_company_columns(), [first, second])
        self.assertEqual(storage.load_companies(), [{**original, first["id"]: "台灣", second["id"]: False}])
        with self.path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            self.assertEqual(reader.fieldnames, ["id", "company_name", "last_fetched_date", first["id"], second["id"]])
            row = next(reader)
            self.assertEqual(row[first["id"]], "台灣")
            self.assertEqual(row[second["id"]], "false")
        self.assertFalse(storage.JOBS_FILE.exists())
        self.assertFalse(storage.APPLICATIONS_DIR.exists())

    def test_all_column_types_round_trip_in_csv_and_new_process(self) -> None:
        text = storage.add_company_column("Notes")
        dated = storage.add_company_column("Reminder", "date")
        select = storage.add_company_column("Region", "select", " 台灣 \n\n Canada \n   \n日本")
        checkbox = storage.add_company_column("Done", "checkbox")
        self.assertEqual(select["options"], ["台灣", "Canada", "日本"])
        empty = storage.create_company({"company_name": "Empty"})
        self.assertEqual([empty[column["id"]] for column in (text, dated, select, checkbox)], ["", "", "", False])
        company = storage.create_company({
            "company_name": "Complete", text["id"]: 'Line 1, "quoted"\nLine 2',
            dated["id"]: date(2026, 9, 23), select["id"]: "日本", checkbox["id"]: True,
        })
        self.assertEqual(company[dated["id"]], "2026-09-23")
        self.assertEqual(storage.load_companies(), [empty, company])
        script = """
import json, sys
from pathlib import Path
import storage
root = Path(sys.argv[1])
storage.PROJECT_ROOT = root
storage.DATA_DIR = root / 'data'
storage.BACKUPS_DIR = root / 'backups'
storage.APPLICATIONS_DIR = root / 'applications'
storage.JOBS_FILE = root / 'data' / 'jobs.json'
storage.SETTINGS_FILE = root / 'data' / 'settings.json'
print(json.dumps([storage.load_company_columns(), storage.load_companies()]))
"""
        completed = subprocess.run(
            [sys.executable, "-c", script, str(self.root)],
            cwd=Path(storage.__file__).resolve().parent,
            check=True, capture_output=True, text=True,
        )
        self.assertEqual(json.loads(completed.stdout), [[text, dated, select, checkbox], [empty, company]])
        with self.path.open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(rows[0][dated["id"]], "")
        self.assertEqual(rows[0][select["id"]], "")
        self.assertEqual(rows[0][checkbox["id"]], "false")
        self.assertEqual(rows[1][checkbox["id"]], "true")

    def test_checkbox_conversion_is_explicit_and_missing_values_remain_empty(self) -> None:
        checkbox = storage.add_company_column("Enabled", "checkbox")
        dated = storage.add_company_column("Date", "date")
        text = storage.add_company_column("Notes")
        company = storage.create_company({"company_name": "Example"})
        for value in (False, "false", "FALSE", "0", "no", "off", "", None, 0, float("nan")):
            with self.subTest(value=value):
                changed = storage.update_company(company["id"], {checkbox["id"]: value})
                self.assertIs(changed[checkbox["id"]], False)
                self.assertIs(storage.load_companies()[0][checkbox["id"]], False)
        for value in (True, "true", " TRUE ", "1", "yes", "on", 1):
            with self.subTest(value=value):
                self.assertIs(storage.update_company(company["id"], {checkbox["id"]: value})[checkbox["id"]], True)
        before = self.path.read_bytes()
        with self.assertRaises(ValueError):
            storage.update_company(company["id"], {checkbox["id"]: "maybe"})
        self.assertEqual(self.path.read_bytes(), before)
        storage.update_company(company["id"], {dated["id"]: float("nan"), text["id"]: None})
        self.assertNotIn("nan", self.path.read_text(encoding="utf-8"))
        self.assertNotIn("None", self.path.read_text(encoding="utf-8"))

    def test_old_csv_missing_schema_columns_and_cells_get_type_defaults(self) -> None:
        original = storage.create_company({"company_name": "Legacy", "last_fetched_date": "2026-01-01"})
        legacy_csv = self.path.read_bytes()
        columns = [storage.add_company_column(label, kind, choices) for label, kind, choices in (
            ("Text", "text", []), ("Date", "date", []),
            ("Select", "select", ["First", "Second"]), ("Checked", "checkbox", []),
        )]
        expected = {**original, **{column["id"]: False if column["type"] == "checkbox" else "" for column in columns}}
        self.path.write_bytes(legacy_csv)
        self.assertEqual(storage.load_companies(), [expected])
        with self.path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["id", "company_name", "last_fetched_date", *(column["id"] for column in columns)])
            writer.writerow([original["id"], original["company_name"], original["last_fetched_date"]])
        self.assertEqual(storage.load_companies(), [expected])

    def test_invalid_column_definitions_never_change_files(self) -> None:
        storage.create_company({"company_name": "Existing"})
        storage.add_company_column("Existing 欄位")
        before_csv = self.path.read_bytes()
        before_settings = storage.SETTINGS_FILE.read_bytes()
        for label, kind, choices in (
            ("", "text", []), ("  ", "text", []), (" Company Name ", "text", []),
            ("last fetched date", "date", []), ("id", "text", []), ("company_name", "text", []),
            (" Existing 欄位 ", "text", []), ("Select", "select", ["", "  "]),
            ("Bad", "number", []),
        ):
            with self.subTest(label=label), self.assertRaises(ValueError):
                storage.add_company_column(label, kind, choices)
            self.assertEqual(self.path.read_bytes(), before_csv)
            self.assertEqual(storage.SETTINGS_FILE.read_bytes(), before_settings)

    def test_partial_saves_preserve_custom_values_and_unrepresented_columns(self) -> None:
        column = storage.add_company_column("Notes")
        first = storage.create_company({"company_name": "First", column["id"]: "One", "custom_legacy": "Kept"})
        second = storage.create_company({"company_name": "Second", column["id"]: "Two"})
        storage.save_companies([
            {"id": first["id"], "company_name": "Renamed", "last_fetched_date": "2026-01-01"},
            {"id": second["id"], "company_name": "Second", "last_fetched_date": ""},
        ])
        records = storage.load_companies()
        self.assertEqual(records[0][column["id"]], "One")
        self.assertEqual(records[0]["custom_legacy"], "Kept")
        self.assertEqual(records[1][column["id"]], "Two")
        storage.update_company(second["id"], {column["id"]: "Changed"})
        self.assertEqual(storage.load_companies()[0][column["id"]], "One")
        storage.delete_company(first["id"])
        storage.delete_company(second["id"])
        storage.save_companies([])
        with self.path.open(encoding="utf-8", newline="") as handle:
            self.assertIn("custom_legacy", csv.DictReader(handle).fieldnames)

    def test_company_columns_do_not_change_job_custom_fields_or_import_template(self) -> None:
        from import_jobs import build_import_template

        settings = storage.load_settings()
        settings["custom_fields"] = [{
            "id": "job_only", "label": "Job Only", "type": "text", "options": [],
            "show_in_table": True, "order": 10, "active": True,
        }]
        storage.save_settings(settings)
        job = storage.create_job({"company": "Job", "job_title": "Role", "custom_fields": {"job_only": "Preserved"}})
        job_bytes = storage.JOBS_FILE.read_bytes()
        template_before = build_import_template(settings)
        storage.add_company_column("Company Only", "select", ["Option"])
        current = storage.load_settings()
        self.assertEqual(current["custom_fields"], settings["custom_fields"])
        self.assertEqual(current["statuses"], settings["statuses"])
        self.assertEqual(storage.JOBS_FILE.read_bytes(), job_bytes)
        self.assertEqual(storage.get_job_by_id(job["id"])["custom_fields"], {"job_only": "Preserved"})
        self.assertEqual(build_import_template(current), template_before)

    def test_add_column_write_failures_are_propagated_without_publishing_definition(self) -> None:
        original = storage.create_company({"company_name": "Existing"})
        before = self.path.read_bytes()
        with patch.object(storage, "save_companies", side_effect=OSError("CSV full")), self.assertRaisesRegex(OSError, "CSV full"):
            storage.add_company_column("Failed")
        self.assertEqual(storage.load_company_columns(), [])
        self.assertEqual(self.path.read_bytes(), before)
        with patch.object(storage, "save_settings", side_effect=OSError("Settings full")), self.assertRaisesRegex(OSError, "Settings full"):
            storage.add_company_column("Failed")
        self.assertEqual(storage.load_company_columns(), [])
        self.assertEqual({key: storage.load_companies()[0][key] for key in original}, original)
        added = storage.add_company_column("Retry")
        self.assertEqual(storage.load_company_columns(), [added])

    def test_invalid_custom_values_do_not_change_csv(self) -> None:
        dated = storage.add_company_column("Custom Date", "date")
        select = storage.add_company_column("Choice", "select", ["One"])
        company = storage.create_company({"company_name": "Example"})
        before = self.path.read_bytes()
        for values in ({dated["id"]: "2026-02-30"}, {dated["id"]: "20260923"}, {select["id"]: "Other"}):
            with self.subTest(values=values), self.assertRaises(ValueError):
                storage.update_company(company["id"], values)
            self.assertEqual(self.path.read_bytes(), before)

    def test_renaming_keeps_column_identity_position_and_company_values(self) -> None:
        first = storage.add_company_column("First")
        second = storage.add_company_column("Second", "date")
        company = storage.create_company({"company_name": "Original", first["id"]: "保留", second["id"]: "2026-09-23"})
        csv_before = self.path.read_bytes()
        changed = storage.update_company_column(first["id"], "  新名稱 Renamed  ")
        self.assertEqual(changed, {**first, "label": "新名稱 Renamed"})
        self.assertEqual(storage.load_company_columns(), [changed, second])
        self.assertEqual(storage.load_companies(), [company])
        self.assertEqual(self.path.read_bytes(), csv_before)
        self.assertFalse(storage.JOBS_FILE.exists())

    def test_type_conversions_validate_and_keep_meaningful_values(self) -> None:
        first = storage.create_company({"company_name": "First"})
        second = storage.create_company({"company_name": "Second"})
        cases = (
            ("text", [], "2026-09-23", "", "date", [], "2026-09-23", ""),
            ("text", [], "false", "yes", "checkbox", [], False, True),
            ("text", [], "", "", "checkbox", [], False, False),
            ("checkbox", [], False, True, "text", [], "false", "true"),
            ("checkbox", [], False, True, "select", ["true", "false"], "false", "true"),
            ("date", [], "2026-09-23", "", "text", [], "2026-09-23", ""),
            ("text", [], "One", "", "select", ["One", "Two"], "One", ""),
            ("select", ["yes", "no"], "no", "yes", "checkbox", [], False, True),
            ("select", ["2026-09-23"], "2026-09-23", "", "date", [], "2026-09-23", ""),
            ("select", ["One", "Two"], "One", "Two", "text", [], "One", "Two"),
        )
        for source_type, source_options, first_value, second_value, target_type, target_options, expected_first, expected_second in cases:
            with self.subTest(source=source_type, target=target_type, first=first_value):
                column = storage.add_company_column("Convertible", source_type, source_options)
                storage.update_company(first["id"], {column["id"]: first_value})
                storage.update_company(second["id"], {column["id"]: second_value})
                changed = storage.update_company_column(column["id"], "Converted", target_type, target_options)
                self.assertEqual(changed["id"], column["id"])
                self.assertEqual(changed["type"], target_type)
                records = storage.load_companies()
                self.assertEqual([row["id"] for row in records], [first["id"], second["id"]])
                self.assertEqual([row[column["id"]] for row in records], [expected_first, expected_second])
                storage.delete_company_column(column["id"])

    def test_invalid_conversion_checks_every_company_without_modifying_any_file(self) -> None:
        column = storage.add_company_column("Candidate")
        storage.create_company({"company_name": "Valid first", column["id"]: "2026-09-23"})
        storage.create_company({"company_name": "Invalid second", column["id"]: "not a date"})
        snapshots = {path: path.read_bytes() if path.exists() else None for path in (self.path, storage.SETTINGS_FILE, self.backup, storage._backup_path_for(storage.SETTINGS_FILE))}
        with self.assertRaisesRegex(ValueError, "Invalid second.*YYYY-MM-DD"):
            storage.update_company_column(column["id"], "Date", "date")
        for path, content in snapshots.items():
            self.assertEqual(path.read_bytes() if path.exists() else None, content)
        with self.assertRaisesRegex(ValueError, "Valid first.*true or false"):
            storage.update_company_column(column["id"], "Checkbox", "checkbox")
        for path, content in snapshots.items():
            self.assertEqual(path.read_bytes() if path.exists() else None, content)

    def test_select_option_edits_keep_order_and_refuse_removing_a_used_option(self) -> None:
        column = storage.add_company_column("Choice", "select", ["One", "Two", "Unused"])
        company = storage.create_company({"company_name": "Uses Two", column["id"]: "Two"})
        changed = storage.update_company_column(column["id"], "Choice", "select", " Two \n\n One \nNew ")
        self.assertEqual(changed["options"], ["Two", "One", "New"])
        self.assertEqual(storage.load_companies(), [company])
        csv_before = self.path.read_bytes()
        settings_before = storage.SETTINGS_FILE.read_bytes()
        with self.assertRaisesRegex(ValueError, "Uses Two.*configured options"):
            storage.update_company_column(column["id"], "Choice", "select", ["One", "New"])
        self.assertEqual(self.path.read_bytes(), csv_before)
        self.assertEqual(storage.SETTINGS_FILE.read_bytes(), settings_before)

    def test_invalid_column_edits_and_builtin_deletion_leave_files_unchanged(self) -> None:
        first = storage.add_company_column("First")
        storage.add_company_column("Second")
        csv_before = self.path.read_bytes()
        settings_before = storage.SETTINGS_FILE.read_bytes()
        for label, kind, choices in (("", "text", []), ("Second", "text", []), ("Company Name", "text", []), ("New", "number", []), ("Select", "select", [])):
            with self.subTest(label=label), self.assertRaises(ValueError):
                storage.update_company_column(first["id"], label, kind, choices)
        for column_id in ("company_name", "last_fetched_date", "id", "custom_missing"):
            self.assertFalse(storage.delete_company_column(column_id))
            with self.assertRaises(KeyError):
                storage.update_company_column(column_id, "New")
        self.assertEqual(self.path.read_bytes(), csv_before)
        self.assertEqual(storage.SETTINGS_FILE.read_bytes(), settings_before)

    def test_column_deletion_removes_csv_values_but_preserves_other_and_unknown_columns(self) -> None:
        first = storage.add_company_column("Keep")
        removed = storage.add_company_column("Remove", "checkbox")
        third = storage.add_company_column("Also keep", "date")
        company = storage.create_company({
            "company_name": "Independent", "last_fetched_date": "2026-09-01", first["id"]: "value", removed["id"]: True,
            third["id"]: "2026-09-23", "custom_unrepresented": "hidden value",
        })
        self.assertTrue(storage.delete_company_column(removed["id"]))
        self.assertFalse(storage.delete_company_column(removed["id"]))
        self.assertEqual(storage.load_company_columns(), [first, third])
        expected = {key: value for key, value in company.items() if key != removed["id"]}
        self.assertEqual(storage.load_companies(), [expected])
        with self.path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            self.assertEqual(reader.fieldnames, ["id", "company_name", "last_fetched_date", first["id"], third["id"], "custom_unrepresented"])
        self.assertIn(removed["id"], self.backup.read_text(encoding="utf-8"))
        storage.update_company(company["id"], {"company_name": "Renamed"})
        self.assertNotIn(removed["id"], storage.load_companies()[0])

    def test_column_deletion_with_no_companies_still_removes_csv_header(self) -> None:
        removed = storage.add_company_column("Remove")
        self.assertTrue(storage.delete_company_column(removed["id"]))
        self.assertEqual(storage.load_company_columns(), [])
        self.assertEqual(storage.load_companies(), [])
        self.assertEqual(self.path.read_text(encoding="utf-8").strip(), "id,company_name,last_fetched_date")
        self.assertIn(removed["id"], self.backup.read_text(encoding="utf-8"))

    def test_column_edit_and_delete_write_failures_restore_both_files_exactly(self) -> None:
        column = storage.add_company_column("Choice", "select", ["yes", "no"])
        company = storage.create_company({"company_name": "Existing", column["id"]: "yes"})
        original_csv = self.path.read_bytes()
        original_settings = storage.SETTINGS_FILE.read_bytes()
        real_replace = storage.os.replace
        actions = (
            lambda: storage.update_company_column(column["id"], "Enabled", "checkbox"),
            lambda: storage.delete_company_column(column["id"]),
        )
        for action in actions:
            for failed_path in (self.path, storage.SETTINGS_FILE):
                def replace(source: Path, destination: Path) -> None:
                    if destination.resolve() == failed_path.resolve():
                        raise OSError(f"Simulated failure: {failed_path.name}")
                    real_replace(source, destination)
                with self.subTest(action=action, failed=failed_path.name), patch.object(storage.os, "replace", side_effect=replace), self.assertRaisesRegex(OSError, "Simulated failure"):
                    action()
                self.assertEqual(self.path.read_bytes(), original_csv)
                self.assertEqual(storage.SETTINGS_FILE.read_bytes(), original_settings)
                self.assertEqual(storage.load_company_columns(), [column])
                self.assertEqual(storage.load_companies(), [company])
                self.assertEqual(self.backup.read_bytes(), original_csv)
                self.assertFalse(self.path.with_suffix(".csv.tmp").exists())
                self.assertFalse(storage.SETTINGS_FILE.with_suffix(".json.tmp").exists())

    def test_edited_schema_and_deleted_values_survive_restart_without_changing_jobs(self) -> None:
        from import_jobs import build_import_template

        settings = storage.load_settings()
        settings["custom_fields"] = [{"id": "job_only", "label": "Job Only", "type": "text"}]
        storage.save_settings(settings)
        settings = storage.load_settings()
        template = build_import_template(settings)
        storage.create_job({"company": "Job", "job_title": "Role", "custom_fields": {"job_only": "Saved"}})
        job_bytes = storage.JOBS_FILE.read_bytes()
        keep = storage.add_company_column("Keep")
        remove = storage.add_company_column("Remove")
        company = storage.create_company({"company_name": "Company", keep["id"]: "false", remove["id"]: "Delete me"})
        updated = storage.update_company_column(keep["id"], "Boolean", "checkbox")
        storage.delete_company_column(remove["id"])
        current = storage.load_settings()
        self.assertEqual(storage.JOBS_FILE.read_bytes(), job_bytes)
        self.assertEqual(current["custom_fields"], settings["custom_fields"])
        self.assertEqual(build_import_template(current), template)
        script = """
import json, sys
from pathlib import Path
import storage
root = Path(sys.argv[1])
storage.PROJECT_ROOT = root
storage.DATA_DIR = root / 'data'
storage.BACKUPS_DIR = root / 'backups'
storage.APPLICATIONS_DIR = root / 'applications'
storage.JOBS_FILE = root / 'data' / 'jobs.json'
storage.SETTINGS_FILE = root / 'data' / 'settings.json'
print(json.dumps([storage.load_company_columns(), storage.load_companies()]))
"""
        result = subprocess.run(
            [sys.executable, "-c", script, str(self.root)],
            cwd=Path(storage.__file__).resolve().parent,
            check=True, capture_output=True, text=True,
        )
        expected = {key: value for key, value in company.items() if key != remove["id"]}
        expected[keep["id"]] = False
        self.assertEqual(json.loads(result.stdout), [[updated], [expected]])


if __name__ == "__main__":
    unittest.main()
