import type { ViewKey } from './api/types'

/**
 * 三个工具的路由表（HashRouter）：URL 形如 /ailab/#/chat、/#/resume、/#/cmdgen。
 *
 * 为什么用 hash 路由而不是 browser 路由：nginx `location ^~ /ailab/` 只把 `/`
 * 交给 FastAPI 返回 index.html，真实深层路径（如 /ailab/resume）会 404；
 * hash 位于 `#` 之后，服务端永远只收到 /ailab/，因此无需改 nginx / 后端，
 * vite.config.ts 的 base:'./' 与相对路径 fetch('api/...') 也全部保持不变。
 */
export interface RouteEntry {
  view: ViewKey
  path: string
  label: string
}

export const ROUTES: RouteEntry[] = [
  { view: 'chat', path: '/chat', label: '💬 聊天' },
  { view: 'resume', path: '/resume', label: '📄 简历优化' },
  { view: 'cmdgen', path: '/cmdgen', label: '🖥️ 命令获取' },
]

/** 缺省视图：等价原 useState<ViewKey>('chat') 的初值。 */
export const DEFAULT_VIEW: ViewKey = 'chat'

/** 根路径与未匹配路径的重定向目标（'/chat'）。 */
export const DEFAULT_PATH: string = ROUTES.find((r) => r.view === DEFAULT_VIEW)?.path ?? '/chat'

/** 由当前 hash 路径解析视图；带尾斜杠或子路径也归一到对应工具，其余回落缺省视图。 */
export function viewFromPath(pathname: string): ViewKey {
  const p = pathname.replace(/\/+$/, '') || '/'
  const hit = ROUTES.find((r) => p === r.path || p.startsWith(r.path + '/'))
  return hit ? hit.view : DEFAULT_VIEW
}
