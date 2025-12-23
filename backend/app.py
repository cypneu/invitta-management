"""Optimized WSGI wrapper for FastAPI on Hostido.

Uses a persistent event loop in a background thread for best performance.
"""

import os
import sys
import asyncio
import threading

# Add application to path
app_path = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, app_path)

from src.main import app as fastapi_app

# Persistent event loop in background thread
_loop = None
_thread = None
_lock = threading.Lock()


def get_loop():
    """Get or create persistent event loop."""
    global _loop, _thread
    with _lock:
        if _loop is None or not _loop.is_running():
            _loop = asyncio.new_event_loop()
            _thread = threading.Thread(
                target=lambda: (asyncio.set_event_loop(_loop), _loop.run_forever()),
                daemon=True,
            )
            _thread.start()
    return _loop


def application(environ, start_response):
    """WSGI wrapper for FastAPI with persistent event loop."""
    loop = get_loop()

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": environ["REQUEST_METHOD"],
        "scheme": environ.get("wsgi.url_scheme", "http"),
        "path": environ.get("PATH_INFO", "/"),
        "query_string": environ.get("QUERY_STRING", "").encode(),
        "root_path": "",
        "headers": [
            (k[5:].replace("_", "-").lower().encode(), v.encode())
            for k, v in environ.items()
            if k.startswith("HTTP_")
        ],
        "server": (environ["SERVER_NAME"], int(environ.get("SERVER_PORT", 80) or 80)),
    }

    if environ.get("CONTENT_TYPE"):
        scope["headers"].append((b"content-type", environ["CONTENT_TYPE"].encode()))
    if environ.get("CONTENT_LENGTH"):
        scope["headers"].append((b"content-length", environ["CONTENT_LENGTH"].encode()))

    length = int(environ.get("CONTENT_LENGTH", 0) or 0)
    body = environ["wsgi.input"].read(length) if length else b""
    body_sent = [False]

    response = {"status": 200, "headers": [], "body": []}

    async def receive():
        if not body_sent[0]:
            body_sent[0] = True
            return {"type": "http.request", "body": body}
        return {"type": "http.disconnect"}

    async def send(msg):
        if msg["type"] == "http.response.start":
            response["status"] = msg["status"]
            response["headers"] = [
                (k.decode(), v.decode()) for k, v in msg.get("headers", [])
            ]
        elif msg["type"] == "http.response.body" and msg.get("body"):
            response["body"].append(msg["body"])

    # Run in persistent loop - much faster than creating new loop per request
    future = asyncio.run_coroutine_threadsafe(fastapi_app(scope, receive, send), loop)
    future.result(timeout=30)

    start_response(f"{response['status']} OK", response["headers"])
    return response["body"]
