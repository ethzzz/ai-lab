import type { ResumeResult } from './useResume'

const IDLE_TEXT = '优化结果将在这里以「原文 → 优化后 + 理由」分段并排展示。'

interface Props {
  result: ResumeResult
  /** 摘要文本（粘滞）：与原实现一致，仅在拿到非空 summary 时更新，隐藏时不清空。 */
  summaryText: string
}

/**
 * 右栏结果区：摘要条 .rz-summary + .rz-result 内的分段卡片。
 * 结构 / 类名与原 renderSegments 生成的 HTML 一致（React 天然转义，无需 esc）。
 * 显隐由「本次 summary 是否非空」决定，文本沿用最后一次非空 summary ——
 * 等价原版 renderSegments：summary 为空时只置 hidden=true，从不清空 textContent。
 */
export default function ResumeSegments({ result, summaryText }: Props) {
  const showSummary = result.kind === 'done' && !!result.summary
  const segments = result.kind === 'done' ? result.segments : []

  return (
    <>
      <div className="rz-summary" id="rzSummary" hidden={!showSummary}>
        {summaryText ? '📋 ' + summaryText : ''}
      </div>
      <div className="rz-result" id="rzResult">
        {result.kind === 'idle' && <div className="rz-empty">{IDLE_TEXT}</div>}
        {result.kind === 'loading' && <div className="rz-empty">⏳ 优化中…</div>}
        {result.kind === 'failed' && <div className="rz-empty">优化未完成，请重试。</div>}
        {result.kind === 'done' && !segments.length && (
          <div className="rz-empty">没有可展示的分段。</div>
        )}
        {result.kind === 'done' &&
          segments.map((s, i) => (
            <div className="rz-seg" key={i}>
              <div className="rz-seg-h">📌 {s.section || '未命名模块'}</div>
              <div className="rz-diff">
                <div className="rz-col rz-orig">
                  <div className="rz-col-t">原文</div>
                  {s.original || '（无）'}
                </div>
                <div className="rz-col rz-opt">
                  <div className="rz-col-t">优化后</div>
                  {s.optimized || ''}
                </div>
              </div>
              {s.reason && <div className="rz-reason">💡 {s.reason}</div>}
            </div>
          ))}
      </div>
    </>
  )
}
