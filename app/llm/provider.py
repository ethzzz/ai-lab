"""聊天模型抽象：统一输出异步 token 流，为后续多模型切换 / RAG 阶段留接口。"""
from abc import ABC, abstractmethod
from typing import AsyncIterator


class ChatProvider(ABC):
    """消息格式沿用 OpenAI 约定：[{"role": "system|user|assistant", "content": str}]"""

    name: str = "base"

    @abstractmethod
    async def chat_stream(self, messages: list[dict]) -> AsyncIterator[str]:
        """按序产出增量文本片段（delta）。"""
        raise NotImplementedError
