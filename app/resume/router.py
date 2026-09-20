"""简历优化 API：/api/resume/*（解析、优化、历史 CRUD）。

统一走访问码 + 每 IP 限流（复用 app.security）；nginx SSO 门禁在上游，未登录到不了这里。
"""
from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import JSONResponse

from ..config import get_settings
from ..security import check_access_code, client_ip, limiter
from . import optimizer, parser, store

router = APIRouter(prefix="/api/resume", tags=["resume"])

MAX_UPLOAD = 5 * 1024 * 1024   # 与 parser.MAX_BYTES 一致
MAX_TEXT = 20000               # 送入模型的简历字符上限


def guard(req: Request) -> JSONResponse | None:
    """访问码 + 限流前置校验，放行返回 None（与 main.py 行为一致）。"""
    if not check_access_code(req.headers.get("x-access-code", "")):
        return JSONResponse({"error": "访问码不正确"}, status_code=401)
    if not limiter.allow(client_ip(req)):
        return JSONResponse({"error": "请求过于频繁，请稍后再试"}, status_code=429)
    return None


@router.post("/parse")
async def parse(req: Request, file: UploadFile = File(...)):
    """上传文件 → 提取纯文本，返回标题与文本供前端预览 / 编辑。"""
    denied = guard(req)
    if denied:
        return denied
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        return JSONResponse({"error": "文件超过 5MB 上限"}, status_code=400)
    try:
        text = parser.extract_text(file.filename or "", data)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    except Exception as e:
        return JSONResponse({"error": f"解析失败：{e}"}, status_code=400)
    title = (file.filename or "").rsplit(".", 1)[0][:60] or "未命名简历"
    return {"ok": True, "title": title, "text": text, "chars": len(text)}


@router.post("/optimize")
async def optimize(req: Request):
    """简历文本 → LLM 分段优化 → 落库 → 返回 {id, summary, segments}。"""
    denied = guard(req)
    if denied:
        return denied
    body = await req.json()
    text = (body.get("text") or "").strip()
    title = (body.get("title") or "").strip()[:60] or "未命名简历"
    source_name = (body.get("source_name") or "").strip()[:120] or title
    if not text:
        return JSONResponse({"error": "简历内容为空"}, status_code=400)
    if len(text) > MAX_TEXT:
        return JSONResponse({"error": f"简历内容过长（>{MAX_TEXT} 字），请精简后重试"}, status_code=400)
    try:
        result = await optimizer.optimize(text)
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=422)
    except Exception as e:
        return JSONResponse({"error": f"请求模型出错：{e}"}, status_code=502)
    rid = store.create(title, source_name, text, result, get_settings().llm_model)
    return {"id": rid, "summary": result["summary"], "segments": result["segments"]}


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
