import { memo } from 'react'

import { esc, renderMd } from '../../lib/markdown'
import type { UiMessage } from './useChat'

const CURSOR = '<span class="cursor"></span>'

/**
 * 单条消息气泡，HTML 组装与原 addMsg / div.innerHTML 逐字等价：
 * - 用户消息：转义后把换行还原为 <br>；
 * - 助手消息：轻量 Markdown；流式中尾部追加 .cursor 打字光标，
 *   流结束后若为空则显示「（空回复）」；
 * - 错误消息（.msg.error）：同样走 renderMd（原代码 role !== 'user' 分支）。
 */
function MessageBubble({ m }: { m: UiMessage }) {
  let html: string
  if (m.role === 'user') html = esc(m.content).replace(/\n/g, '<br>')
  else if (m.streaming) html = renderMd(m.content) + CURSOR
  else if (m.role === 'assistant')
    html = renderMd(m.content) || '<span style="color:var(--muted)">（空回复）</span>'
  else html = renderMd(m.content)

  return <div className={'msg ' + m.role} dangerouslySetInnerHTML={{ __html: html }} />
}

// 流式期间父组件高频 setState，按内容记忆化避免整列表重渲染。
export default memo(MessageBubble)
