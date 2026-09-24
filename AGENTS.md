# ai-lab —— AI 试验场（FastAPI + Vite）

> 本文件只写「本仓特有、不知道就会出错」的信息。阶段路线图、完整 API 清单、前端目录树见本仓 `README.md`；全局信息见根 `../AGENTS.md`。

## 定位
LLM 应用练习场，三个并列工具：**聊天** `/#/chat`、**简历优化** `/#/resume`、**命令获取** `/#/cmdgen`。
后端 Python FastAPI，前端 React + Vite + TS——**前端是纯静态产物，构建后由 FastAPI 直接挂载，单进程部署**（不引入独立前端服务、不改 nginx）。

| 项 | 值 |
|---|---|
| 服务器目录 | `/root/ai-lab` |
| pm2 进程 | `ai-lab` |
| 端口 | **127.0.0.1:8002**（只绑本地） |
| nginx | `location ^~ /ailab/`，**剥离前缀**转发，并挂 SSO 门禁 |
| 线上入口 | http://117.72.32.87/ailab/ |
| GitHub | `git@github.com:ethzzz/ai-lab.git`（main） |
| 数据 | SQLite `/root/ai-lab/data/ai-lab.db`（会话 / 简历 / 命令历史） |

## 启动方式（照抄，别自己拼）
```bash
pm2 start /root/ai-lab/.venv/bin/uvicorn --interpreter /root/ai-lab/.venv/bin/python \
  --name ai-lab --cwd /root/ai-lab -- app.main:app --host 127.0.0.1 --port 8002
```
**必须带 `--interpreter`**，否则 pm2 会用 Node 去执行 Python 脚本，报 SyntaxError。

## 构建与发布（只有改前端才需要构建）
```bash
ssh myapp
cd /root/ai-lab/frontend && npm install && npm run build   # → ../app/static/dist
pm2 restart ai-lab                                          # 单进程：uvicorn 同时服务 API 与静态产物
```
- 产物 `app/static/dist/` 已入 `.gitignore`，不入库。
- 纯后端改动（含访问控制）**不需要重新构建前端**，`pm2 restart ai-lab` 即可。

## 四个「改了必炸」的约定
1. **前端必须用 `HashRouter`，不能换成 `BrowserRouter`**。nginx 只把 `/` 交给 FastAPI，真实深层路径（如 `/ailab/resume`）会 404；而 hash 位于 `#` 之后，服务端永远只收到 `/ailab/`，因此无需 SPA 回退、也无需改 nginx。路由表在 `frontend/src/routes.ts`。
2. **`vite.config.ts` 的 `base` 必须为 `'./'`**。nginx 用带尾斜杠的 `proxy_pass http://127.0.0.1:8002/;` 剥离 `/ailab` 前缀，用绝对路径加载资源会 404 白屏。
3. **前端请求一律用相对路径 `api/...`（无前导斜杠）**。写成 `/api/...` 会误命中同机的 notelab-java（:8001）。
4. **顶栏「返回主页」必须是原生锚点 `<a href="/">`**，不能用 react-router 的 `Link`（`Link` 只在 hash 应用内导航，会被重定向回 `/#/chat`）。

## 访问控制（fail-closed，别加绕过开关）
- nginx `location ^~ /ailab/` 用 `auth_request` 调 Java `GET /api/auth/verify`，未登录 302 到 `/games/login?next=`；通过时透传 `X-Auth-User` 头。
- 后端消费该头，**只认 `c:<id>` 前缀**（`app/security.py:get_c_user`）；头缺失 / 为空 / `b:<id>`（B 端管理员）/ 畸形一律返回 **401**（非 403）。该头由 nginx `proxy_set_header` 显式覆盖，客户端伪造无效；uvicorn 又只绑 127.0.0.1，无法绕过。
- 校验收敛在 `app/security.py:guard` 单点：C 端登录 → 访问码 → 限流，顺序执行。**新增业务路由必须挂这个 guard**。
- `/api/health` 保持开放（匿名可访问），每日巡检依赖它探活。
- **数据暂未按用户隔离**：会话 / 简历 / 命令历史仍全体共享，表无 owner 字段。要隔离需先加字段 + 迁移。
- `ACCESS_CODE` 为空即不校验访问码（服务器已置空，登录态由 nginx SSO 负责）。

## 纪律与禁区
- `.env` **只存在于服务器**，不入库；`QWEN_API_KEY` 严禁硬编码或提交。
- LLM 调用统一走 OpenAI 兼容网关（`LLM_BASE_URL` + `LLM_MODEL`，默认 token-plan + `qwen3.8-max`）；`qwen3` 系列生成**结构化长输出时要关思考链**（`enable_thinking=false`），否则会在出结果前长时间思考导致超时。
- 不动 `notelab-java` / `notelab-b` / `notelab-c` / `myapp` / 旧 Python 版 `notelab`。
- 本目录是**镜像**：真正生效的代码在服务器 `/root/ai-lab`。别只在本地改。
