
import os
from functools import wraps

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from itsdangerous import BadSignature, URLSafeTimedSerializer

import db
import gh_client as gh
import weather


def load_env_file():
    """Read KEY=value lines from backend/.env (or the folder above it)
    into os.environ without requiring python-dotenv.
    """
    here = os.path.dirname(os.path.abspath(__file__))

    for folder in (here, os.path.dirname(here)):
        try:
            with open(
                os.path.join(folder, ".env"),
                encoding="utf-8-sig"
            ) as f:
                lines = f.read().splitlines()
        except OSError:
            continue

        for line in lines:
            line = line.strip()

            if not line or line.startswith("#") or "=" not in line:
                continue

            k, v = line.split("=", 1)

            if not os.environ.get(k.strip()):
                os.environ[k.strip()] = v.strip().strip('"').strip("'")

        return


load_env_file()

db.init()

DIST = os.path.join(
    os.path.dirname(__file__),
    "..",
    "frontend",
    "dist"
)

app = Flask(__name__, static_folder=None)
CORS(app)

tokens = URLSafeTimedSerializer(
    os.environ.get("SECRET_KEY") or "dev-only-change-me"
)

UNITS = ("both", "imperial", "metric")


def api_key():
    return os.environ.get("GRAPHHOPPER_KEY", "").strip()


# ---------- AUTH HELPERS ----------

def login_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        h = request.headers.get("Authorization", "")
        uid = None

        if h.startswith("Bearer "):
            try:
                uid = tokens.loads(
                    h[7:],
                    max_age=30 * 24 * 3600
                )
            except BadSignature:
                pass

        if uid is None or not db.public_user(uid):
            return jsonify(error="Please log in."), 401

        return fn(uid, *a, **kw)

    return wrapper


def session(uid):
    return jsonify(
        token=tokens.dumps(uid),
        user=db.public_user(uid)
    )


# ---------- BASIC ENDPOINTS ----------

@app.get("/api/health")
def health():
    k = api_key()

    return jsonify(
        ok=bool(k),
        mode="demo" if k == "demo" else "live"
    )


@app.get("/api/profiles")
def profiles():
    return jsonify(profiles=gh.PROFILES)


@app.get("/api/suggest")
def suggest():
    """Autocomplete endpoint."""

    key = api_key()

    if not key:
        return jsonify(
            suggestions=[],
            error="Server has no GRAPHHOPPER_KEY set."
        ), 500

    try:
        return jsonify(
            suggestions=gh.suggest(
                request.args.get("q", ""),
                key
            )
        )

    except gh.GraphhopperError as e:
        return jsonify(
            suggestions=[],
            error=e.message
        ), e.status


@app.post("/api/directions")
def directions():
    key = api_key()

    if not key:
        return jsonify(
            error="Server has no GRAPHHOPPER_KEY set."
        ), 500

    body = request.get_json(silent=True) or {}

    try:
        return jsonify(
            gh.get_directions(
                body.get("start"),
                body.get("end"),
                key,
                body.get("profile", "car"),
                body.get("stops")
            )
        )

    except gh.GraphhopperError as e:
        return jsonify(error=e.message), e.status


# ---------- WEATHER ----------

@app.post("/api/weather")
def weather_along_route():
    body = request.get_json(silent=True) or {}

    try:
        pts = [
            {
                "lat": float(p["lat"]),
                "lng": float(p["lng"])
            }
            for p in body.get("points", [])
        ][:10]

    except (KeyError, TypeError, ValueError):
        return jsonify(error="Invalid points."), 400

    if not pts:
        return jsonify(weather=[])

    if api_key() == "demo":
        return jsonify(
            weather=[
                {
                    **p,
                    "label": "Clear sky",
                    "kind": "sun",
                    "temp_c": 24,
                    "wind_kmh": 10,
                    "rain_mm": 0
                }
                for p in pts
            ]
        )

    try:
        return jsonify(
            weather=weather.along_route(pts)
        )

    except weather.WeatherError as e:
        return jsonify(error=str(e)), 502


# ---------- ACCOUNTS ----------

@app.post("/api/register")
def register():
    b = request.get_json(silent=True) or {}

    email = (b.get("email") or "").strip().lower()
    pw = b.get("password") or ""

    if "@" not in email or len(pw) < 6:
        return jsonify(
            error="Enter a valid email and a password of at least 6 characters."
        ), 400

    uid = db.create_user(email, pw)

    if not uid:
        return jsonify(
            error="That email is already registered."
        ), 409

    return session(uid)


@app.post("/api/login")
def login():
    b = request.get_json(silent=True) or {}

    uid = db.check_login(
        (b.get("email") or "").strip().lower(),
        b.get("password") or ""
    )

    if not uid:
        return jsonify(
            error="Wrong email or password."
        ), 401

    return session(uid)


@app.get("/api/me")
@login_required
def me(uid):
    return jsonify(user=db.public_user(uid))


@app.put("/api/settings")
@login_required
def settings(uid):
    b = request.get_json(silent=True) or {}
    new = {}

    if b.get("units") in UNITS:
        new["units"] = b["units"]

    if b.get("profile") in gh.PROFILES:
        new["profile"] = b["profile"]

    return jsonify(
        settings=db.set_settings(uid, new)
    )


# ---------- FAVORITE ROUTES ----------

@app.get("/api/favorites")
@login_required
def favorites(uid):
    return jsonify(
        favorites=db.list_favorites(uid)
    )


@app.post("/api/favorites")
@login_required
def add_favorite(uid):
    b = request.get_json(silent=True) or {}

    name = (b.get("name") or "").strip()[:80]
    data = b.get("data")

    if not name or not isinstance(data, dict):
        return jsonify(
            error="A name and a route are required."
        ), 400

    return jsonify(
        db.add_favorite(uid, name, data)
    )


@app.delete("/api/favorites/<int:fid>")
@login_required
def delete_favorite(uid, fid):
    db.delete_favorite(uid, fid)

    return jsonify(ok=True)


# ---------- FRONTEND ----------

@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def frontend(path):
    if os.path.isdir(DIST):
        full = os.path.join(DIST, path)

        if path and os.path.isfile(full):
            return send_from_directory(DIST, path)

        return send_from_directory(DIST, "index.html")

    return jsonify(
        message=(
            "API running. Build the frontend (npm run build) "
            "or use npm run dev."
        )
    ), 200


# ---------- RUN SERVER ----------

if __name__ == "__main__":
    app.run(
        debug=True,
        port=int(os.environ.get("PORT", 5000))
    )
