from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv
import time
import os

load_dotenv()

app = Flask(__name__, static_folder="../frontend", static_url_path="")

DOCUMENT_EVENTS = []


# -----------------------------
# Serve frontend
# -----------------------------

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(app.static_folder, path)


# -----------------------------
# Event endpoint
# -----------------------------

@app.route("/event", methods=["GET", "POST"])
def event():
    # Browser sanity check
    if request.method == "GET":
        return jsonify({
            "status": "ok",
            "events_received": len(DOCUMENT_EVENTS)
        })

    # Real ingestion
    data = request.json or {}
    data["server_ts"] = time.time()
    DOCUMENT_EVENTS.append(data)

    return jsonify({"status": "stored"})


# -----------------------------
# Replay document
# -----------------------------

@app.route("/replay", methods=["GET"])
def replay():
    text = ""
    for e in DOCUMENT_EVENTS:
        if e.get("type") == "insert":
            text += e.get("char", "")
        elif e.get("type") == "delete":
            text = text[:-1]
    return jsonify({"text": text})


if __name__ == "__main__":
    app.run(debug=True)
