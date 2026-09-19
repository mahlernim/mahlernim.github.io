"""Loopback-only static server for browser tests, with quiet request logging."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[3]
    ThreadingHTTPServer(("127.0.0.1", 4173), partial(Handler, directory=str(root))).serve_forever()
