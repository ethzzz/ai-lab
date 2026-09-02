# ai-lab

AI 知识库问答助手 —— 传统开发工程师转型 AI 工程师的分阶段练习项目。
后端 Python（FastAPI），复用阿里云百炼 Token Plan（qwen3.8-max，OpenAI 兼容网关）。

## 阶段路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| 1 | LLM 聊天服务：SSE 流式输出 + 模型抽象层 + 提示词预设 + 聊天页 | 已完成 |
| 2 | RAG 最小闭环：文档上传、切块、Embedding、向量检索、带引用回答 | 未开始 |
| 3 | 检索质量升级：混合检索、重排、对话历史改写、引用溯源 | 未开始 |
| 4 | 工具调用：Function Calling / MCP、结构化输出 | 未开始 |
| 5 | Agent 化：多步任务、记忆与规划 | 未开始 |
| 6 | 工程化：评测集、LLM-as-judge、成本看板、安全护栏 | 未开始 |

## 本地开发

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt        # Windows: .venv\Scripts\pip
cp .env.example .env                              # 填入 QWEN_API_KEY
.venv/bin/uvicorn app.main:app --port 8002
```

打开 `http://127.0.0.1:8002/` 即可对话。

## 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `QWEN_API_KEY` | 百炼 Token Plan Key | 无（必填） |
| `LLM_BASE_URL` | OpenAI 兼容网关 | Token Plan 网关 |
| `LLM_MODEL` | 模型名 | `qwen3.8-max` |
| `ACCESS_CODE` | 静态访问码（请求头 `X-Access-Code`），为空则不校验 | 空 |
| `RATE_LIMIT_RPM` | 每 IP 每分钟最多 API 请求数 | 20 |

## 访问控制

- 配置 `ACCESS_CODE` 后，`/api/chat`、`/api/models` 需携带正确访问码（否则 401）；聊天页首次打开需输入访问码（存浏览器 localStorage）
- 每 IP 滑动窗口限流（超限 429）；`/api/health` 保持开放供探活

## 服务器部署（生产）

- 目录：`/root/ai-lab`，进程：pm2 `ai-lab`，端口：8002
- 启动：`pm2 start /root/ai-lab/.venv/bin/uvicorn --interpreter /root/ai-lab/.venv/bin/python --name ai-lab --cwd /root/ai-lab -- app.main:app --host 127.0.0.1 --port 8002`（必须指定 --interpreter，否则 pm2 会用 Node 执行 Python 脚本报 SyntaxError）
- `.env` 仅存在于服务器，不入库

## API

- `POST /api/chat`：body `{"messages": [{"role": "user", "content": "..."}], "template": "default"}`，SSE 逐块返回 `data: {"delta": "..."}`，结束 `data: [DONE]`，出错 `data: {"error": "..."}`
- `GET /api/models`：模型名 + 提示词预设列表
- `GET /api/health`：探活
