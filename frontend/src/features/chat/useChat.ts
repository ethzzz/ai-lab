import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

import {
  createSession,
  deleteSession as apiDeleteSession,
  getMessages,
  listSessions,
} from '../../api/sessions'
import type { ChatMessage, Session } from '../../api/types'
import { useHistory } from '../../hooks/useHistory'
import type { HistoryItemView } from '../../hooks/useHistory'
import { streamChat } from '../../lib/sse'

/** 视图层消息（含错误气泡、流式中的助手气泡），与上送后端的上下文分离。 */
export interface UiMessage {
  key: number
  role: 'user' | 'assistant' | 'error'
  content: string
  streaming?: boolean
}

export interface UseChatResult {
  msgs: UiMessage[]
  busy: boolean
  sessionId: number | null
  /** 首屏空态带快捷键提示；新建会话 / 打开空会话后与原页面一致只剩一行。 */
  fullHint: boolean
  input: string
  setInput: (v: string) => void
  send: () => void
  inputRef: RefObject<HTMLTextAreaElement | null>
  chatRef: RefObject<HTMLDivElement | null>
  sessions: HistoryItemView[]
  reloadSessions: () => Promise<void>
  onNewSession: () => void
  onOpenSession: (id: number) => void
  onDeleteSession: (id: number) => void
}

/**
 * 聊天 agent：多轮上下文（前端内存保存并全量上送，服务端同步落库）+ SSE 流式渲染 + 会话 CRUD。
 * 与原 index.html 的 messages / busy / currentSession 三个模块级变量一一对应，
 * 这里额外用 ref 镜像 busy / sessionId / ctx，避免异步流式回调读到过期闭包值。
 */
export function useChat(template: string): UseChatResult {
  const [msgs, setMsgs] = useState<UiMessage[]>([])
  const [busy, setBusyState] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [input, setInput] = useState('')
  const [fullHint, setFullHint] = useState(true)

  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const chatRef = useRef<HTMLDivElement | null>(null)
  const busyRef = useRef(false)
  const sessionRef = useRef<number | null>(null)
  const ctxRef = useRef<ChatMessage[]>([])
  const keyRef = useRef(0)

  const nextKey = (): number => (keyRef.current += 1)
  const setBusy = (v: boolean): void => {
    busyRef.current = v
    setBusyState(v)
  }
  const setSession = (id: number | null): void => {
    sessionRef.current = id
    setSessionId(id)
  }

  const { items: sessions, reload: reloadSessions, remove } = useHistory<Session>({
    list: listSessions,
    remove: apiDeleteSession,
    map: (s) => ({ id: s.id, title: s.title || '新会话', tooltip: s.title }),
    confirmText: '删除该会话及其全部消息？',
  })

  // 初始加载会话列表（等价原 loadSessions()）
  useEffect(() => {
    reloadSessions()
  }, [reloadSessions])

  // 每次消息变化后滚到底部（等价原 chatEl.scrollTop = chatEl.scrollHeight）
  useEffect(() => {
    const el = chatRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs])

  // 输入框清空后恢复初始高度（等价原 inputEl.style.height = "46px"）
  useEffect(() => {
    const el = inputRef.current
    if (el && input === '') el.style.height = '46px'
  }, [input])

  /** 清空对话区（等价原 resetChatArea）。 */
  const resetChatArea = useCallback(() => {
    ctxRef.current = []
    setFullHint(false)
    setMsgs([])
  }, [])

  /** ＋ 新建会话：不立即建库，首次发送时才 POST api/sessions。 */
  const onNewSession = useCallback(() => {
    if (busyRef.current) return
    setSession(null)
    resetChatArea()
    reloadSessions()
    inputRef.current?.focus()
  }, [resetChatArea, reloadSessions])

  /** 切换会话：载入历史消息作为上下文并渲染。 */
  const onOpenSession = useCallback(
    async (id: number) => {
      if (busyRef.current || id === sessionRef.current) return
      try {
        const j = await getMessages(id)
        const ctx: ChatMessage[] = j.items
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
        setSession(id)
        ctxRef.current = ctx
        setFullHint(false)
        setMsgs(ctx.map((m) => ({ key: nextKey(), role: m.role, content: m.content })))
        reloadSessions()
      } catch {
        /* 静默失败（401 已在 client 内跳转登录） */
      }
    },
    [reloadSessions],
  )

  /** 删除会话：流式进行中不允许删（等价原 busy 判断）。 */
  const onDeleteSession = useCallback(
    async (id: number) => {
      if (busyRef.current) return
      const confirmed = await remove(id)
      if (!confirmed) return
      if (id === sessionRef.current) {
        setSession(null)
        resetChatArea()
      }
    },
    [remove, resetChatArea],
  )

  /** 发送：SSE 流式增量渲染；失败时丢弃助手气泡、回退上下文并追加错误气泡。 */
  const send = useCallback(async () => {
    const content = input.trim()
    if (!content || busyRef.current) return
    setBusy(true)
    setInput('')

    ctxRef.current = [...ctxRef.current, { role: 'user', content }]
    setMsgs((prev) => [...prev, { key: nextKey(), role: 'user', content }])

    // 首次发送时自动创建会话，后续消息挂在同一会话下持久化（失败不阻断对话）
    if (sessionRef.current === null) {
      try {
        const s = await createSession()
        setSession(s.id)
      } catch {
        /* 忽略建会话失败 */
      }
    }

    const aKey = nextKey()
    setMsgs((prev) => [...prev, { key: aKey, role: 'assistant', content: '', streaming: true }])

    let answer = ''
    try {
      await streamChat(
        {
          messages: ctxRef.current,
          template: template || 'default',
          session_id: sessionRef.current,
        },
        (delta) => {
          answer += delta
          setMsgs((prev) => prev.map((m) => (m.key === aKey ? { ...m, content: answer } : m)))
        },
      )
      ctxRef.current = [...ctxRef.current, { role: 'assistant', content: answer }]
      setMsgs((prev) =>
        prev.map((m) => (m.key === aKey ? { ...m, content: answer, streaming: false } : m)),
      )
      reloadSessions() // 后端可能已自动生成标题 / 更新排序
    } catch (e) {
      ctxRef.current = ctxRef.current.slice(0, -1) // 移除失败的 user 消息，允许重试
      const msg = e instanceof Error ? e.message : String(e)
      setMsgs((prev) => [
        ...prev.filter((m) => m.key !== aKey),
        { key: nextKey(), role: 'error', content: '请求失败：' + msg },
      ])
    }
    setBusy(false)
    inputRef.current?.focus()
  }, [input, reloadSessions, template])

  return {
    msgs,
    busy,
    sessionId,
    fullHint,
    input,
    setInput,
    send,
    inputRef,
    chatRef,
    sessions,
    reloadSessions,
    onNewSession,
    onOpenSession,
    onDeleteSession,
  }
}
