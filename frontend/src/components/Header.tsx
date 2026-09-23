import { Link } from 'react-router-dom'

import type { Template, ViewKey } from '../api/types'
import { ROUTES } from '../routes'

interface Props {
  view: ViewKey
  model: string
  templates: Template[]
  template: string
  onTemplateChange: (key: string) => void
}

/**
 * 顶栏：返回主页 + 标题 + 视图 tab（路由导航）+ 模型名 + 提示词预设
 * （后两者仅在聊天视图显示，由 CSS `body:not([data-view="chat"])` 控制）。
 *
 * - tab 改为 react-router 的 <Link>，点击即改 hash（可深链、可前进/后退）；
 *   .tab.active 高亮由当前路由派生的 view 决定，等价原 view === t.key 逻辑。
 * - 「🏠 主页」必须是**原生锚点 <a href="/">**：home 门户在 SPA 之外
 *   （nginx `location /` -> /var/www/home），用 react-router 的 Link 只会在
 *   hash 应用内导航到 '/'（被重定向回 /#/chat），无法真正离开本应用。
 */
export default function Header({ view, model, templates, template, onTemplateChange }: Props) {
  return (
    <header>
      <a className="home-btn" href="/" title="返回主页">
        🏠 主页
      </a>
      <span className="title">🤖 ai-lab</span>
      <nav className="tabs">
        {ROUTES.map((t) => (
          <Link
            key={t.view}
            className={'tab' + (view === t.view ? ' active' : '')}
            data-view={t.view}
            to={t.path}
          >
            {t.label}
          </Link>
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
