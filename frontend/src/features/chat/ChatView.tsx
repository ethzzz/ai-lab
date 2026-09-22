import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'
import type { UseChatResult } from './useChat'

/**
 * 聊天视图：#chat 消息滚动区 + footer 输入区。
 * DOM 结构 / id / class 与原 #chatView 一致，CSS 原样命中。
 */
export default function ChatView({ c, hidden }: { c: UseChatResult; hidden: boolean }) {
  return (
    <div id="chatView" className="view" hidden={hidden}>
      <div id="chat" ref={c.chatRef}>
        {c.msgs.length === 0 && (
          <div className="empty" id="empty">
            向 AI 提问，开始对话
            {c.fullHint && (
              <>
                <br />
                Enter 发送 · Shift+Enter 换行
              </>
            )}
          </div>
        )}
        {c.msgs.map((m) => (
          <MessageBubble key={m.key} m={m} />
        ))}
      </div>
      <ChatInput
        value={c.input}
        disabled={c.busy}
        onChange={c.setInput}
        onSend={c.send}
        inputRef={c.inputRef}
      />
    </div>
  )
}
