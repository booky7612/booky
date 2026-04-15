from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import mimetypes
import webbrowser


HOST = "127.0.0.1"
PORT = 8000


PROJECT_ROOT = Path(__file__).resolve().parent


class BookyHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        target = "index.html" if self.path in ("/", "") else self.path.lstrip("/")
        file_path = (PROJECT_ROOT / target).resolve()

        if not str(file_path).startswith(str(PROJECT_ROOT)) or not file_path.is_file():
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
    server = ThreadingHTTPServer((HOST, PORT), BookyHandler)
    url = f"http://{HOST}:{PORT}/"

    print(f"Serving Booky on {url}")
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
