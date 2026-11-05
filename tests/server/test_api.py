"""API integration tests using the real storage layer in temporary directories."""

from concurrent.futures import ThreadPoolExecutor
import json
import threading
import uuid

from fastapi.testclient import TestClient
import pytest

from api import create_app
import storage


TOKEN = "test-tracker-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
PDF = b"%PDF-1.4\nexample test resume\n%%EOF\n"


@pytest.fixture
def client(tmp_path, monkeypatch):
    root = tmp_path / "tracker"
    for name, path in {
        "PROJECT_ROOT": root,
        "DATA_DIR": root / "data",
        "APPLICATIONS_DIR": root / "applications",
        "BACKUPS_DIR": root / "backups",
        "JOBS_FILE": root / "data/jobs.json",
        "SETTINGS_FILE": root / "data/settings.json",
    }.items():
        monkeypatch.setattr(storage, name, path)
    storage.ensure_storage()
    with TestClient(create_app(token=TOKEN)) as session:
        yield session


def payload(**changes):
    values = {
        "company": "Example Labs",
        "job_title": "Engineer",
        "job_url": "https://example.com/jobs/123",
    }
    values.update(changes)
    return values


def create_job(client, **changes):
    response = client.post("/api/jobs", json=payload(**changes), headers=AUTH)
    assert response.status_code == 200, response.text
    return response.json()


def test_health_is_public_and_contains_only_health_metadata(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True, "version": "0.1.0"}


def test_non_ascii_wrong_token_returns_401(client):
    response = client.get("/api/jobs", headers={"Authorization": b"Bearer wrong\xff"})
    assert response.status_code == 401


@pytest.mark.parametrize("authorization", [None, "Bearer incorrect", "Basic test-tracker-token"])
@pytest.mark.parametrize("method,path,kwargs", [
    ("GET", "/api/statuses", {}),
    ("GET", "/api/jobs", {}),
    ("POST", "/api/jobs", {"json": payload()}),
    ("PATCH", f"/api/jobs/{uuid.uuid4()}", {"json": {"status_id": "applied"}}),
    ("GET", f"/api/jobs/{uuid.uuid4()}/notes", {}),
    ("PUT", f"/api/jobs/{uuid.uuid4()}/notes", {"json": {"notes": "test"}}),
    ("POST", f"/api/jobs/{uuid.uuid4()}/resumes", {"files": {"file": ("resume.pdf", PDF)}}),
    ("POST", "/api/import", {"json": {"jobs": []}}),
])
def test_every_data_route_requires_the_correct_token(client, authorization, method, path, kwargs):
    headers = {} if authorization is None else {"Authorization": authorization}
    response = client.request(method, path, headers=headers, **kwargs)
    assert response.status_code == 401


def test_normalized_url_create_and_lookup_share_one_record(client):
    first = create_job(client, job_url="https://EXAMPLE.com/jobs/123/?utm_source=demo#apply")
    second = create_job(client, job_url="https://example.com/jobs/123", location="Remote")
    assert first["id"] == second["id"]
    assert second == first
    assert second["source"] == "extension"
    assert second["status_id"] == "planning"
    response = client.get("/api/jobs", params={"url": "https://example.com/jobs/123#resume"}, headers=AUTH)
    assert response.status_code == 200
    assert [job["id"] for job in response.json()] == [first["id"]]
    assert len(storage.load_jobs()["jobs"]) == 1


def test_repeated_post_preserves_all_existing_job_fields(client):
    original = storage.create_job({
        **payload(), "status_id": "applied", "source": "manual",
        "location": "Original location", "applied_date": "2026-11-05",
    })
    response = client.patch(f"/api/jobs/{original['id']}", headers=AUTH,
                            json={"status_id": "interviewing"})
    assert response.status_code == 200
    before = response.json()
    file_before = storage.JOBS_FILE.read_bytes()
    repeated = create_job(client, company="Page company", job_title="Page title",
                          location="Remote", status_id="planning")
    assert repeated == before
    assert repeated["source"] == "manual"
    assert storage.JOBS_FILE.read_bytes() == file_before


def test_new_post_ignores_status_and_uses_planning(client):
    job = create_job(client, status_id="offer")
    assert job["status_id"] == "planning"


