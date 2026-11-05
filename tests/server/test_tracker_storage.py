"""Shared tracker identity, import, legacy defaults and concurrent writes."""

from concurrent.futures import ThreadPoolExecutor
import json
from threading import Barrier
import time
import uuid

import pytest

import storage


@pytest.fixture
def tracker_storage(tmp_path, monkeypatch):
    root = tmp_path / "tracker"
    for name, value in {
        "PROJECT_ROOT": root, "DATA_DIR": root / "data",
        "APPLICATIONS_DIR": root / "applications", "BACKUPS_DIR": root / "backups",
        "JOBS_FILE": root / "data/jobs.json", "SETTINGS_FILE": root / "data/settings.json",
    }.items():
        monkeypatch.setattr(storage, name, value)
    return root


def values(**changes):
    return {"company": "Example Labs", "job_title": "Engineer", **changes}


def test_legacy_jobs_receive_defaults_without_schema_change_or_rewrite(tracker_storage):
    storage.ensure_storage()
    raw = {"schema_version": 1, "jobs": [{"id": str(uuid.uuid4()), "company": "Old"}]}
    storage.JOBS_FILE.write_text(json.dumps(raw))
    before = storage.JOBS_FILE.read_bytes()
    loaded = storage.load_jobs()
    assert loaded["schema_version"] == 1
    assert loaded["jobs"][0]["source"] == "manual"
    assert loaded["jobs"][0]["autofill_stats"] is None
    assert storage.JOBS_FILE.read_bytes() == before


def test_url_identity_retains_job_query_and_ignores_tracking(tracker_storage):
    first = storage.get_or_create_job_by_url(values(job_url="https://EXAMPLE.com:443/jobs/1/?gh_jid=7&utm_source=mail#form"))
    original = storage.update_job(first["id"], {"status_id": "interviewing", "applied_date": "2026-11-01"})
    before = storage.JOBS_FILE.read_bytes()
    modified_at = storage.JOBS_FILE.stat().st_mtime_ns
    same = storage.get_or_create_job_by_url(values(
        job_url="https://example.com/jobs/1?gh_jid=7", company="Page company", job_title="Page role",
        status_id="planning", applied_date="", source="extension", location="Remote"))
    assert same == original
    assert storage.JOBS_FILE.read_bytes() == before
    assert storage.JOBS_FILE.stat().st_mtime_ns == modified_at
    other = storage.get_or_create_job_by_url(values(job_url="https://example.com/jobs/1?gh_jid=8"))
    assert other["id"] != first["id"]
    assert len(storage.load_jobs()["jobs"]) == 2


def test_manual_non_http_url_does_not_block_lookup_or_creation(tracker_storage):
    manual = storage.create_job(values(job_url="Not disclosed"))
    storage.update_job(manual["id"], {"job_url": "example.com", "location": "Remote"})
    created = storage.get_or_create_job_by_url(values(job_url="https://example.com/jobs/2"))
    assert storage.find_jobs_by_url("https://example.com/jobs/2#apply")[0]["id"] == created["id"]
    assert storage.get_job_by_id(manual["id"])["job_url"] == "example.com"


def test_legacy_http_job_is_reused_by_normalizing_its_url(tracker_storage):
    old = storage.create_job(values(job_url="https://EXAMPLE.com/jobs/3/?utm_medium=email"))
    assert storage.get_or_create_job_by_url(values(job_url="https://example.com/jobs/3"))["id"] == old["id"]


def test_extension_import_maps_states_and_is_repeatable_without_overwriting_edits(tracker_storage):
    records = [{"company": "Example Labs", "jobTitle": "Engineer", "jobUrl": f"https://example.com/{index}",
                "status": status, "notes": "Original note"}
               for index, status in enumerate(["Saved", "Applied", "Interview", "Offer", "Rejected", "Withdrawn"])]
    imported = storage.import_extension_jobs(records)
    assert [job["status_id"] for job in imported] == ["planning", "applied", "interviewing", "offer", "rejected", "planning"]
    assert imported[-1]["archived"]
    assert all(job["source"] == "import" for job in imported)
    storage.update_job(imported[0]["id"], {"status_id": "offer"})
    storage.save_job_notes(imported[0]["id"], "Edited in dashboard")
    repeated = storage.import_extension_jobs(records)
    assert repeated[0]["status_id"] == "offer"
    assert storage.get_job_notes(imported[0]["id"]) == "Edited in dashboard"
    assert len(storage.load_jobs()["jobs"]) == 6


def test_import_preserves_legacy_date_and_coverage_and_validates_batch_first(tracker_storage):
    record = {"company": "Example Labs", "role": "Engineer", "jobUrl": "https://example.com/1", "status": "applied",
              "appliedAt": "2026-11-01T12:00:00Z", "formFieldCount": 10, "filledFieldCount": 9,
              "updatedAt": "2026-11-01T11:00:00Z"}
    with pytest.raises(ValueError, match="^Record 2: company cannot be blank\\.$"):
        storage.import_extension_jobs([record, {**record, "company": ""}])
    assert not tracker_storage.exists()
    assert storage.load_jobs()["jobs"] == []
    job = storage.import_extension_jobs([record])[0]
    assert job["applied_date"] == "2026-11-01"
    assert job["autofill_stats"] == {"filled": 9, "detected": 10, "recorded_at": "2026-11-01T11:00:00Z"}


