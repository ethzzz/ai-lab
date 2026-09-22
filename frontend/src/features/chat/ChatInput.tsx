import type { KeyboardEvent, RefObject } from 'react'

interface Props {
  value: string
  disabled: boolean
  onChange: (v: string) => void
  onSend: () => void
  inputRef: RefObject<HTMLTextAreaElement | null>
}

/** 输入区：Enter 发送 / Shift+Enter 换行，高度随内容自适应（46 → 最多 140px）。 */
export default function ChatInput({ value, disabled, onChange, onSend, inputRef }: Props) {
  const autoGrow = (): void => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '46px'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }

  return (
    <footer>
      <div className="input-row">
        <textarea
          id="input"
          ref={inputRef}
          placeholder="输入消息…"
          rows={1}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            autoGrow()
          }}
          onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
        />
        <button id="send" onClick={onSend} disabled={disabled}>
          发送
        </button>
      </div>
    </footer>
  )
}
