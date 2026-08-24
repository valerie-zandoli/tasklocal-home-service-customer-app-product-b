#!/usr/bin/env python3
"""Local dev server for frontend/, with caching disabled.

`python3 -m http.server` sends no Cache-Control header at all, so the
browser is free to apply its own heuristic caching -- editing a file and
reloading the same tab can silently keep serving the pre-edit version,
with nothing pointing at caching as the cause. Confirmed hitting this
directly during development: comparing document.styleSheets against a
cache: 'no-store' fetch of the same URL was the only way to tell a real
code change from a stale cache. This adds Cache-Control: no-store to
every response so what's on disk is always what the browser shows,
without adding a build step or a dependency.

Usage: python3 scripts/dev-server.py [port]   (default: 8901)
"""
import http.server
import sys
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8901
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler) as httpd:
        print(f"Serving {FRONTEND_DIR} at http://localhost:{PORT} (Cache-Control: no-store)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
