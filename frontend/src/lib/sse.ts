// SSE 流式解析（保留 POST body，故用 fetch + ReadableStream，而非 EventSource）。
import { gotoLogin } from '../api/client'

/**
 * 发起流式聊天请求，逐段回调 delta；遇到 error 事件或非 2xx 抛出。
 * body 形如 { messages, template, session_id }。
 */
export async function streamChat(
  body: unknown,
  onDelta: (delta: string) => void,
): Promise<void> {
  const res = await fetch('api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 401) gotoLogin()
  if (!res.ok) {
    let msg = 'HTTP ' + res.status
    try {
      const j = await res.json()
      if (j.error) msg = j.error
    } catch {
      /* 无体 */
    }
    throw new Error(msg)
  }
  if (!res.body) throw new Error('当前浏览器不支持流式响应')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''
    for (const part of parts) {
      const line = part.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue
      const obj = JSON.parse(payload) as { delta?: string; error?: string }
      if (obj.error) throw new Error(obj.error)
      if (obj.delta) onDelta(obj.delta)
    }
  }
}
