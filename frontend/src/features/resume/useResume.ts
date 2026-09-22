import { useCallback, useRef, useState } from 'react'
import type { RefObject } from 'react'

import {
  deleteResumeHistory,
  getResumeHistory,
  listResumeHistory,
  optimizeResume,
  parseResume,
} from '../../api/resume'
import type { ResumeHistoryItem, ResumeSegment } from '../../api/types'
import { useHistory } from '../../hooks/useHistory'
import type { HistoryItemView } from '../../hooks/useHistory'

/** 结果区状态机，对应原 rzResult.innerHTML 的四种取值。 */
export type ResumeResult =
  | { kind: 'idle' } // 「优化结果将在这里以…分段并排展示。」
  | { kind: 'loading' } // ⏳ 优化中…
  | { kind: 'failed' } // 优化未完成，请重试。
  | { kind: 'done'; summary: string; segments: ResumeSegment[] } // 分段并排 / 没有可展示的分段。

export interface UseResumeResult {
  title: string
  text: string
  setTitle: (v: string) => void
  setText: (v: string) => void
  chars: number
  /** 优化进行中：按钮置灰并阻止重复提交（等价原 rzOptimize.disabled = true）。 */
  busy: boolean
  status: string
  statusErr: boolean
  result: ResumeResult
  /** 最近一次非空摘要（粘滞）：原实现只设 textContent 不清空，靠 hidden 隐藏。 */
  summaryText: string
  fileRef: RefObject<HTMLInputElement | null>
  onFile: (file: File | null | undefined) => void
  optimize: () => void
  history: HistoryItemView[]
  reloadHistory: () => Promise<void>
  onOpenHistory: (id: number) => void
  onDeleteHistory: (id: number) => void
  onNew: () => void
}

/**
 * 简历优化 agent：上传解析 → 校对 → LLM 分段优化 → 历史回填 / 删除。
 * 状态文案、字段与原 index.html 的 rz* 逻辑逐条对齐。
 */
export function useResume(): UseResumeResult {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const [statusErr, setStatusErr] = useState(false)
  const [result, setResult] = useState<ResumeResult>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)
  const [summaryText, setSummaryText] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)
  const sourceNameRef = useRef('') // 等价原 rzSourceName

  const setSt = useCallback((msg: string, isErr?: boolean) => {
    setStatus(msg || '')
    setStatusErr(!!isErr)
  }, [])

  const { items: history, reload: reloadHistory, remove } = useHistory<ResumeHistoryItem>({
    list: listResumeHistory,
    remove: deleteResumeHistory,
    map: (it) => ({
      id: it.id,
      title: it.title || '未命名简历',
      tooltip: (it.title || '') + ' · ' + (it.segment_count || 0) + ' 段 · ' + it.created_at,
    }),
    confirmText: '删除这条优化记录？',
  })

  const chars = text.trim().length

  /** 上传解析：点击选择或拖拽落下同一入口。 */
  const onFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return
      setSt('解析中…')
      try {
        const j = await parseResume(file)
        setTitle(j.title || '')
        setText(j.text || '')
        sourceNameRef.current = file.name
        setSt('已解析：' + file.name + '（' + j.chars + ' 字），可校对后点「开始优化」')
      } catch (e) {
        setSt('解析失败：' + (e instanceof Error ? e.message : String(e)), true)
      }
    },
    [setSt],
  )

  /** 开始优化：空文本禁用按钮，结果按 summary + segments 分段展示，成功后刷新历史。 */
  const optimize = useCallback(async () => {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    setSt('AI 正在优化，请稍候（约 10~30 秒）…')
    setResult({ kind: 'loading' })
    try {
      const j = await optimizeResume(body, title.trim(), sourceNameRef.current)
      if (j.summary) setSummaryText(j.summary)
      setResult({ kind: 'done', summary: j.summary || '', segments: j.segments || [] })
      setSt('✅ 优化完成，已存入历史（#' + j.id + '）')
      reloadHistory()
    } catch (e) {
      setSt('优化失败：' + (e instanceof Error ? e.message : String(e)), true)
      setResult({ kind: 'failed' })
    }
    setBusy(false)
  }, [busy, text, title, setSt, reloadHistory])

  /** 载入历史详情：回填标题 / 原文 / 摘要 / 分段。 */
  const onOpenHistory = useCallback(
    async (id: number) => {
      try {
        const j = await getResumeHistory(id)
        setTitle(j.title || '')
        setText(j.raw_text || '')
        sourceNameRef.current = j.source_name || ''
        if (j.summary) setSummaryText(j.summary)
        setResult({ kind: 'done', summary: j.summary || '', segments: j.segments || [] })
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

  /** ＋ 新建优化：清空全部输入与结果（含 file input，等价原 rzFile.value = ""）。 */
  const onNew = useCallback(() => {
    setTitle('')
    setText('')
    sourceNameRef.current = ''
    setResult({ kind: 'idle' })
    setSt('')
    if (fileRef.current) fileRef.current.value = ''
  }, [setSt])

  return {
    title,
    text,
    setTitle,
    setText,
    chars,
    busy,
    status,
    statusErr,
    result,
    summaryText,
    fileRef,
    onFile,
    optimize,
    history,
    reloadHistory,
    onOpenHistory,
    onDeleteHistory,
    onNew,
  }
}
