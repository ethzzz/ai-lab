import type { Template, ViewKey } from '../api/types'

const TABS: { key: ViewKey; label: string }[] = [
  { key: 'chat', label: '💬 聊天' },
  { key: 'resume', label: '📄 简历优化' },
  { key: 'cmdgen', label: '🖥️ 命令获取' },
]

interface Props {
  view: ViewKey
  onViewChange: (v: ViewKey) => void
  model: string
  templates: Template[]
  template: string
  onTemplateChange: (key: string) => void
}

// 顶栏：标题 + 视图 tab + 模型名 + 提示词预设（后两者仅在聊天视图显示，由 CSS 控制）。
export default function Header({
  view,
  onViewChange,
  model,
  templates,
  template,
  onTemplateChange,
}: Props) {
  return (
    <header>
      <span className="title">🤖 ai-lab</span>
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={'tab' + (view === t.key ? ' active' : '')}
            data-view={t.key}
            onClick={() => onViewChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <span className="model" id="modelName">
        {model || '…'}
      </span>
      <select
        id="template"
        title="系统提示词预设"
        value={template}
        onChange={(e) => onTemplateChange(e.target.value)}
      >
        {templates.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
    </header>
  )
}
