"""db.py - tiny SQLite layer for accounts, settings and favorite routes."""
import json
import os
import sqlite3
from werkzeug.security import check_password_hash, generate_password_hash

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "autoassist.db")


def conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c


def init():
    with conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            pw TEXT NOT NULL,
            settings TEXT NOT NULL DEFAULT '{}');
        CREATE TABLE IF NOT EXISTS favorites(
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            created TEXT DEFAULT CURRENT_TIMESTAMP);
        """)


def create_user(email, pw):
    """Returns the new user id, or None if the email is taken."""
    try:
        with conn() as c:
            return c.execute("INSERT INTO users(email, pw) VALUES(?, ?)",
                             (email, generate_password_hash(pw))).lastrowid
    except sqlite3.IntegrityError:
        return None


def check_login(email, pw):
    with conn() as c:
        r = c.execute("SELECT id, pw FROM users WHERE email=?", (email,)).fetchone()
    return r["id"] if r and check_password_hash(r["pw"], pw) else None


def public_user(uid):
    with conn() as c:
        r = c.execute("SELECT email, settings FROM users WHERE id=?", (uid,)).fetchone()
    return {"email": r["email"], "settings": json.loads(r["settings"])} if r else None


def set_settings(uid, new):
    merged = {**public_user(uid)["settings"], **new}
    with conn() as c:
        c.execute("UPDATE users SET settings=? WHERE id=?", (json.dumps(merged), uid))
    return merged


def _fav(r):
    return {"id": r["id"], "name": r["name"], "data": json.loads(r["data"])}


def list_favorites(uid):
    with conn() as c:
        rows = c.execute("SELECT * FROM favorites WHERE user_id=? ORDER BY id DESC", (uid,)).fetchall()
    return [_fav(r) for r in rows]


def add_favorite(uid, name, data):
    with conn() as c:
        fid = c.execute("INSERT INTO favorites(user_id, name, data) VALUES(?, ?, ?)",
                        (uid, name, json.dumps(data))).lastrowid
    return {"id": fid, "name": name, "data": data}


def delete_favorite(uid, fid):
    with conn() as c:
        c.execute("DELETE FROM favorites WHERE id=? AND user_id=?", (fid, uid))