import ResumeSegments from './ResumeSegments'
import ResumeUploader from './ResumeUploader'
import StatusText from '../../components/StatusText'
import type { UseResumeResult } from './useResume'

/**
 * 简历优化视图：左栏（上传 → 校对 → 开始优化）+ 右栏（摘要 + 分段对比）。
 * DOM 结构 / id / class 与原 #resumeView 一致。
 */
export default function ResumeView({ r, hidden }: { r: UseResumeResult; hidden: boolean }) {
  return (
    <div id="resumeView" className="view" hidden={hidden}>
      <div className="resume-wrap">
        <section className="rz-pane rz-left">
          <div className="rz-card">
            <div className="rz-h">① 上传简历</div>
            <ResumeUploader fileRef={r.fileRef} onFile={r.onFile} />
            <input
              id="rzTitle"
              className="rz-input"
              placeholder="简历标题"
              maxLength={60}
              value={r.title}
              onChange={(e) => r.setTitle(e.target.value)}
            />
            <div className="rz-h">② 校对文本（可编辑）</div>
            <textarea
              id="rzText"
              className="rz-input rz-text"
              placeholder="解析出的简历文本会显示在这里，可手动修正后再优化…"
              value={r.text}
              onChange={(e) => r.setText(e.target.value)}
            />
            <div className="rz-row">
              <span id="rzChars" className="rz-muted">
                {r.chars ? r.chars + ' 字' : ''}
              </span>
              <button
                id="rzOptimize"
                className="rz-btn"
                disabled={!r.chars || r.busy}
                onClick={r.optimize}
              >
                ✨ 开始优化
              </button>
            </div>
            <StatusText msg={r.status} err={r.statusErr} />
          </div>
        </section>
        <section className="rz-pane rz-right">
          <ResumeSegments result={r.result} summaryText={r.summaryText} />
        </section>
      </div>
    </div>
  )
}
