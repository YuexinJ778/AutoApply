"""Standard-library tests for the local resume workspace."""

from __future__ import annotations

import hashlib
from concurrent.futures import ThreadPoolExecutor
import subprocess
import tempfile
from threading import Event
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import storage


class ResumeWorkspaceTests(unittest.TestCase):
    PDF_ONE = b"%PDF-1.7\nfirst compiled PDF\n%%EOF\n"
    PDF_TWO = b"%PDF-1.7\nsecond PDF version\n%%EOF\n"

    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.root = Path(self.temporary_directory.name) / "portable_job_tracker"
        self.data_dir = self.root / "data"
        self.applications_dir = self.root / "applications"
        self.backups_dir = self.root / "backups"
        self.jobs_file = self.data_dir / "jobs.json"
        self.settings_file = self.data_dir / "settings.json"
        self.path_patch = patch.multiple(
            storage,
            PROJECT_ROOT=self.root,
            DATA_DIR=self.data_dir,
            APPLICATIONS_DIR=self.applications_dir,
            BACKUPS_DIR=self.backups_dir,
            JOBS_FILE=self.jobs_file,
            SETTINGS_FILE=self.settings_file,
        )
        self.path_patch.start()
        self.addCleanup(self.path_patch.stop)
        self.job = storage.create_job(self.job_data())
        self.job_id = self.job["id"]

    @staticmethod
    def job_data() -> dict[str, object]:
        return {
            "status_id": "applied",
            "applied_date": "2026-09-01",
            "company": "Example Company",
            "job_title": "Quantitative Analyst",
            "location": "Chicago, IL",
            "job_url": "https://example.com/job/123",
            "account": "demo.applicant@example.com",
            "password": "plain-text-password",
            "custom_fields": {},
            "archived": False,
        }

    @staticmethod
    def successful_pdflatex(
        pdf_data: bytes,
        *,
        log_text: str = "BUILD LOG: compilation succeeded",
    ):
        def run(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
            output_argument = next(
                item for item in command if item.startswith("-output-directory=")
            )
            output_directory = Path(output_argument.split("=", 1)[1])
            output_directory.mkdir(parents=True, exist_ok=True)
            (output_directory / "resume.pdf").write_bytes(pdf_data)
            (output_directory / "resume.log").write_text(log_text, encoding="utf-8")
            return subprocess.CompletedProcess(
                command,
                0,
                stdout="PDFLATEX STDOUT: compilation succeeded",
                stderr="",
            )

        return run

    @staticmethod
    def failing_pdflatex(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        output_argument = next(
            item for item in command if item.startswith("-output-directory=")
        )
        output_directory = Path(output_argument.split("=", 1)[1])
        output_directory.mkdir(parents=True, exist_ok=True)
        # Even a PDF-shaped partial output from a failed process must not replace preview.pdf.
        (output_directory / "resume.pdf").write_bytes(
            b"%PDF-1.7\nfailed partial output\n%%EOF\n"
        )
        (output_directory / "resume.log").write_text(
            "BUILD LOG: fatal LaTeX error", encoding="utf-8"
        )
        return subprocess.CompletedProcess(
            command,
            1,
            stdout="PDFLATEX STDOUT: fatal LaTeX error",
            stderr="",
        )

    def assert_safe_pdflatex_call(self, run_mock: object) -> None:
        run_mock.assert_called_once()
        command = run_mock.call_args.args[0]
        keyword_arguments = run_mock.call_args.kwargs
        output_arguments = [
            item for item in command if item.startswith("-output-directory=")
        ]
        self.assertEqual(len(output_arguments), 1)
        self.assertEqual(
            command,
            [
                "/mock/pdflatex",
                "-interaction=nonstopmode",
                "-halt-on-error",
                "-no-shell-escape",
                output_arguments[0],
                str(Path(output_arguments[0].split("=", 1)[1]) / "resume.tex"),
            ],
        )

        job_directory = storage.get_job_directory(self.job_id)
        raw_output_directory = Path(output_arguments[0].split("=", 1)[1])
        if raw_output_directory.is_absolute():
            output_directory = raw_output_directory.resolve()
        else:
            output_directory = (job_directory / raw_output_directory).resolve()
        build_directory = (job_directory / "build").resolve()
        self.assertTrue(
            output_directory == build_directory
            or build_directory in output_directory.parents
        )
        self.assertEqual(Path(keyword_arguments["cwd"]).resolve(), job_directory)
        self.assertIs(keyword_arguments["capture_output"], True)
        self.assertIs(keyword_arguments["text"], True)
        self.assertEqual(keyword_arguments["timeout"], 30)
        self.assertIs(keyword_arguments["shell"], False)

    def compile_successfully(self, source: str, pdf_data: bytes) -> dict[str, object]:
        with (
            patch("storage.find_pdflatex", return_value="/mock/pdflatex"),
            patch(
                "storage.subprocess.run",
                side_effect=self.successful_pdflatex(pdf_data),
            ),
        ):
            return storage.compile_resume_latex(self.job_id, source)

    def test_find_pdflatex_uses_path_lookup(self) -> None:
        with patch("storage.shutil.which", return_value="/opt/tex/bin/pdflatex"):
            self.assertEqual(storage.find_pdflatex(), "/opt/tex/bin/pdflatex")

    def test_compile_success_uses_safe_command_and_updates_preview_only(self) -> None:
        source = "\\documentclass{article}\n\\begin{document}Hello\\end{document}\n"
        compiled_at = "2026-09-02T14:35:20+00:00"
        with (
            patch("storage.find_pdflatex", return_value="/mock/pdflatex"),
            patch(
                "storage.subprocess.run",
                side_effect=self.successful_pdflatex(self.PDF_ONE),
            ) as run_mock,
            patch("storage._utc_now", return_value=compiled_at),
        ):
            status = storage.compile_resume_latex(self.job_id, source)

        self.assert_safe_pdflatex_call(run_mock)
        job_directory = storage.get_job_directory(self.job_id)
        self.assertEqual(
            storage.load_text_file(job_directory / "resume.tex"), source
        )
        self.assertIs(status["success"], True)
        self.assertEqual(status["return_code"], 0)
        self.assertEqual(status["compiled_at"], compiled_at)
        self.assertEqual(
            status["source_hash"], hashlib.sha256(source.encode("utf-8")).hexdigest()
        )
        self.assertIs(storage.load_compile_status(self.job_id)["success"], True)
        self.assertIn("compilation succeeded", storage.load_compile_log(self.job_id))
        self.assertEqual(storage.load_compiled_preview(self.job_id), self.PDF_ONE)
        self.assertEqual(storage.list_pdf_versions(self.job_id), [])

        saved = storage.save_compiled_pdf_version(self.job_id, "Compiled Resume")
        self.assertEqual(saved["source"], "compiled")
        self.assertEqual(storage.load_pdf_version(self.job_id, saved["id"]), self.PDF_ONE)

    def test_failed_compile_preserves_last_successful_preview(self) -> None:
        first_status = self.compile_successfully("first source", self.PDF_ONE)

        with (
            patch("storage.find_pdflatex", return_value="/mock/pdflatex"),
            patch("storage.subprocess.run", side_effect=self.failing_pdflatex),
        ):
            status = storage.compile_resume_latex(self.job_id, "broken source")

        self.assertIs(status["success"], False)
        self.assertEqual(status["return_code"], 1)
        self.assertEqual(status["compiled_at"], first_status["compiled_at"])
        self.assertEqual(
            status["preview_source_hash"], first_status["preview_source_hash"]
        )
        self.assertEqual(storage.load_compiled_preview(self.job_id), self.PDF_ONE)
        self.assertIn("fatal LaTeX error", storage.load_compile_log(self.job_id))
        self.assertEqual(
            storage.load_text_file(
                storage.get_job_directory(self.job_id) / "resume.tex"
            ),
            "broken source",
        )

    def test_compile_timeout_preserves_last_successful_preview(self) -> None:
        self.compile_successfully("first source", self.PDF_ONE)
        timeout = subprocess.TimeoutExpired(
            cmd=["/mock/pdflatex"],
            timeout=30,
            output="OUTPUT BEFORE TIMEOUT",
            stderr="",
        )

        with (
            patch("storage.find_pdflatex", return_value="/mock/pdflatex"),
            patch("storage.subprocess.run", side_effect=timeout),
        ):
            status = storage.compile_resume_latex(self.job_id, "slow source")

        self.assertIs(status["success"], False)
        self.assertEqual(storage.load_compiled_preview(self.job_id), self.PDF_ONE)
        log = storage.load_compile_log(self.job_id).lower()
        self.assertTrue("timeout" in log or "timed out" in log)

    def test_jobs_remain_readable_and_writable_while_pdflatex_runs(self) -> None:
        entered, release = Event(), Event()
        compile_pdf = self.successful_pdflatex(self.PDF_ONE)

        def paused_compile(command, **kwargs):
            entered.set()
            self.assertTrue(release.wait(timeout=10))
            self.assertEqual(Path(command[-1]).read_text(encoding="utf-8"), "source")
            return compile_pdf(command, **kwargs)

        def edit_job():
            self.assertEqual(storage.get_job_by_id(self.job_id)["company"], "Example Company")
            storage.save_text_file(storage.get_job_directory(self.job_id) / "resume.tex", "new source")
            return storage.update_job(self.job_id, {"location": "Remote"})

        with (
            patch("storage.find_pdflatex", return_value="/mock/pdflatex"),
            patch("storage.subprocess.run", side_effect=paused_compile),
            ThreadPoolExecutor(max_workers=2) as pool,
        ):
            compiled = pool.submit(storage.compile_resume_latex, self.job_id, "source")
            try:
                self.assertTrue(entered.wait(timeout=5))
                edited = pool.submit(edit_job).result(timeout=3)
                self.assertEqual(edited["location"], "Remote")
                self.assertFalse(compiled.done())
            finally:
                release.set()
            self.assertTrue(compiled.result(timeout=5)["success"])
        self.assertEqual(
            storage.load_text_file(storage.get_job_directory(self.job_id) / "resume.tex"),
            "new source",
        )

    def test_deleted_job_is_not_recreated_when_compilation_finishes(self) -> None:
        entered, release = Event(), Event()
        job_directory = storage.get_job_directory(self.job_id)

        def paused_compile(command, **kwargs):
            entered.set()
            self.assertTrue(release.wait(timeout=10))
            return subprocess.CompletedProcess(command, 1, stdout="", stderr="Job removed")

        with (
            patch("storage.find_pdflatex", return_value="/mock/pdflatex"),
            patch("storage.subprocess.run", side_effect=paused_compile),
            ThreadPoolExecutor(max_workers=2) as pool,
        ):
            compiled = pool.submit(storage.compile_resume_latex, self.job_id, "source")
            try:
                self.assertTrue(entered.wait(timeout=5))
                pool.submit(storage.delete_job, self.job_id).result(timeout=3)
            finally:
                release.set()
            with self.assertRaises(KeyError):
                compiled.result(timeout=5)
        self.assertFalse(job_directory.exists())

    def test_pdf_library_upload_duplicate_labels_rename_and_delete(self) -> None:
        with patch("storage._utc_now", return_value="2026-09-01T12:00:00+00:00"):
            first = storage.add_uploaded_pdf_version(
                self.job_id,
                self.PDF_ONE,
                "General Resume",
                "resume-one.pdf",
            )
        with patch("storage._utc_now", return_value="2026-09-02T12:00:00+00:00"):
            second = storage.add_uploaded_pdf_version(
                self.job_id,
                self.PDF_TWO,
                "General Resume",
                "resume-two.pdf",
            )

        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(str(uuid.UUID(first["id"])), first["id"])
        self.assertEqual(first["filename"], f"{first['id']}.pdf")
        self.assertEqual(first["source"], "uploaded")
        self.assertEqual(first["original_filename"], "resume-one.pdf")
        self.assertEqual(
            [version["id"] for version in storage.list_pdf_versions(self.job_id)],
            [second["id"], first["id"]],
        )
        self.assertEqual(storage.load_pdf_version(self.job_id, first["id"]), self.PDF_ONE)
        self.assertEqual(storage.load_pdf_version(self.job_id, second["id"]), self.PDF_TWO)

        renamed = storage.rename_pdf_version(
            self.job_id, first["id"], "Tailored Resume"
        )
        self.assertEqual(renamed["label"], "Tailored Resume")
        for immutable_key in ("id", "filename", "source", "original_filename", "created_at"):
            self.assertEqual(renamed[immutable_key], first[immutable_key])
        self.assertEqual(storage.load_pdf_version(self.job_id, first["id"]), self.PDF_ONE)

        self.assertTrue(storage.delete_pdf_version(self.job_id, first["id"]))
        self.assertFalse(storage.delete_pdf_version(self.job_id, first["id"]))
        self.assertEqual(
            [version["id"] for version in storage.list_pdf_versions(self.job_id)],
            [second["id"]],
        )
        self.assertEqual(storage.load_pdf_version(self.job_id, second["id"]), self.PDF_TWO)

    def test_legacy_resume_pdf_is_migrated_once_without_data_loss(self) -> None:
        legacy_path = storage.save_uploaded_pdf(self.job_id, self.PDF_ONE)

        first_listing = storage.list_pdf_versions(self.job_id)
        self.assertEqual(len(first_listing), 1)
        migrated = first_listing[0]
        self.assertEqual(migrated["label"], "Imported resume.pdf")
        self.assertEqual(migrated["source"], "legacy")
        self.assertEqual(
            storage.load_pdf_version(self.job_id, migrated["id"]), self.PDF_ONE
        )
        self.assertFalse(legacy_path.exists())

        second_listing = storage.list_pdf_versions(self.job_id)
        self.assertEqual(second_listing, first_listing)

    def test_pdf_library_rejects_a_nested_directory_symlink(self) -> None:
        job_directory = storage.get_job_directory(self.job_id)
        outside = Path(self.temporary_directory.name) / "outside-pdf-library"
        outside.mkdir()
        sentinel = outside / "keep.txt"
        sentinel.write_text("safe", encoding="utf-8")
        try:
            (job_directory / "pdfs").symlink_to(outside, target_is_directory=True)
        except OSError as error:
            self.skipTest(f"This platform does not permit directory symlinks: {error}")

        with self.assertRaises(ValueError):
            storage.add_uploaded_pdf_version(
                self.job_id,
                self.PDF_ONE,
                "Unsafe Resume",
                "unsafe.pdf",
            )
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "safe")
        self.assertEqual(list(outside.iterdir()), [sentinel])


if __name__ == "__main__":
    unittest.main()
