// 统一 fetch 封装：相对路径（api/... 无前导斜杠，经 nginx /ailab/ 剥离前缀命中后端）、
// 401 统一跳登录、非 2xx 抛出后端 error 文案。

export class ApiError extends Error {}

/** SSO 失效：跳转 C 端登录页，登录后回跳 /ailab/。抛出以中断后续逻辑。
 *
 * ⚠️ 登录页路径是 `/login`（C 端顶层路由），**不是 `/games/login`**（2026-10-09 修）。
 *    `/games` 只是 notelab-c 的 basePath，C 端并没有 `/login` 子路由 → `/games/login` 一直 404，
 *    导致会话过期时点进 ai-lab 直接落到 404 页。nginx 的 `@ailab_login`（未登录门禁）早在
 *    2026-09-27 就改成 `/login` 了，只有前端这个 401 回调漏改。
 *    C 端登录页支持 `?next=` 回跳（见 app/(shell)/login/page.tsx 的 safeNext：
 *    只放行站内绝对路径，防开放重定向）。
 */
export function gotoLogin(): never {
  location.href = '/login?next=' + encodeURIComponent('/ailab/')
  throw new ApiError('登录已失效，正在跳转登录页…')
}

/** 通用请求：自动解析 JSON，401 跳登录，非 2xx 抛 ApiError。 */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (res.status === 401) gotoLogin()
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null // 无响应体
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error || 'HTTP ' + res.status
    throw new ApiError(msg)
  }
  return data as T
}

/** POST JSON 便捷封装。 */
export function postJson<T>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
}
