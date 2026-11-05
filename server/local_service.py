"""Run the tracker API alongside Streamlit in the same Python process."""

from __future__ import annotations

from dataclasses import dataclass, field
import socket
import threading
import time

import streamlit as st
import uvicorn

from api import create_app
from storage import get_api_token


API_HOST = "127.0.0.1"
API_PORT = 8765
API_URL = f"http://{API_HOST}:{API_PORT}"


@dataclass
class LocalService:
    token: str
    error: str = ""
    url: str = API_URL
    _server: uvicorn.Server | None = field(default=None, repr=False)
    _thread: threading.Thread | None = field(default=None, repr=False)

    @property
    def running(self) -> bool:
        return bool(
            self._server and self._server.started
            and self._thread and self._thread.is_alive()
        )


@st.cache_resource
def start_local_service() -> LocalService:
    """Start one loopback API thread shared by all dashboard sessions/reruns."""

    service = LocalService(token=get_api_token())
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        listener.bind((API_HOST, API_PORT))
        listener.listen()
    except OSError as error:
        listener.close()
        service.error = str(error)
        return service

    config = uvicorn.Config(
        create_app(token=service.token), host=API_HOST, port=API_PORT,
        log_level="warning", access_log=False,
    )
    service._server = uvicorn.Server(config)

    service._thread = threading.Thread(
        target=service._server.run, kwargs={"sockets": [listener]},
        name="tracker-api", daemon=True,
    )
    service._thread.start()
    while service._thread.is_alive() and not service._server.started:
        time.sleep(0.01)
    if not service.running:
        service.error = "Local API stopped during startup."
        listener.close()
    return service
