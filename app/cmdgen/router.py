"""命令获取 API：/api/cmdgen/*（自然语言 → 多系统命令、历史 CRUD）。

统一走访问码 + 每 IP 限流（复用 app.security）；nginx SSO 门禁在上游，未登录到不了这里。
"""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..config import get_settings
from ..security import check_access_code, client_ip, limiter
from . import generator, store

router = APIRouter(prefix="/api/cmdgen", tags=["cmdgen"])

MAX_TEXT = 1000   # 操作意图描述字符上限


def guard(req: Request) -> JSONResponse | None:
    """访问码 + 限流前置校验，放行返回 None（与 main.py 行为一致）。"""
    if not check_access_code(req.headers.get("x-access-code", "")):
        return JSONResponse({"error": "访问码不正确"}, status_code=401)
    if not limiter.allow(client_ip(req)):
        return JSONResponse({"error": "请求过于频繁，请稍后再试"}, status_code=429)
    return None


@router.post("/generate")
async def generate(req: Request):
    """操作意图文本 → LLM 生成多系统命令 → 落库 → 返回 {id, intent, platforms}。"""
    denied = guard(req)
    if denied:
        return denied
    body = await req.json()
    text = (body.get("text") or "").strip()
    if not text:
        return JSONResponse({"error": "请输入要转换的操作描述"}, status_code=400)
    if len(text) > MAX_TEXT:
        return JSONResponse({"error": f"描述过长（>{MAX_TEXT} 字），请精简后重试"}, status_code=400)
    try:
        result = await generator.generate(text)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=422)
    except Exception as e:
        return JSONResponse({"error": f"请求模型出错：{e}"}, status_code=502)
    rid = store.create(text, result, get_settings().llm_model)
    return {"id": rid, "intent": result["intent"], "platforms": result["platforms"]}


@router.get("/history")
async def history(req: Request):
    denied = guard(req)
    if denied:
        return denied
    return {"items": store.list_items()}


@router.get("/history/{rid}")
async def history_detail(req: Request, rid: int):
    denied = guard(req)
    if denied:
        return denied
    item = store.get(rid)
    if item is None:
        return JSONResponse({"error": "记录不存在"}, status_code=404)
    return item


@router.delete("/history/{rid}")
async def history_delete(req: Request, rid: int):
    denied = guard(req)
    if denied:
        return denied
    store.delete(rid)
    return {"ok": True}
