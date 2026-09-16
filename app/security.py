"""访问控制：静态访问码校验 + 每 IP 滑动窗口限流（内存实现，单进程够用）。"""
import time

from fastapi import Request

from .config import get_settings


def check_access_code(code: str) -> bool:
    """访问码为空（未配置）时放行，便于本地开发。"""
    expected = get_settings().access_code
    if not expected:
        return True
    return code == expected


class RateLimiter:
    """滑动窗口计数：同一 key 在 window 秒内最多 limit 次。"""

    def __init__(self, limit: int, window: int = 60):
        self.limit = limit
        self.window = window
        self._hits: dict[str, list[float]] = {}

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        hits = [t for t in self._hits.get(key, []) if now - t < self.window]
        if len(hits) >= self.limit:
            self._hits[key] = hits
            return False
        hits.append(now)
        self._hits[key] = hits
        return True


limiter = RateLimiter(get_settings().rate_limit_rpm)


def client_ip(req: Request) -> str:
    """经 nginx 反代后优先取 X-Real-IP / X-Forwarded-For。"""
    real = req.headers.get("x-real-ip")
    if real:
        return real
    fwd = req.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return req.client.host if req.client else "unknown"
