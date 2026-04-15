from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import mimetypes
import os
from urllib.parse import unquote, urlparse
import webbrowser


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000


PROJECT_ROOT = Path(__file__).resolve().parent


class BookyHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        request_path = unquote(urlparse(self.path).path)
        target = "index.html" if request_path in ("/", "") else request_path.lstrip("/")
        file_path = (PROJECT_ROOT / target).resolve()

        if PROJECT_ROOT not in file_path.parents and file_path != PROJECT_ROOT:
            self.send_error(404, "File not found")
            return

        if not file_path.is_file():
            self.send_error(404, "File not found")
            return

        content_type, _ = mimetypes.guess_type(str(file_path))
        self.send_response(200)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.end_headers()
        self.wfile.write(file_path.read_bytes())

    def do_POST(self) -> None:
        if self.path != "/shutdown":
            self.send_error(404, "Endpoint not found")
            return

        self.send_response(204)
        self.end_headers()
        Thread(target=self.server.shutdown, daemon=True).start()

    def log_message(self, format: str, *args) -> None:
        return


def main() -> None:
    deploy_port = os.environ.get("PORT")
    port = int(deploy_port or DEFAULT_PORT)
    host = os.environ.get("HOST") or ("0.0.0.0" if deploy_port else DEFAULT_HOST)
    server = ThreadingHTTPServer((host, port), BookyHandler)
    display_host = "127.0.0.1" if host == "0.0.0.0" else host
    url = f"http://{display_host}:{port}/"

    print(f"Serving Booky on {url}")
    if not deploy_port:
        print("Closing the Booky browser tab will stop the local process.")
        webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
