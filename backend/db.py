"""db.py - Postgres layer for accounts, settings and favorite routes.

Works with any hosted Postgres (Neon, Supabase, Vercel Postgres, ...).
Set DATABASE_URL in your environment (Vercel project settings, or backend/.env locally).
"""
import json
import os
from contextlib import contextmanager

import psycopg2
import psycopg2.errors
import psycopg2.extras
from werkzeug.security import check_password_hash, generate_password_hash


@contextmanager
def cursor():
    """Open a connection, yield a dict cursor, commit on success, always close."""
    # Read the env var lazily: app.py imports this module before it loads .env.
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not set.")
    c = psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        with c:  # commits, or rolls back on error
            with c.cursor() as cur:
                yield cur
    finally:
        c.close()


def init():
    with cursor() as cur:
        cur.execute("""
        CREATE TABLE IF NOT EXISTS users(
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            pw TEXT NOT NULL,
            settings TEXT NOT NULL DEFAULT '{}');
        CREATE TABLE IF NOT EXISTS favorites(
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            created TIMESTAMPTZ DEFAULT now());
        """)


def create_user(email, pw):
    """Returns the new user id, or None if the email is taken."""
    try:
        with cursor() as cur:
            cur.execute(
                "INSERT INTO users(email, pw) VALUES(%s, %s) RETURNING id",
                (email, generate_password_hash(pw)),
            )
            return cur.fetchone()["id"]
    except psycopg2.errors.UniqueViolation:
        return None


def check_login(email, pw):
    with cursor() as cur:
        cur.execute("SELECT id, pw FROM users WHERE email=%s", (email,))
        r = cur.fetchone()
    return r["id"] if r and check_password_hash(r["pw"], pw) else None


def public_user(uid):
    with cursor() as cur:
        cur.execute("SELECT email, settings FROM users WHERE id=%s", (uid,))
        r = cur.fetchone()
    return {"email": r["email"], "settings": json.loads(r["settings"])} if r else None


def set_settings(uid, new):
    merged = {**public_user(uid)["settings"], **new}
    with cursor() as cur:
        cur.execute("UPDATE users SET settings=%s WHERE id=%s", (json.dumps(merged), uid))
    return merged


def _fav(r):
    return {"id": r["id"], "name": r["name"], "data": json.loads(r["data"])}


def list_favorites(uid):
    with cursor() as cur:
        cur.execute("SELECT * FROM favorites WHERE user_id=%s ORDER BY id DESC", (uid,))
        rows = cur.fetchall()
    return [_fav(r) for r in rows]


def add_favorite(uid, name, data):
    with cursor() as cur:
        cur.execute(
            "INSERT INTO favorites(user_id, name, data) VALUES(%s, %s, %s) RETURNING id",
            (uid, name, json.dumps(data)),
        )
        fid = cur.fetchone()["id"]
    return {"id": fid, "name": name, "data": data}


def delete_favorite(uid, fid):
    with cursor() as cur:
        cur.execute("DELETE FROM favorites WHERE id=%s AND user_id=%s", (fid, uid))
