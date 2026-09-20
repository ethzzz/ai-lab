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

## 简历优化（独立应用）

与聊天并列的第二个应用（顶部 tab 切换）：上传 `.docx / .pdf / .txt / .md` 简历 → 提取纯文本（可人工校对）→ LLM 分段优化 → 前端「原文 | 优化后 + 💡理由」并排对比 → 历史记录可回看/删除。

- 代码：`app/resume/`（`parser.py` 解析、`optimizer.py` LLM 优化、`store.py` 持久化、`router.py` 接口）
- 依赖：`python-docx`（docx 段落+表格）、`pypdf`（文字版 pdf 逐页）；pdf 仅支持带文字层的版本，扫描版/加密版会报错
- 数据：SQLite 表 `resume_optimizations`（`id, title, source_name, raw_text, result_json, model, created_at`）
- 优化调用关闭 qwen3 思考链（`enable_thinking=false`），避免结构化长输出前长时间思考导致超时

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
| `DB_PATH` | SQLite 数据库文件路径 | `data/ai-lab.db` |

## 访问控制

- 配置 `ACCESS_CODE` 后，`/api/chat`、`/api/models` 需携带正确访问码（否则 401）；聊天页首次打开需输入访问码（存浏览器 localStorage）
- 每 IP 滑动窗口限流（超限 429）；`/api/health` 保持开放供探活；会话接口与简历优化接口同样需访问码

## 服务器部署（生产）

- 目录：`/root/ai-lab`，进程：pm2 `ai-lab`，端口：8002
- 启动：`pm2 start /root/ai-lab/.venv/bin/uvicorn --interpreter /root/ai-lab/.venv/bin/python --name ai-lab --cwd /root/ai-lab -- app.main:app --host 127.0.0.1 --port 8002`（必须指定 --interpreter，否则 pm2 会用 Node 执行 Python 脚本报 SyntaxError）
- `.env` 仅存在于服务器，不入库

## API

- `POST /api/chat`：body `{"messages": [{"role": "user", "content": "..."}], "template": "default", "session_id": 1}`，SSE 逐块返回 `data: {"delta": "..."}`，结束 `data: [DONE]`，出错 `data: {"error": "..."}`；携带 `session_id` 时用户/助手消息自动落库（助手回复在流结束后保存）
- `GET /api/models`：模型名 + 提示词预设列表
- `GET /api/health`：探活
- `GET /api/sessions`：会话列表（按更新时间倒序，最多 100 条）
- `POST /api/sessions`：新建会话，可选 `{"title": "..."}`
- `GET /api/sessions/{id}/messages`：会话全部消息（按时间正序）
- `PUT /api/sessions/{id}`：重命名 `{"title": "..."}`
- `DELETE /api/sessions/{id}`：删除会话及其全部消息
- `POST /api/resume/parse`：multipart `file`，返回 `{ok, title, text, chars}`；格式/大小/空文本错误 400
- `POST /api/resume/optimize`：body `{"text", "title", "source_name"}`，返回 `{id, summary, segments}` 并落库；LLM/解析失败 502/422
- `GET /api/resume/history`：历史列表 `{items:[{id, title, source_name, model, created_at, segment_count}]}`
- `GET /api/resume/history/{id}`：详情（含 `raw_text` / `summary` / `segments`）
- `DELETE /api/resume/history/{id}`：删除记录
