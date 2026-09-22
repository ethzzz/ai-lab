import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base:'./' 生成相对资源路径，适配 nginx `location ^~ /ailab/` 的
// `proxy_pass http://127.0.0.1:8002/;`（尾斜杠剥离 /ailab 前缀）：
//   浏览器 /ailab/assets/* -> 后端收到 /assets/*（由 FastAPI StaticFiles 挂载）。
// 产物输出到后端 static/dist，pm2 仍只跑 uvicorn 单进程，无需独立前端服务。
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: '../app/static/dist',
    emptyOutDir: true,
  },
})