def test_concurrent_updates_keep_both_changed_fields(tracker_storage, monkeypatch):
    job = storage.create_job(values())
    original_load = storage.load_jobs
    def slow_load():
        result = original_load()
        time.sleep(0.03)
        return result
    monkeypatch.setattr(storage, "load_jobs", slow_load)
    barrier = Barrier(2)
    def update(changes):
        barrier.wait()
        return storage.update_job(job["id"], changes)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = [pool.submit(update, {"location": "Remote"}), pool.submit(update, {"email": "demo@example.test"})]
        for future in results:
            future.result()
    reloaded = storage.get_job_by_id(job["id"])
    assert reloaded["location"] == "Remote"
    assert reloaded["email"] == "demo@example.test"


def test_concurrent_pdf_versions_share_index_without_lost_entries(tracker_storage):
    job = storage.create_job(values())
    with ThreadPoolExecutor(max_workers=2) as pool:
        versions = list(pool.map(lambda i: storage.add_uploaded_pdf_version(
            job["id"], b"%PDF-1.7\nexample", f"Resume {i}", f"resume{i}.pdf", source="extension"), range(2)))
    saved = storage.list_pdf_versions(job["id"])
    assert {version["id"] for version in saved} == {version["id"] for version in versions}
    assert all(version["source"] == "extension" for version in saved)


def test_api_token_is_created_once_and_survives_settings_reads(tracker_storage):
    with ThreadPoolExecutor(max_workers=2) as pool:
        tokens = list(pool.map(lambda _: storage.get_api_token(), range(2)))
    assert tokens[0] == tokens[1] == storage.load_settings()["api_token"]
    assert len(tokens[0]) >= 32


def test_patch_rejects_unknown_status_and_impossible_coverage(tracker_storage):
    job = storage.create_job(values())
    with pytest.raises(ValueError, match="status_id"):
        storage.update_job(job["id"], {"status_id": "does-not-exist"})
    with pytest.raises(ValueError, match="autofill_stats"):
        storage.update_job(job["id"], {"autofill_stats": {"filled": 11, "detected": 10, "recorded_at": "2026-11-01T12:00:00Z"}})
    assert storage.get_job_by_id(job["id"])["autofill_stats"] is None


def test_upload_after_job_deletion_does_not_recreate_folder(tracker_storage):
    job = storage.create_job(values())
    directory = storage.get_job_directory(job["id"])
    storage.delete_job(job["id"])
    with pytest.raises(KeyError, match="Job not found"):
        storage.add_uploaded_pdf_version(job["id"], b"%PDF-1.7\nexample", "Resume", "resume.pdf", source="extension")
    assert not directory.exists()
    assert storage.load_jobs()["jobs"] == []


def test_import_console_note_array_becomes_markdown_and_remains_idempotent(tracker_storage):
    record = {"company": "Example Labs", "jobTitle": "Engineer", "jobUrl": "https://example.com/notes", "status": "Saved",
              "notes": [
                  {"date": "2026-11-05", "title": "Interview prep", "contentMarkdown": "- Review **systems**", "createdAt": "2026-11-05T12:00:00Z"},
                  {"date": "2026-11-06", "title": "Legacy content", "content": "Bring a portfolio."},
                  {"date": "2026-11-07", "title": "Follow up", "nextAction": "Email the recruiter."},
              ]}
    job = storage.import_extension_jobs([record])[0]
    markdown = storage.get_job_notes(job["id"])
    assert markdown == ("## 2026-11-05 · Interview prep\n\n- Review **systems**\n\n---\n\n"
                        "## 2026-11-06 · Legacy content\n\nBring a portfolio.\n\n---\n\n"
                        "## 2026-11-07 · Follow up\n\n## Next Action\nEmail the recruiter.")
    storage.import_extension_jobs([record])
    assert storage.get_job_notes(job["id"]) == markdown
    assert len(storage.load_jobs()["jobs"]) == 1


def test_import_validates_notes_before_writing_any_jobs(tracker_storage):
    record = {"company": "Example Labs", "jobTitle": "Engineer", "jobUrl": "https://example.com/notes", "status": "Saved"}
    with pytest.raises(ValueError, match="^Record 2: Extension note contentMarkdown must be text\\.$"):
        storage.import_extension_jobs([record, {**record, "jobUrl": "https://example.com/invalid", "notes": [{"contentMarkdown": {"bad": "object"}}]}])
    assert not tracker_storage.exists()
    assert storage.load_jobs()["jobs"] == []


@pytest.mark.parametrize("counts", [{}, {"formFieldCount": 0, "filledFieldCount": 0}])
def test_import_without_detected_fields_has_no_autofill_record(tracker_storage, counts):
    record = {"company": "Example Labs", "jobTitle": "Engineer", "jobUrl": "https://example.com/zero", **counts}
    job = storage.import_extension_jobs([record])[0]
    assert job["autofill_stats"] is None
    assert storage.get_job_by_id(job["id"])["autofill_stats"] is None


def test_import_reports_record_number_for_missing_url_without_writing_batch(tracker_storage):
    record = {"company": "Example Labs", "jobTitle": "Engineer", "jobUrl": "https://example.com/one"}
    with pytest.raises(ValueError, match="^Record 3: job_url must be an HTTP URL\\.$"):
        storage.import_extension_jobs([record, {**record, "jobUrl": "https://example.com/two"}, {**record, "jobUrl": ""}])
    assert not tracker_storage.exists()
