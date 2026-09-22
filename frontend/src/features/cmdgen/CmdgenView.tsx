import PlatformCard from './PlatformCard'
import StatusText from '../../components/StatusText'
import type { UseCmdgenResult } from './useCmdgen'

/** 6 个快捷 chips（label / data-q 文案照搬原文件）。 */
const CHIPS: { q: string; label: string }[] = [
  { q: '查看当前目录下的所有文件', label: '查看目录文件' },
  { q: '查找占用某个端口的进程', label: '查占用端口进程' },
  { q: '查看磁盘空间使用情况', label: '查看磁盘空间' },
  { q: '实时滚动查看日志文件末尾', label: '实时看日志' },
  { q: '递归删除文件夹及其所有内容', label: '递归删文件夹' },
  { q: '压缩打包一个目录为压缩包', label: '压缩打包目录' },
]

const IDLE_TEXT = '命令结果将按操作系统分类展示在这里（Linux / macOS / Windows CMD / PowerShell）。'

/**
 * 命令获取视图：左栏（描述输入 + 快捷 chips + 获取命令）+ 右栏（意图 + 按系统分类卡片）。
 * DOM 结构 / id / class 与原 #cmdgenView 一致（左栏沿用 .rz-pane/.rz-card/.rz-text 样式）。
 */
export default function CmdgenView({ g, hidden }: { g: UseCmdgenResult; hidden: boolean }) {
  const showIntent = g.result.kind === 'done' && !!g.result.intent
  const platforms = g.result.kind === 'done' ? g.result.platforms : []

  return (
    <div id="cmdgenView" className="view" hidden={hidden}>
      <div className="cg-wrap">
        <section className="rz-pane">
          <div className="rz-card">
            <div className="rz-h">描述你想做的操作</div>
            <textarea
              id="cgText"
              className="rz-input rz-text"
              ref={g.textRef}
              placeholder="例如：查看当前目录下的所有文件（含隐藏文件）"
              value={g.text}
              onChange={(e) => g.setText(e.target.value)}
              onKeyDown={g.onKeyDown}
            />
            <div className="cg-chips">
              {CHIPS.map((c) => (
                <button
                  key={c.q}
                  className="cg-chip"
                  data-q={c.q}
                  onClick={() => {
                    g.setText(c.q)
                    g.textRef.current?.focus()
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="rz-row">
              <span className="rz-muted">按系统分类返回命令 + 参数说明</span>
              <button
                id="cgGen"
                className="rz-btn"
                disabled={!g.text.trim() || g.busy}
                onClick={g.generate}
              >
                ⚡ 获取命令
              </button>
            </div>
            <StatusText msg={g.status} err={g.statusErr} />
          </div>
        </section>
        <section className="rz-pane">
          <div className="cg-intent" id="cgIntent" hidden={!showIntent}>
            {g.intentText ? '🎯 ' + g.intentText : ''}
          </div>
          <div className="cg-result" id="cgResult">
            {g.result.kind === 'idle' && <div className="rz-empty">{IDLE_TEXT}</div>}
            {g.result.kind === 'loading' && <div className="rz-empty">⏳ 生成中…</div>}
            {g.result.kind === 'failed' && <div className="rz-empty">生成未完成，请重试。</div>}
            {g.result.kind === 'done' && !platforms.length && (
              <div className="rz-empty">没有可展示的命令。</div>
            )}
            {g.result.kind === 'done' && platforms.map((p, i) => <PlatformCard key={i} p={p} />)}
          </div>
        </section>
      </div>
    </div>
  )
}
