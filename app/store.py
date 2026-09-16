"""SQLite 持久化层：会话（sessions）与消息（messages），启动时幂等建表。"""
import sqlite3
import threading
from datetime import datetime
from pathlib import Path

from .config import get_settings

_lock = threading.Lock()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(get_settings().db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    path = Path(get_settings().db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with _lock, _connect() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
        """)


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def create_session(title: str = "") -> dict:
    now = _now()
    with _lock, _connect() as conn:
        cur = conn.execute(
            "INSERT INTO sessions (title, created_at, updated_at) VALUES (?, ?, ?)",
            (title, now, now),
        )
        return {"id": cur.lastrowid, "title": title, "created_at": now, "updated_at": now}


def list_sessions() -> list[dict]:
    with _lock, _connect() as conn:
        rows = conn.execute(
            "SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 100"
        ).fetchall()
        return [dict(r) for r in rows]


def session_exists(sid: int) -> bool:
    with _lock, _connect() as conn:
        return conn.execute("SELECT 1 FROM sessions WHERE id = ?", (sid,)).fetchone() is not None


def rename_session(sid: int, title: str) -> None:
    with _lock, _connect() as conn:
        conn.execute("UPDATE sessions SET title = ? WHERE id = ?", (title, sid))


def delete_session(sid: int) -> None:
    with _lock, _connect() as conn:
        conn.execute("DELETE FROM messages WHERE session_id = ?", (sid,))
        conn.execute("DELETE FROM sessions WHERE id = ?", (sid,))


def get_messages(sid: int) -> list[dict]:
    with _lock, _connect() as conn:
        rows = conn.execute(
            "SELECT role, content FROM messages WHERE session_id = ? ORDER BY id", (sid,)
        ).fetchall()
        return [dict(r) for r in rows]


def add_message(sid: int, role: str, content: str) -> None:
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (sid, role, content, _now()),
        )


def touch_session(sid: int, title_if_empty: str = "") -> None:
    """刷新 updated_at；标题为空时用首条消息截断自动命名。"""
    with _lock, _connect() as conn:
        conn.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (_now(), sid))
        if title_if_empty:
            conn.execute(
                "UPDATE sessions SET title = ? WHERE id = ? AND title = ''",
                (title_if_empty[:30], sid),
            )
