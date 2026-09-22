import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent, RefObject } from 'react'

import {
  deleteCmdHistory,
  generateCmd,
  getCmdHistory,
  listCmdHistory,
} from '../../api/cmdgen'
import type { CmdHistoryItem, CmdPlatform } from '../../api/types'
import { useHistory } from '../../hooks/useHistory'
import type { HistoryItemView } from '../../hooks/useHistory'

/** 结果区状态机，对应原 cgResult.innerHTML 的四种取值。 */
export type CmdResult =
  | { kind: 'idle' } // 「命令结果将按操作系统分类展示在这里…」
  | { kind: 'loading' } // ⏳ 生成中…
  | { kind: 'failed' } // 生成未完成，请重试。
  | { kind: 'done'; intent: string; platforms: CmdPlatform[] }

/** 系统图标（照搬原 osIcon）。 */
export function osIcon(os?: string): string {
  const s = (os || '').toLowerCase()
  if (s.includes('win')) return '🪟'
  if (s.includes('mac') || s.includes('os x') || s.includes('darwin')) return '🍎'
  if (s.includes('linux') || s.includes('ubuntu') || s.includes('unix')) return '🐧'
  return '💻'
}

export interface UseCmdgenResult {
  text: string
  setText: (v: string) => void
  /** 生成进行中：按钮置灰并阻止重复提交（等价原 cgGen.disabled = true）。 */
  busy: boolean
  status: string
  statusErr: boolean
  result: CmdResult
  /** 最近一次非空意图（粘滞）：原实现只设 textContent 不清空，靠 hidden 隐藏。 */
  intentText: string
  textRef: RefObject<HTMLTextAreaElement | null>
  generate: () => void
  /** Ctrl/Cmd+Enter 触发生成。 */
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  history: HistoryItemView[]
  reloadHistory: () => Promise<void>
  onOpenHistory: (id: number) => void
  onDeleteHistory: (id: number) => void
  onNew: () => void
}

/**
 * 命令获取 agent：自然语言描述 → 多系统等价命令 + 参数说明；支持历史回填 / 删除。
 * 状态文案与原 cg* 逻辑逐条对齐。
 */
export function useCmdgen(): UseCmdgenResult {
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const [statusErr, setStatusErr] = useState(false)
  const [result, setResult] = useState<CmdResult>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)
  const [intentText, setIntentText] = useState('')
  const textRef = useRef<HTMLTextAreaElement | null>(null)

  const setSt = useCallback((msg: string, isErr?: boolean) => {
    setStatus(msg || '')
    setStatusErr(!!isErr)
  }, [])

  const { items: history, reload: reloadHistory, remove } = useHistory<CmdHistoryItem>({
    list: listCmdHistory,
    remove: deleteCmdHistory,
    map: (it) => ({
      id: it.id,
      title: it.query || it.intent || '未命名查询',
      tooltip: (it.query || '') + ' · ' + (it.platform_count || 0) + ' 系统 · ' + it.created_at,
    }),
    confirmText: '删除这条命令记录？',
  })

  const generate = useCallback(async () => {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    setSt('AI 正在生成命令，请稍候…')
    setResult({ kind: 'loading' })
    try {
      const j = await generateCmd(body)
      if (j.intent) setIntentText(j.intent)
      setResult({ kind: 'done', intent: j.intent || '', platforms: j.platforms || [] })
      setSt('✅ 已生成 ' + (j.platforms || []).length + ' 个系统的命令，并存入历史（#' + j.id + '）')
      reloadHistory()
    } catch (e) {
      setSt('生成失败：' + (e instanceof Error ? e.message : String(e)), true)
      setResult({ kind: 'failed' })
    }
    setBusy(false)
  }, [busy, text, setSt, reloadHistory])

  /** Ctrl/Cmd+Enter 触发生成（等价原 cgText keydown）。 */
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (!busy && text.trim()) generate()
      }
    },
    [busy, generate, text],
  )

  const onOpenHistory = useCallback(
    async (id: number) => {
      try {
        const j = await getCmdHistory(id)
        setText(j.query || '')
        if (j.intent) setIntentText(j.intent)
        setResult({ kind: 'done', intent: j.intent || '', platforms: j.platforms || [] })
        setSt('已载入历史记录 #' + id + '（' + j.created_at + '）')
      } catch {
        /* 静默失败 */
      }
    },
    [setSt],
  )

  const onDeleteHistory = useCallback(
    async (id: number) => {
      await remove(id)
    },
    [remove],
  )

  /** ＋ 新建查询：清空输入与结果。 */
  const onNew = useCallback(() => {
    setText('')
    setResult({ kind: 'idle' })
    setSt('')
  }, [setSt])

  return {
    text,
    setText,
    busy,
    status,
    statusErr,
    result,
    intentText,
    textRef,
    generate,
    onKeyDown,
    history,
    reloadHistory,
    onOpenHistory,
    onDeleteHistory,
    onNew,
  }
}
