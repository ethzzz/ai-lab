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

        -- 每日额度账本：uid='*' 是全站汇总行；请求在开始时预占，token 在结束后累加
        CREATE TABLE IF NOT EXISTS llm_usage_daily (
            day TEXT NOT NULL,
            uid TEXT NOT NULL,
            requests INTEGER NOT NULL DEFAULT 0,
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (day, uid)
        );
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


# ==================== 每日 LLM 额度 ====================

GLOBAL_UID = "*"


def _usage_row(conn: sqlite3.Connection, day: str, uid: str) -> dict:
    row = conn.execute(
        "SELECT requests, prompt_tokens, completion_tokens, total_tokens"
        " FROM llm_usage_daily WHERE day = ? AND uid = ?",
        (day, uid),
    ).fetchone()
    if row is None:
        return {"requests": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    return dict(row)


def usage_snapshot(day: str, uid: str) -> dict:
    """当前用户与全站今天的用量（只读）。"""
    with _lock, _connect() as conn:
        return {"user": _usage_row(conn, day, uid), "global": _usage_row(conn, day, GLOBAL_UID)}


def reserve_request(day: str, uid: str, per_user_limit: int, global_limit: int) -> dict:
    """
    预占一次请求。检查和自增在同一把进程锁内完成，避免并发放行超额。

    返回 {"ok": True, user, global} 或 {"ok": False, scope, used, limit}。
    limit <= 0 视为该维度不限制。
    """
    with _lock, _connect() as conn:
        user = _usage_row(conn, day, uid)
        glob = _usage_row(conn, day, GLOBAL_UID)
        if per_user_limit > 0 and user["requests"] >= per_user_limit:
            return {"ok": False, "scope": "user", "used": user["requests"], "limit": per_user_limit}
        if global_limit > 0 and glob["requests"] >= global_limit:
            return {"ok": False, "scope": "global", "used": glob["requests"], "limit": global_limit}
        _bump(conn, day, uid, requests=1)
        _bump(conn, day, GLOBAL_UID, requests=1)
        return {"ok": True, "user": user["requests"] + 1, "global": glob["requests"] + 1}


def add_tokens(day: str, uid: str, prompt: int, completion: int, total: int) -> None:
    """请求结束后累加 token（用户 + 全站各记一份）。"""
    with _lock, _connect() as conn:
        _bump(conn, day, uid, prompt=prompt, completion=completion, total=total)
        _bump(conn, day, GLOBAL_UID, prompt=prompt, completion=completion, total=total)


def _bump(
    conn: sqlite3.Connection,
    day: str,
    uid: str,
    requests: int = 0,
    prompt: int = 0,
    completion: int = 0,
    total: int = 0,
) -> None:
    now = _now()
    conn.execute(
        """
        INSERT INTO llm_usage_daily
            (day, uid, requests, prompt_tokens, completion_tokens, total_tokens, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(day, uid) DO UPDATE SET
            requests = requests + excluded.requests,
            prompt_tokens = prompt_tokens + excluded.prompt_tokens,
            completion_tokens = completion_tokens + excluded.completion_tokens,
            total_tokens = total_tokens + excluded.total_tokens,
            updated_at = excluded.updated_at
        """,
        (day, uid, requests, prompt, completion, total, now),
    )