def test_statuses_and_patch_use_server_status_ids(client):
    response = client.get("/api/statuses", headers=AUTH)
    assert response.status_code == 200
    assert {status["id"] for status in response.json()} >= {"planning", "applied", "interviewing"}
    job = create_job(client)
    response = client.patch(f"/api/jobs/{job['id']}", headers=AUTH, json={
        "status_id": "applied", "applied_date": "2026-11-05",
        "autofill_stats": {"filled": 9, "detected": 10, "recorded_at": "2026-11-05T17:00:00Z"},
    })
    assert response.status_code == 200
    saved = storage.get_job_by_id(job["id"])
    assert saved["status_id"] == "applied"
    assert saved["applied_date"] == "2026-11-05"
    assert saved["autofill_stats"]["filled"] == 9


def test_invalid_patch_status_returns_the_storage_reason(client):
    job = create_job(client)
    response = client.patch(f"/api/jobs/{job['id']}", json={"status_id": "invented"}, headers=AUTH)
    assert response.status_code == 422
    assert response.json()["detail"] == "status_id must be a configured status ID."
    assert storage.get_job_by_id(job["id"])["status_id"] == "planning"


def test_upload_uses_storage_pdf_validation_and_extension_source(client):
    job = create_job(client)
    url = f"/api/jobs/{job['id']}/resumes"
    bad = client.post(url, headers=AUTH, files={"file": ("fake.pdf", b"not a PDF", "application/pdf")})
    assert bad.status_code == 422
    good = client.post(url, headers=AUTH, data={"label": "Tailored resume"}, files={"file": ("resume.pdf", PDF, "application/pdf")})
    assert good.status_code == 200, good.text
    version = good.json()
    assert version["source"] == "extension"
    assert version["label"] == "Tailored resume"
    versions = storage.list_pdf_versions(job["id"])
    assert versions == [version]
    assert storage.load_pdf_version(job["id"], version["id"]) == PDF


def test_notes_round_trip_in_the_dashboard_notes_file(client):
    job = create_job(client)
    url = f"/api/jobs/{job['id']}/notes"
    assert client.get(url, headers=AUTH).json() == {"notes": ""}
    response = client.put(url, headers=AUTH, json={"notes": "Follow up next week.\nSecond line."})
    assert response.status_code == 200
    assert client.get(url, headers=AUTH).json() == response.json()
    assert (storage.get_job_directory(job["id"]) / "notes.md").read_text() == response.json()["notes"]


def test_import_is_repeatable_and_archives_withdrawn(client):
    records = [{
        "jobUrl": "https://example.com/jobs/imported", "company": "Imported Labs",
        "jobTitle": "Engineer", "status": "Withdrawn", "notes": "Archived note",
    }]
    first = client.post("/api/import", headers=AUTH, json={"jobs": records})
    assert first.status_code == 200, first.text
    second = client.post("/api/import", headers=AUTH, json={"jobs": records})
    assert second.status_code == 200
    assert first.json()[0]["id"] == second.json()[0]["id"]
    assert second.json()[0]["archived"] is True
    assert len(storage.load_jobs()["jobs"]) == 1
    assert storage.get_job_notes(first.json()[0]["id"]) == "Archived note"


@pytest.mark.parametrize("counts,expected", [
    ({}, None),
    ({"formFieldCount": 0, "filledFieldCount": 0}, None),
    ({"formFieldCount": 5, "filledFieldCount": 3}, {"filled": 3, "detected": 5}),
])
def test_import_records_coverage_only_for_detected_fields(client, counts, expected):
    record = {"company": "Import Co", "jobTitle": "Engineer",
              "jobUrl": "https://example.com/import", **counts}
    response = client.post("/api/import", headers=AUTH, json={"jobs": [record]})
    assert response.status_code == 200, response.text
    stats = response.json()[0]["autofill_stats"]
    if expected is None:
        assert stats is None
    else:
        assert stats["filled"] == expected["filled"]
        assert stats["detected"] == expected["detected"]


def test_import_error_identifies_record_and_writes_nothing(client):
    records = [{"company": "Import Co", "jobTitle": "Engineer",
                "jobUrl": f"https://example.com/{i}"} for i in range(3)]
    del records[2]["jobUrl"]
    before = storage.JOBS_FILE.read_bytes()
    response = client.post("/api/import", headers=AUTH, json={"jobs": records})
    assert response.status_code == 422
    assert response.json()["detail"] == "Record 3: job_url must be an HTTP URL."
    assert storage.JOBS_FILE.read_bytes() == before
    assert list(storage.APPLICATIONS_DIR.iterdir()) == []


