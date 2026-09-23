import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { getModels } from './api/chat'
import type { Template, ViewKey } from './api/types'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import type { PaneProps } from './components/Sidebar'
import { useChat } from './features/chat/useChat'
import ChatView from './features/chat/ChatView'
import { useCmdgen } from './features/cmdgen/useCmdgen'
import CmdgenView from './features/cmdgen/CmdgenView'
import { useResume } from './features/resume/useResume'
import ResumeView from './features/resume/ResumeView'
import { viewFromPath } from './routes'

/**
 * 常驻布局（保状态的关键）。
 *
 * 三个 agent 的 hook（useChat / useResume / useCmdgen）与 model/预设状态全部挂在这一层，
 * 路由**只决定 #main 内哪个 .view 可见**：三个 .view 与三个 .side-pane 始终全部挂载、
 * 仅用 hidden 显隐（复用既有 .view[hidden] / .side-pane[hidden] CSS）。
 * 本组件由 App.tsx 的无路径布局路由（pathless layout route）渲染，且 element 引用固定，
 * 因此在 /chat <-> /resume <-> /cmdgen 之间导航时它不会被卸载/重建 ——
 * 聊天消息与当前会话、输入框草稿、简历/命令的当前结果与选中历史全部保留，
 * 行为与原来 useState<ViewKey> 切 tab 完全等价。
 *
 * 与原 App.tsx 的对应关系：
 *   useState<ViewKey>('chat')      -> 由当前 hash 路径派生（useLocation + viewFromPath）
 *   document.body.dataset.view     -> 同样保留（CSS 靠它隐藏 #modelName / #template）
 *   onViewChange 里的 reloadHistory -> 改为「进入该路由时触发一次」（lastViewRef 去重）
 */
export default function AppLayout() {
  const location = useLocation()
  const [model, setModel] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [template, setTemplate] = useState('')

  const chat = useChat(template)
  const resume = useResume()
  const cmdgen = useCmdgen()

  // 当前视图由路由派生：'/chat' | '/resume' | '/cmdgen'，未匹配回落 'chat'
  const view: ViewKey = viewFromPath(location.pathname)

  // body[data-view] 驱动 CSS（非聊天视图隐藏模型名与预设下拉），等价原 useEffect([view])
  useEffect(() => {
    document.body.dataset.view = view
  }, [view])

  // 拉模型信息与提示词预设（默认选中第一项，与原 select 首个 option 一致）
  useEffect(() => {
    getModels()
      .then((j) => {
        setModel(j.model)
        setTemplates(j.templates || [])
        if (j.templates && j.templates.length) setTemplate(j.templates[0].key)
      })
      .catch(() => {
        /* 静默失败（401 已在 client 内跳转登录） */
      })
  }, [])

  // 进入简历 / 命令视图时加载对应历史（等价原 onViewChange 里的 reloadHistory）。
  // 依赖只有 view（reload 引用本身稳定），并用 ref 记住上次视图，
  // 保证「每次进入该路由只触发一次」，不因组件重渲染而重复请求。
  const lastViewRef = useRef<ViewKey | null>(null)
  const resumeReload = resume.reloadHistory
  const cmdgenReload = cmdgen.reloadHistory
  useEffect(() => {
    if (lastViewRef.current === view) return
    lastViewRef.current = view
    if (view === 'resume') void resumeReload()
    if (view === 'cmdgen') void cmdgenReload()
  }, [view, resumeReload, cmdgenReload])

  const chatPane: PaneProps = {
    newLabel: '＋ 新建会话',
    onNew: chat.onNewSession,
    items: chat.sessions,
    emptyText: '暂无会话，点上方新建或直接提问',
    deleteTitle: '删除会话',
    activeId: chat.sessionId,
    onOpen: chat.onOpenSession,
    onDelete: chat.onDeleteSession,
  }
  const resumePane: PaneProps = {
    newLabel: '＋ 新建优化',
    onNew: resume.onNew,
    items: resume.history,
    emptyText: '暂无优化记录',
    deleteTitle: '删除记录',
    onOpen: resume.onOpenHistory,
    onDelete: resume.onDeleteHistory,
  }
  const cmdgenPane: PaneProps = {
    newLabel: '＋ 新建查询',
    onNew: cmdgen.onNew,
    items: cmdgen.history,
    emptyText: '暂无查询记录',
    deleteTitle: '删除记录',
    onOpen: cmdgen.onOpenHistory,
    onDelete: cmdgen.onDeleteHistory,
  }

  return (
    <>
      <Header
        view={view}
        model={model}
        templates={templates}
        template={template}
        onTemplateChange={setTemplate}
      />
      <div id="layout">
        <Sidebar view={view} chat={chatPane} resume={resumePane} cmdgen={cmdgenPane} />
        <div id="main">
          <ChatView c={chat} hidden={view !== 'chat'} />
          <ResumeView r={resume} hidden={view !== 'resume'} />
          <CmdgenView g={cmdgen} hidden={view !== 'cmdgen'} />
        </div>
      </div>
    </>
  )
}
