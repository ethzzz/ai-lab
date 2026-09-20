"""Qwen（阿里云百炼 Token Plan，OpenAI 兼容网关）实现：AsyncOpenAI 流式调用。"""
from typing import AsyncIterator

from openai import AsyncOpenAI

from ..config import get_settings
from .provider import ChatProvider


class QwenProvider(ChatProvider):
    name = "qwen"

    def __init__(self) -> None:
        s = get_settings()
        self.model = s.llm_model
        self._client = AsyncOpenAI(base_url=s.llm_base_url, api_key=s.qwen_api_key)

    async def chat_stream(self, messages: list[dict], enable_thinking: bool = True) -> AsyncIterator[str]:
        # enable_thinking=False 关闭 qwen3 思考链：结构化长输出场景显著提速（对齐 notelab-java QwenClient）
        extra = {} if enable_thinking else {"extra_body": {"enable_thinking": False}}
        stream = await self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            stream=True,
            **extra,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