@pytest.mark.parametrize("detected", [None, "0"])
def test_invalid_import_count_returns_an_indexed_422(client, detected):
    record = {"company": "Import Co", "jobTitle": "Engineer",
              "jobUrl": "https://example.com/import", "formFieldCount": detected}
    before = storage.JOBS_FILE.read_bytes()
    response = client.post("/api/import", headers=AUTH, json={"jobs": [record]})
    assert response.status_code == 422
    assert response.json()["detail"].startswith("Record 1: ")
    assert "not supported" in response.json()["detail"]
    assert storage.JOBS_FILE.read_bytes() == before


@pytest.mark.parametrize("authorization", [None, "Bearer incorrect"])
def test_unauthorized_invalid_job_body_returns_401(client, authorization):
    headers = {} if authorization is None else {"Authorization": authorization}
    response = client.post("/api/jobs", headers=headers, json={"company": []})
    assert response.status_code == 401


def assert_no_credential_keys(value):
    if isinstance(value, dict):
        assert not {"account", "password"}.intersection(value)
        for item in value.values():
            assert_no_credential_keys(item)
    elif isinstance(value, list):
        for item in value:
            assert_no_credential_keys(item)


def test_responses_never_include_saved_credentials(client):
    job = create_job(client)
    storage.update_job(job["id"], {
        "account": "private-account", "password": "private-password",
        "custom_fields": {"account": "nested-account", "password": "nested-password", "team": "R&D"},
    })
    responses = [
        client.get("/api/jobs", headers=AUTH),
        client.patch(f"/api/jobs/{job['id']}", headers=AUTH, json={"status_id": "applied"}),
        client.post("/api/jobs", headers=AUTH, json=payload()),
        client.post("/api/import", headers=AUTH, json={"jobs": [{
            "company": "Example Labs", "jobTitle": "Engineer", "jobUrl": job["job_url"], "status": "Applied",
        }]}),
    ]
    for response in responses:
        assert response.status_code == 200
        assert_no_credential_keys(response.json())
        assert "private-password" not in response.text
        assert "private-account" not in response.text
        assert "nested-password" not in response.text
    assert storage.get_job_by_id(job["id"])["password"] == "private-password"


def test_two_concurrent_writers_preserve_both_updates(client):
    job = create_job(client)
    barrier = threading.Barrier(2)

    def write(updates):
        barrier.wait(timeout=5)
        return client.patch(f"/api/jobs/{job['id']}", headers=AUTH, json=updates)

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(write, updates) for updates in [
            {"status_id": "interviewing"}, {"applied_date": "2026-11-05"},
        ]]
        assert [future.result().status_code for future in futures] == [200, 200]
    saved = storage.get_job_by_id(job["id"])
    assert saved["status_id"] == "interviewing"
    assert saved["applied_date"] == "2026-11-05"


def test_legacy_document_is_readable_without_a_schema_migration(client):
    legacy = {
        "schema_version": 1,
        "jobs": [{"id": str(uuid.uuid4()), "company": "Legacy Co", "job_title": "Engineer"}],
    }
    storage.JOBS_FILE.write_text(json.dumps(legacy))
    response = client.get("/api/jobs", headers=AUTH)
    assert response.status_code == 200
    job = response.json()[0]
    assert job["source"] == "manual"
    assert job["autofill_stats"] is None
    assert json.loads(storage.JOBS_FILE.read_text()) == legacy


@pytest.mark.parametrize("method,suffix,kwargs", [
    ("PATCH", "", {"json": {"status_id": "applied"}}),
    ("GET", "/notes", {}),
    ("PUT", "/notes", {"json": {"notes": "missing"}}),
    ("POST", "/resumes", {"files": {"file": ("resume.pdf", PDF)}}),
])
def test_missing_jobs_return_404(client, method, suffix, kwargs):
    response = client.request(method, f"/api/jobs/{uuid.uuid4()}{suffix}", headers=AUTH, **kwargs)
    assert response.status_code == 404
