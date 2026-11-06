"""AI 对话每日额度：按 C 端用户 + 全站双维度限制。

设计取舍：
- **请求次数**在调用前预占（失败也计数，防止用报错刷接口）；
- **token**在调用后按 provider 返回的 usage 累加（拿不到时用字符估算兜底）；
- 全站行 uid='*'，与用户行在同一事务里更新；
- limit <= 0 表示该维度不限制；
- 检查与自增在同一把进程锁内（uvicorn 单进程），并发请求不会同时挤过上限。
"""

from datetime import datetime

from . import store
from .config import get_settings


class QuotaExceeded(Exception):
    """额度超限；message 直接展示给用户，所以要写清用量与恢复时间。"""


def _day() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _limits() -> dict:
    s = get_settings()
    return {
        "requestsPerUser": max(0, s.daily_requests_per_user),
        "tokensPerUser": max(0, s.daily_tokens_per_user),
        "requestsGlobal": max(0, s.daily_requests_global),
        "tokensGlobal": max(0, s.daily_tokens_global),
    }


def _remaining(limit: int, used: int) -> int | None:
    return None if limit <= 0 else max(0, limit - used)


def status(uid: str) -> dict:
    day = _day()
    snap = store.usage_snapshot(day, uid)
    lim = _limits()
    return {
        "day": day,
        "limits": lim,
        "today": snap,
        "remaining": {
            "userRequests": _remaining(lim["requestsPerUser"], snap["user"]["requests"]),
            "userTokens": _remaining(lim["tokensPerUser"], snap["user"]["total_tokens"]),
            "globalRequests": _remaining(lim["requestsGlobal"], snap["global"]["requests"]),
            "globalTokens": _remaining(lim["tokensGlobal"], snap["global"]["total_tokens"]),
        },
    }


def reserve(uid: str) -> dict:
    """调用前占一次请求；超限抛 QuotaExceeded。返回占用后的用量快照。"""
    day = _day()
    lim = _limits()
    snap = store.usage_snapshot(day, uid)

    if lim["tokensPerUser"] > 0 and snap["user"]["total_tokens"] >= lim["tokensPerUser"]:
        raise QuotaExceeded(
            f"今日 AI token 额度已用完（{snap['user']['total_tokens']} / 上限 {lim['tokensPerUser']}），"
            "明天 0 点自动恢复。"
        )
    if lim["tokensGlobal"] > 0 and snap["global"]["total_tokens"] >= lim["tokensGlobal"]:
        raise QuotaExceeded(
            f"今日全站 AI token 额度已用完（{snap['global']['total_tokens']} / 上限 {lim['tokensGlobal']}），"
            "明天 0 点自动恢复。"
        )

    result = store.reserve_request(day, uid, lim["requestsPerUser"], lim["requestsGlobal"])
    if not result["ok"]:
        if result["scope"] == "user":
            raise QuotaExceeded(
                f"今日 AI 对话次数已用完（{result['used']} / 上限 {result['limit']}），明天 0 点自动恢复。"
            )
        raise QuotaExceeded(
            f"今日全站 AI 对话次数已达上限（{result['used']} / {result['limit']}），明天 0 点自动恢复。"
        )
    return store.usage_snapshot(day, uid)


def estimate_tokens(text: str) -> int:
    """无 usage 时的粗略估算：CJK 按 1 token/字，其余按 4 字符/token。"""
    cjk = sum(1 for ch in text if "\u3400" <= ch <= "\u9fff")
    other = max(0, len(text) - cjk)
    return max(1, cjk + (other + 3) // 4)


def record_tokens(uid: str, usage: dict, prompt_text: str, answer: str) -> None:
    """请求结束后累加 token；流中断/上游报错时也按已产生内容估算记一笔。"""
    prompt = int(usage.get("prompt_tokens") or 0) or estimate_tokens(prompt_text)
    completion = int(usage.get("completion_tokens") or 0) or estimate_tokens(answer)
    total = int(usage.get("total_tokens") or 0) or (prompt + completion)
    store.add_tokens(_day(), uid, prompt, completion, total)
