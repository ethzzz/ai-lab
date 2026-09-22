"""命令获取：调用 LLM 把自然语言操作意图翻译成多系统等价命令（结构化 JSON）。

复用聊天用的 QwenProvider（AsyncOpenAI 流式）；此处把流式增量收集完整后再解析，
因为按系统分类的卡片 UI 需要完整结构，后端集中做 JSON 容错最可靠。
关闭 qwen3 思考链（enable_thinking=False）以规避结构化长输出前的思考超时。
"""
import json

from ..llm.qwen import QwenProvider

_provider = QwenProvider()

SYSTEM_PROMPT = (
    "你是一名精通多操作系统命令行（Shell）的资深专家。\n"
    "任务：把用户用自然语言描述的操作意图，翻译成主流操作系统下等价的可执行命令，"
    "并列出常用扩展参数及其含义。\n"
    "要求：\n"
    "1. 按系统分类给出命令，默认覆盖：Linux（bash/zsh）、macOS（zsh）、"
    "Windows 命令提示符（CMD）、Windows PowerShell；若某系统确无等价命令可省略该项；\n"
    "2. 每个系统只给最直接、最常用的一条命令（command 字段），不要把多个方案堆在一起；\n"
    "3. params 逐个列出该命令用到的或有价值的扩展参数：flag 为参数本身，desc 为中文含义解释；\n"
    "4. 命令必须真实可用、语法正确，区分不同 Shell 的参数风格"
    "（如 Linux 用 -la、Windows CMD 用 /a、PowerShell 用 -Force）；\n"
    "5. note 用一句话补充注意事项、版本差异或常见坑，没有可留空字符串；\n"
    "6. intent 用一句话概括用户的操作意图；\n"
    "7. 全程用中文解释，命令与参数本身保持原文，不要翻译命令。\n"
    "严格只输出如下 JSON，不要任何额外文字，也不要用 markdown 代码块包裹：\n"
    '{"intent": "一句话意图", "platforms": ['
    '{"os": "系统名(Linux / macOS / Windows)", "shell": "对应 Shell(bash / zsh / CMD / PowerShell)", '
    '"command": "可执行命令", "params": [{"flag": "参数", "desc": "参数含义"}], "note": "补充说明"}'
    "]}"
)


async def generate(text: str) -> dict:
    """流式收集 LLM 输出 → 容错解析 → 返回 {intent, platforms}；结果异常抛 ValueError。"""
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
    platforms = data.get("platforms")
    if not isinstance(platforms, list) or not platforms:
        raise ValueError("模型未返回任何系统命令，请重试")
    clean = []
    for p in platforms:
        if not isinstance(p, dict):
            continue
        command = str(p.get("command", "")).strip()
        if not command:
            continue
        params = []
        raw_params = p.get("params")
        if isinstance(raw_params, list):
            for it in raw_params:
                if not isinstance(it, dict):
                    continue
                flag = str(it.get("flag", "")).strip()
                desc = str(it.get("desc", "")).strip()
                if not flag and not desc:
                    continue
                params.append({"flag": flag, "desc": desc})
        clean.append({
            "os": str(p.get("os", "")).strip() or "其他",
            "shell": str(p.get("shell", "")).strip(),
            "command": command,
            "params": params,
            "note": str(p.get("note", "")).strip(),
        })
    if not clean:
        raise ValueError("模型返回的命令内容为空，请重试")
    return {"intent": str(data.get("intent", "")).strip(), "platforms": clean}
