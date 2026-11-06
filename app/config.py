"""配置：进程环境变量优先，兜底加载 ./.env（密钥不入库）。"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Qwen Token Plan（OpenAI 兼容网关）
    qwen_api_key: str = ""
    llm_base_url: str = "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
    llm_model: str = "qwen3.8-max"

    # 每日额度（0 = 不限制）：聊天接口按 C 端用户 + 全站双维度计数
    # 20 次 / 10 万 tokens / 300 次 / 200 万 tokens 是个人站的保守默认值，
    # 需要调整时在服务器 .env 里改 DAILY_* 变量，不用改代码。
    daily_requests_per_user: int = 20
    daily_tokens_per_user: int = 100_000
    daily_requests_global: int = 300
    daily_tokens_global: int = 2_000_000

    # 访问控制：访问码为空则不校验（本地开发）；限流 = 每 IP 每窗口最多 N 次 API 请求
    access_code: str = ""
    rate_limit_rpm: int = 20

    # 持久化：SQLite 数据库文件（相对路径基于进程 cwd）
    db_path: str = "data/ai-lab.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
