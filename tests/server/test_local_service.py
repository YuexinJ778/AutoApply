"""Exercise API startup/lifetime without binding a network port."""

import threading
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from streamlit.testing.v1 import AppTest

import local_service
import storage


@pytest.fixture
def runtime(monkeypatch):
    local_service.start_local_service.clear()
    monkeypatch.setattr(local_service, "get_api_token", lambda: "test-token")
    api = MagicMock()
    monkeypatch.setattr(local_service, "create_app", api)
    listener = MagicMock()
    monkeypatch.setattr(local_service.socket, "socket", lambda *args: listener)
    config = MagicMock()
    monkeypatch.setattr(local_service.uvicorn, "Config", config)
    monkeypatch.setattr(local_service.atexit, "register", MagicMock())

    class Server:
        instances = []

        def __init__(self, config):
            self.started = False
            self.should_exit = False
            self.sockets = None
            self.instances.append(self)

        def run(self, sockets):
            self.sockets = sockets
            self.started = True
            wait = threading.Event()
            while not self.should_exit:
                wait.wait(0.001)

    monkeypatch.setattr(local_service.uvicorn, "Server", Server)
    yield listener, api, config, Server
    service = local_service.start_local_service()
    service.stop()
    local_service.start_local_service.clear()


def test_reruns_share_one_loopback_api_thread(runtime):
    listener, api, config, server_type = runtime
    first = local_service.start_local_service()
    second = local_service.start_local_service()

    assert second is first
    assert first.running
    assert first.url == "http://127.0.0.1:8765"
    assert len(server_type.instances) == 1
    listener.setsockopt.assert_called_once_with(
        local_service.socket.SOL_SOCKET, local_service.socket.SO_REUSEADDR, 1
    )
    listener.bind.assert_called_once_with(("127.0.0.1", 8765))
    api.assert_called_once_with(token="test-token")
    assert config.call_args.kwargs["host"] == "127.0.0.1"
    assert config.call_args.kwargs["port"] == 8765
    assert server_type.instances[0].sockets == [listener]


def test_bind_failure_is_reported_without_claiming_running(runtime):
    listener, api, _, server_type = runtime
    listener.bind.side_effect = OSError("Address already in use")

    service = local_service.start_local_service()

    assert not service.running
    assert service.error == "Address already in use"
    assert service.token == "test-token"
    assert not server_type.instances
    api.assert_not_called()
    listener.close.assert_called_once()


def test_status_changes_when_api_thread_stops(runtime):
    service = local_service.start_local_service()
    assert service.running

    service.stop()

    assert not service.running


@pytest.mark.parametrize("running", [True, False])
def test_settings_displays_copyable_connection_and_truthful_status(
    monkeypatch, tmp_path, running,
):
    paths = {
        "PROJECT_ROOT": tmp_path,
        "DATA_DIR": tmp_path / "data",
        "APPLICATIONS_DIR": tmp_path / "applications",
        "BACKUPS_DIR": tmp_path / "backups",
        "JOBS_FILE": tmp_path / "data/jobs.json",
        "SETTINGS_FILE": tmp_path / "data/settings.json",
    }
    for key, value in paths.items():
        monkeypatch.setattr(storage, key, value)
    service = SimpleNamespace(
        url="http://127.0.0.1:8765", token="copyable-test-token",
        running=running, error="Address already in use" if not running else "",
    )
    monkeypatch.setattr(local_service, "start_local_service", lambda: service)
    tracker = AppTest.from_string("import app\napp.main()", default_timeout=15)
    tracker.session_state["page"] = "settings"

    tracker.run()

    assert not tracker.exception
    assert "Local API" in [tab.label for tab in tracker.tabs]
    assert service.url in [code.value for code in tracker.code]
    assert service.token in [code.value for code in tracker.code]
    if running:
        assert any(f"Running at {service.url}" in item.value for item in tracker.success)
    else:
        assert any(service.error in item.value for item in tracker.error)
        assert any(service.error in item.value for item in tracker.warning)
