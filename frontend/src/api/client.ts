// 统一 fetch 封装：相对路径（api/... 无前导斜杠，经 nginx /ailab/ 剥离前缀命中后端）、
// 401 统一跳登录、非 2xx 抛出后端 error 文案。

export class ApiError extends Error {}

/** SSO 失效：跳转 C 端登录页，登录后回跳 /ailab/。抛出以中断后续逻辑。 */
export function gotoLogin(): never {
  location.href = '/games/login?next=' + encodeURIComponent('/ailab/')
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
