"""ai-lab 阶段1：LLM 流式聊天服务（FastAPI + SSE）。

- POST /api/chat    流式对话（可选 session_id，用户/助手消息自动落库）
- GET  /api/models  可用模型与提示词预设
- GET  /api/health  探活
- GET  /            前端单页入口（React 构建产物 static/dist/index.html）
- /api/sessions*    会话持久化（SQLite）
- 业务 API 统一走 app.security.guard：强制 C 端登录（X-Auth-User）+ 访问码 + 限流；/api/health 开放
"""
import json
import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import quota, store
from .cmdgen import store as cmdgen_store
from .cmdgen.router import router as cmdgen_router
from .config import get_settings
from .llm.qwen import QwenProvider
from .prompts.templates import TEMPLATES
from .resume import store as resume_store
from .resume.router import router as resume_router
from .security import get_c_user, guard

log = logging.getLogger("ai-lab")

DIST = Path(__file__).parent / "static" / "dist"

app = FastAPI(title="ai-lab")
provider = QwenProvider()
store.init_db()
resume_store.init_db()
cmdgen_store.init_db()
app.include_router(resume_router)
app.include_router(cmdgen_router)


@app.exception_handler(json.JSONDecodeError)
async def bad_json_handler(req: Request, exc: json.JSONDecodeError):
    """请求体不是合法 JSON 时返回 400，避免未捕获异常冒泡成 500。"""
    return JSONResponse({"error": "请求体不是合法 JSON"}, status_code=400)


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
    uid = get_c_user(req)
    if uid is None:
        return JSONResponse({"error": "需要 C 端账号登录后使用"}, status_code=401)

    body = await req.json()
    template = TEMPLATES.get(body.get("template") or "default", TEMPLATES["default"])
    messages = [
        {"role": m["role"], "content": m["content"]}
        for m in (body.get("messages") or [])
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]
    full = [{"role": "system", "content": template["system"]}, *messages]

    # 会话落库：先只校验会话存在；用户消息在额度预占成功后再写，避免「额度已满却留下半轮对话」
    session_id = body.get("session_id")
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    if session_id is not None:
        if not store.session_exists(int(session_id)):
            return JSONResponse({"error": "会话不存在"}, status_code=404)
        session_id = int(session_id)

    # 额度：请求次数在调用前预占；token 在流结束后按 usage 累加。
    try:
        quota.reserve(uid)
    except quota.QuotaExceeded as e:
        return JSONResponse({"error": str(e)}, status_code=429)

    if session_id is not None and last_user:
        store.add_message(session_id, "user", last_user)
        store.touch_session(session_id, last_user)

    usage: dict = {}
    prompt_text = "\n".join(m["content"] for m in full)

    async def event_stream():
        answer = ""
        try:
            async for delta in provider.chat_stream(full, usage):
                answer += delta
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            if session_id is not None and answer.strip():
                store.add_message(session_id, "assistant", answer)
        except Exception as e:  # 网关/限流等错误以 SSE 事件透出，前端可展示
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
        finally:
            # 客户端断开/上游报错也要记：失败请求同样消耗 provider 额度
            try:
                quota.record_tokens(uid, usage, prompt_text, answer)
            except Exception as e:  # 记账失败不掩盖原始错误
                log.warning("记录 AI 用量失败：%s", e)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/quota")
async def quota_status(req: Request):
    denied = guard(req)
    if denied:
        return denied
    uid = get_c_user(req)
    if uid is None:
        return JSONResponse({"error": "需要 C 端账号登录后使用"}, status_code=401)
    return quota.status(uid)


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
    return FileResponse(DIST / "index.html")


# ================= 前端静态产物（React + Vite 构建，单进程部署） =================
# 构建产物目录：frontend/npm run build -> app/static/dist（vite base:'./'）。
# mount 必须放在所有 API 路由注册之后，避免 /assets 抢占其他路径；
# 未构建时（dist 不存在）跳过挂载，/ 会因文件缺失返回 404，便于及早发现漏构建。
if (DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")
