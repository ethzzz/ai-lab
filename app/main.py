"""ai-lab 阶段1：LLM 流式聊天服务（FastAPI + SSE）。

- POST /api/chat    流式对话（可选 session_id，用户/助手消息自动落库）
- GET  /api/models  可用模型与提示词预设
- GET  /api/health  探活
- GET  /            聊天页
- /api/sessions*    会话持久化（SQLite）
"""
import json
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from . import store
from .config import get_settings
from .llm.qwen import QwenProvider
from .prompts.templates import TEMPLATES
from .resume import store as resume_store
from .resume.router import router as resume_router
from .security import check_access_code, client_ip, limiter

app = FastAPI(title="ai-lab")
provider = QwenProvider()
store.init_db()
resume_store.init_db()
app.include_router(resume_router)


def guard(req: Request) -> JSONResponse | None:
    """访问码 + 限流前置校验，放行返回 None。"""
    if not check_access_code(req.headers.get("x-access-code", "")):
        return JSONResponse({"error": "访问码不正确"}, status_code=401)
    if not limiter.allow(client_ip(req)):
        return JSONResponse({"error": "请求过于频繁，请稍后再试"}, status_code=429)
    return None


@app.get("/api/health")
async def health():
    return {"ok": True, "service": "ai-lab"}


@app.get("/api/models")
async def models(req: Request):
    denied = guard(req)
    if denied:
        return denied
    s = get_settings()
    return {
        "model": s.llm_model,
        "templates": [{"key": k, "label": v["label"]} for k, v in TEMPLATES.items()],
    }


@app.post("/api/chat")
async def chat(req: Request):
    denied = guard(req)
    if denied:
        return denied
    body = await req.json()
    template = TEMPLATES.get(body.get("template") or "default", TEMPLATES["default"])
    messages = [
        {"role": m["role"], "content": m["content"]}
        for m in (body.get("messages") or [])
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]
    full = [{"role": "system", "content": template["system"]}, *messages]

    # 会话落库：用户消息先存，助手回复在流结束后存（仅存最新一轮，历史由前端全量上送）
    session_id = body.get("session_id")
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    if session_id is not None:
        if not store.session_exists(int(session_id)):
            return JSONResponse({"error": "会话不存在"}, status_code=404)
        session_id = int(session_id)
        if last_user:
            store.add_message(session_id, "user", last_user)
            store.touch_session(session_id, last_user)

    async def event_stream():
        answer = ""
        try:
            async for delta in provider.chat_stream(full):
                answer += delta
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            if session_id is not None and answer.strip():
                store.add_message(session_id, "assistant", answer)
        except Exception as e:  # 网关/限流等错误以 SSE 事件透出，前端可展示
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ================= 会话持久化 =================
@app.get("/api/sessions")
async def sessions_list(req: Request):
    denied = guard(req)
    if denied:
        return denied
    return {"items": store.list_sessions()}


@app.post("/api/sessions")
async def sessions_create(req: Request):
    denied = guard(req)
    if denied:
        return denied
    body = await req.json() if req.headers.get("content-length") not in (None, "0") else {}
    return store.create_session((body.get("title") or "").strip()[:30])


@app.get("/api/sessions/{sid}/messages")
async def sessions_messages(req: Request, sid: int):
    denied = guard(req)
    if denied:
        return denied
    if not store.session_exists(sid):
        return JSONResponse({"error": "会话不存在"}, status_code=404)
    return {"items": store.get_messages(sid)}


@app.put("/api/sessions/{sid}")
async def sessions_rename(req: Request, sid: int):
    denied = guard(req)
    if denied:
        return denied
    if not store.session_exists(sid):
        return JSONResponse({"error": "会话不存在"}, status_code=404)
    body = await req.json()
    store.rename_session(sid, (body.get("title") or "").strip()[:30])
    return {"ok": True}


@app.delete("/api/sessions/{sid}")
async def sessions_delete(req: Request, sid: int):
    denied = guard(req)
    if denied:
        return denied
    store.delete_session(sid)
    return {"ok": True}


@app.get("/")
async def index():
    return FileResponse(Path(__file__).parent / "static" / "index.html")
