from flask import Flask, request
from datetime import datetime, timezone
import os, json, uuid
from flask_cors import CORS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOGS_DIR = os.path.join(BASE_DIR, "logs")
LOG_FILE = os.path.join(LOGS_DIR, "data.ndjson")

app = Flask(__name__)
os.makedirs(LOGS_DIR, exist_ok=True)

CORS(app, resources={
    r"/collect": {
        "origins": [
            "https://peterhunady.github.io",
            "http://localhost:5173",
            "http://127.0.0.1:5173"
        ],
        "allow_headers": ["Content-Type"],
        "methods": ["POST", "OPTIONS"]
    }
})

def append_ndjson(obj: dict):
    """Append one JSON object as a line to data.ndjson (atomic-ish append)."""
    # Add server-side timestamp if missing
    obj.setdefault("received_at", datetime.now(timezone.utc).isoformat())
    # Keep a session id (or assign one)
    obj.setdefault("session_id", str(uuid.uuid4()))
    line = json.dumps(obj, ensure_ascii=False)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

@app.route("/collect", methods=["POST", "OPTIONS"])
def collect():
    if request.method == "OPTIONS":
        return ("", 204)
    
    payload = request.get_json(force=True, silent=True) or {}

    payload.setdefault("user_agent", request.headers.get("User-Agent"))
    payload.setdefault("referer", request.headers.get("Referer"))

    try:
        append_ndjson(payload)
        return ("", 204)
    except Exception as e:
        return (str(e), 400)

if __name__ == "__main__":
    print("Logging to:", LOG_FILE)
    app.run(host="0.0.0.0", port=8080)
