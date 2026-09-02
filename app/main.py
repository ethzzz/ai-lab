"""ai-lab 阶段1：LLM 流式聊天服务（FastAPI + SSE）。

- POST /api/chat    流式对话（后端无状态，多轮由前端传完整 messages）
- GET  /api/models  可用模型与提示词预设
- GET  /api/health  探活
- GET  /            聊天页
"""
import json
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from .config import get_settings
from .llm.qwen import QwenProvider
from .prompts.templates import TEMPLATES
from .security import check_access_code, client_ip, limiter

app = FastAPI(title="ai-lab")
provider = QwenProvider()


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

    async def event_stream():
        try:
            async for delta in provider.chat_stream(full):
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:  # 网关/限流等错误以 SSE 事件透出，前端可展示
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/")
async def index():
    return FileResponse(Path(__file__).parent / "static" / "index.html")
