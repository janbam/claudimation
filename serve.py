#!/usr/bin/env python3
"""python3 serve.py [port] — like `python3 -m http.server`, but with Cache-Control: no-store,
so a reload always gets the current worklet.js/score.js (Chrome otherwise caches them heuristically)."""
import functools, http.server, os, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def log_message(self, *a): pass
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
print(f'COMMA → http://localhost:{port}/')
http.server.ThreadingHTTPServer(('', port), functools.partial(H, directory=os.path.dirname(os.path.abspath(__file__)))).serve_forever()
