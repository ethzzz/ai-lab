"""命令获取历史持久化：cmdgen_history 表（与会话同库 data/ai-lab.db）。

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
        CREATE TABLE IF NOT EXISTS cmdgen_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT NOT NULL DEFAULT '',
            intent TEXT NOT NULL DEFAULT '',
            result_json TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        """)


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def create(query: str, result: dict, model: str) -> int:
    with _lock, _connect() as conn:
        cur = conn.execute(
            "INSERT INTO cmdgen_history (query, intent, result_json, model, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (query[:200], str(result.get("intent", ""))[:120],
             json.dumps(result, ensure_ascii=False), model, _now()),
        )
        return cur.lastrowid


def list_items() -> list[dict]:
    """历史列表（不含完整结果，附系统条目数）；按新到旧最多 100 条。"""
    with _lock, _connect() as conn:
        rows = conn.execute(
            "SELECT id, query, intent, model, created_at, result_json "
            "FROM cmdgen_history ORDER BY id DESC LIMIT 100"
        ).fetchall()
    items = []
    for r in rows:
        d = dict(r)
        try:
            plats = json.loads(d.pop("result_json") or "{}").get("platforms", [])
            d["platform_count"] = len(plats) if isinstance(plats, list) else 0
        except Exception:
            d.pop("result_json", None)
            d["platform_count"] = 0
        items.append(d)
    return items


def get(rid: int) -> dict | None:
    """详情：展开 result_json 为 intent + platforms，附原始查询。"""
    with _lock, _connect() as conn:
        row = conn.execute(
            "SELECT id, query, intent, result_json, model, created_at "
            "FROM cmdgen_history WHERE id = ?", (rid,)
        ).fetchone()
    if row is None:
        return None
    d = dict(row)
    try:
        result = json.loads(d.pop("result_json") or "{}")
    except Exception:
        result = {}
    d["intent"] = result.get("intent", d.get("intent", ""))
    d["platforms"] = result.get("platforms", [])
    return d


def delete(rid: int) -> None:
    with _lock, _connect() as conn:
        conn.execute("DELETE FROM cmdgen_history WHERE id = ?", (rid,))
