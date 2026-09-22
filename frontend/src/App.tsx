import { useCallback, useEffect, useState } from 'react'

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

/**
 * 应用编排：视图 tab 状态 + 模型/预设 + 三个 agent 的状态与回调。
 * 等价原 index.html 的 switchView / VIEWS：body[data-view] 供 CSS 隐藏
 * #modelName / #template，三个 .view 与三个 .side-pane 用 hidden 显隐。
 */
export default function App() {
  const [view, setView] = useState<ViewKey>('chat')
  const [model, setModel] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [template, setTemplate] = useState('')

  const chat = useChat(template)
  const resume = useResume()
  const cmdgen = useCmdgen()

  // body[data-view] 驱动 CSS（非聊天视图隐藏模型名与预设下拉）
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

  // 切换视图时加载对应历史（等价原 switchView 里的 loadHistory / loadCmdHistory）
  const onViewChange = useCallback(
    (v: ViewKey) => {
      setView(v)
      if (v === 'resume') resume.reloadHistory()
      if (v === 'cmdgen') cmdgen.reloadHistory()
    },
    [resume.reloadHistory, cmdgen.reloadHistory],
  )

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
        onViewChange={onViewChange}
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
