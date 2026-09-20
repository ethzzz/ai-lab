"""简历优化历史持久化：resume_optimizations 表（与会话同库 data/ai-lab.db）。

沿用 app/store.py 的 _lock 串行写 + _connect 风格；结构化结果以 JSON 文本存 result_json。
"""
import json
import sqlite3
import threading
from datetime import datetime

from ..config import get_settings

_lock = threading.Lock()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(get_settings().db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _lock, _connect() as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS resume_optimizations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT '',
            source_name TEXT NOT NULL DEFAULT '',
            raw_text TEXT NOT NULL DEFAULT '',
            result_json TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        """)


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def create(title: str, source_name: str, raw_text: str, result: dict, model: str) -> int:
    with _lock, _connect() as conn:
        cur = conn.execute(
            "INSERT INTO resume_optimizations (title, source_name, raw_text, result_json, model, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (title[:60], source_name[:120], raw_text,
             json.dumps(result, ensure_ascii=False), model, _now()),
        )
        return cur.lastrowid


def list_items() -> list[dict]:
    """历史列表（不含原文正文，附分段数）；按新到旧最多 100 条。"""
    with _lock, _connect() as conn:
        rows = conn.execute(
            "SELECT id, title, source_name, model, created_at, result_json "
            "FROM resume_optimizations ORDER BY id DESC LIMIT 100"
        ).fetchall()
    items = []
    for r in rows:
        d = dict(r)
        try:
            seg = json.loads(d.pop("result_json") or "{}").get("segments", [])
            d["segment_count"] = len(seg) if isinstance(seg, list) else 0
        except Exception:
            d.pop("result_json", None)
            d["segment_count"] = 0
        items.append(d)
    return items


def get(rid: int) -> dict | None:
    """详情：展开 result_json 为 summary + segments，附原文。"""
    with _lock, _connect() as conn:
        row = conn.execute(
            "SELECT id, title, source_name, raw_text, result_json, model, created_at "
            "FROM resume_optimizations WHERE id = ?", (rid,)
        ).fetchone()
    if row is None:
        return None
    d = dict(row)
    try:
        result = json.loads(d.pop("result_json") or "{}")
    except Exception:
        result = {}
    d["summary"] = result.get("summary", "")
    d["segments"] = result.get("segments", [])
    return d


def delete(rid: int) -> None:
    with _lock, _connect() as conn:
        conn.execute("DELETE FROM resume_optimizations WHERE id = ?", (rid,))
