"""简历优化：调用 LLM 按模块分段输出结构化 JSON（原文 / 优化后 / 理由）。

复用聊天用的 QwenProvider（AsyncOpenAI 流式）；此处把流式增量收集完整后再解析，
因为并排对比 UI 需要完整结构，后端集中做 JSON 容错最可靠。
"""
import json

from ..llm.qwen import QwenProvider

_provider = QwenProvider()

SYSTEM_PROMPT = (
    "你是一名资深 HR 与简历教练，擅长把普通简历改写成有竞争力的表达。\n"
    "任务：读取用户提供的简历文本，按简历的自然模块（如基本信息、教育经历、"
    "工作经历、项目经历、专业技能、自我评价等）逐段优化。\n"
    "优化原则：\n"
    "1. 用强动词开头、量化成果（数字 / 百分比 / 规模），删除空话套话；\n"
    "2. 不虚构、不改变事实，只在表达与结构层面提升；\n"
    "3. 保持与原文一致的语言（中文简历输出中文）；\n"
    "4. 每段给出具体、可操作的优化理由，指向用词 / 结构 / 量化的改动点。\n"
    "严格只输出如下 JSON，不要任何额外文字，也不要用 markdown 代码块包裹：\n"
    '{"summary": "一句话整体评价", "segments": ['
    '{"section": "模块名", "original": "该模块原文", "optimized": "优化后文本", "reason": "为什么这样改"}'
    "]}"
)


async def optimize(text: str) -> dict:
    """流式收集 LLM 输出 → 容错解析 → 返回 {summary, segments}；异常抛 ValueError。"""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": text},
    ]
    buf = ""
    async for delta in _provider.chat_stream(messages, enable_thinking=False):
        buf += delta
    return _parse_result(buf)


def _parse_result(raw: str) -> dict:
    s = (raw or "").strip()
    # 容错：剥掉可能的 ```json 包裹，截取首个 { 到末个 }
    i, j = s.find("{"), s.rfind("}")
    if i == -1 or j == -1 or j <= i:
        raise ValueError("模型未返回有效的 JSON 结果，请重试")
    try:
        data = json.loads(s[i:j + 1])
    except json.JSONDecodeError as e:
        raise ValueError("模型返回的 JSON 解析失败，请重试") from e
    segments = data.get("segments")
    if not isinstance(segments, list) or not segments:
        raise ValueError("模型未返回任何优化分段，请重试")
    clean = []
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        optimized = str(seg.get("optimized", "")).strip()
        if not optimized:
            continue
        clean.append({
            "section": str(seg.get("section", "")).strip() or "未命名模块",
            "original": str(seg.get("original", "")),
            "optimized": optimized,
            "reason": str(seg.get("reason", "")).strip(),
        })
    if not clean:
        raise ValueError("模型返回的分段内容为空，请重试")
    return {"summary": str(data.get("summary", "")).strip(), "segments": clean}
