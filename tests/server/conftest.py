"""Import the standalone server modules from the separate test tree."""

from pathlib import Path
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server"))


@pytest.fixture(autouse=True)
def isolated_local_service(request, monkeypatch):
    """UI tests use temporary storage and must not start a listening service."""
    if request.node.path.name == "test_local_service.py":
        return
    import local_service

    monkeypatch.setattr(
        local_service, "start_local_service",
        lambda: SimpleNamespace(
            url="http://127.0.0.1:8765", token="test-token", running=True, error=""
        ),
    )
