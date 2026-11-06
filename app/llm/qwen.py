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

    async def chat_stream(
        self,
        messages: list[dict],
        usage_out: dict | None = None,
        enable_thinking: bool = True,
    ) -> AsyncIterator[str]:
        # enable_thinking=False 关闭 qwen3 思考链：结构化长输出场景显著提速（对齐 notelab-java QwenClient）
        extra = {} if enable_thinking else {"extra_body": {"enable_thinking": False}}
        # 只有需要记账的调用（聊天）才请求 usage，避免给不关心用量的旧调用增加兼容面
        options = {"stream_options": {"include_usage": True}} if usage_out is not None else {}
        stream = await self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            stream=True,
            **options,
            **extra,
        )
        async for chunk in stream:
            usage = getattr(chunk, "usage", None)
            if usage_out is not None and usage is not None:
                usage_out.update(
                    {
                        "prompt_tokens": usage.prompt_tokens or 0,
                        "completion_tokens": usage.completion_tokens or 0,
                        "total_tokens": usage.total_tokens or 0,
                    }
                )
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
