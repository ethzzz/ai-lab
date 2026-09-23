import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import AppLayout from './AppLayout'
import { DEFAULT_PATH, ROUTES } from './routes'

/**
 * 路由壳：三个工具各占一条独立路由（HashRouter），URL 形如 /ailab/#/chat。
 *
 * 用 HashRouter 而非 BrowserRouter 的原因：nginx `location ^~ /ailab/` 只把 `/`
 * 交给 FastAPI 返回 index.html，真实深层路径（/ailab/resume）会 404；hash 位于
 * `#` 之后，服务端永远只收到 /ailab/，因此无需改 nginx / 后端，
 * vite 的 base:'./' 与相对路径 fetch('api/...') 也全部保持不变。
 *
 * 保状态：三个工具共用**同一个** AppLayout 实例（无路径布局路由 + 模块级固定
 * element 引用 LAYOUT），路由切换只改变 AppLayout 内部由 useLocation 派生的
 * view，不会卸载重建它，因此三个 hook 的内存态（消息/会话/草稿/结果）全部保留。
 *
 * 子路由只负责「匹配」，不负责渲染：视图由 AppLayout 用 hidden 显隐（三个 View 始终挂载），
 * 布局里没有 <Outlet/>，所以子路由元素统一用返回 null 的 EmptyRoute（显式给 element
 * 也能避免 react-router 对「叶子路由没有 element」的开发期告警）。
 */
const LAYOUT = <AppLayout />
function EmptyRoute() {
  return null
}
const EMPTY = <EmptyRoute />

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={LAYOUT}>
          {ROUTES.map((r) => (
            <Route key={r.view} path={r.path} element={EMPTY} />
          ))}
        </Route>
        {/* 根路径与任何未匹配路径都回到聊天视图（等价原默认 tab） */}
        <Route path="/" element={<Navigate to={DEFAULT_PATH} replace />} />
        <Route path="*" element={<Navigate to={DEFAULT_PATH} replace />} />
      </Routes>
    </HashRouter>
  )
}
