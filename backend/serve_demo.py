"""Serve demo/ locally with caching disabled:  python3 backend/serve_demo.py  -> http://localhost:8000"""
import http.server, os, functools
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "demo")
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self): self.send_header("Cache-Control", "no-store"); super().end_headers()
    def log_message(self, *a): pass
print("demo on http://localhost:8000"); http.server.ThreadingHTTPServer(("", 8000), functools.partial(H, directory=root)).serve_forever()
