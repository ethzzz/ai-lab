"""访问控制：C 端登录门禁 + 静态访问码校验 + 每 IP 滑动窗口限流（内存实现，单进程够用）。"""
import time

from fastapi import Request
from fastapi.responses import JSONResponse

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


def get_c_user(req: Request) -> str | None:
    """从 nginx 透传的 X-Auth-User 解析 C 端用户 id；仅认 'c:' 前缀，其余（b:/空/畸形）返回 None。

    信任边界：X-Auth-User 由 nginx `location ^~ /ailab/` 内 `proxy_set_header` 显式覆盖设置，
    客户端伪造的同名头会被替换；且 uvicorn 只绑 127.0.0.1、仅经 nginx 暴露，故后端读到的值可信。
    """
    raw = (req.headers.get("x-auth-user") or "").strip()
    if raw.startswith("c:"):
        uid = raw[2:].strip()
        return uid or None
    return None


def guard(req: Request) -> JSONResponse | None:
    """统一前置校验（全站业务 API 共用）：C 端登录 → 访问码 → 限流，放行返回 None。

    fail-closed：身份头缺失/为空/非 `c:` 前缀一律拒绝，且用 401（非 403）——前端
    `apiJson` / `sse` 已有「401 → 跳 /games/login」处理，可自动触发重新登录。
    """
    if get_c_user(req) is None:
        return JSONResponse({"error": "需要 C 端账号登录后使用"}, status_code=401)
    if not check_access_code(req.headers.get("x-access-code", "")):
        return JSONResponse({"error": "访问码不正确"}, status_code=401)
    if not limiter.allow(client_ip(req)):
        return JSONResponse({"error": "请求过于频繁，请稍后再试"}, status_code=429)
    return None
