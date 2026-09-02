"""配置：进程环境变量优先，兜底加载 ./.env（密钥不入库）。"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Qwen Token Plan（OpenAI 兼容网关）
    qwen_api_key: str = ""
    llm_base_url: str = "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
    llm_model: str = "qwen3.8-max"


@lru_cache
def get_settings() -> Settings:
    return Settings()
