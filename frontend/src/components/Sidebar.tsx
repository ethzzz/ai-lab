import type { ViewKey } from '../api/types'
import type { HistoryItemView } from '../hooks/useHistory'
import HistoryList from './HistoryList'

export interface PaneProps {
  newLabel: string
  onNew: () => void
  items: HistoryItemView[]
  emptyText: string
  deleteTitle?: string
  activeId?: number | null
  onOpen: (id: number) => void
  onDelete: (id: number) => void
}

interface Props {
  view: ViewKey
  chat: PaneProps
  resume: PaneProps
  cmdgen: PaneProps
}

function Pane({ hidden, p }: { hidden: boolean; p: PaneProps }) {
  return (
    <div className="side-pane" hidden={hidden}>
      <button className="side-new" onClick={p.onNew}>
        {p.newLabel}
      </button>
      <div className="side-list">
        <HistoryList
          items={p.items}
          activeId={p.activeId}
          emptyText={p.emptyText}
          deleteTitle={p.deleteTitle}
          onOpen={p.onOpen}
          onDelete={p.onDelete}
        />
      </div>
    </div>
  )
}

// 左侧栏：三个 agent 的历史 pane，按当前视图显隐（复用同一 Pane + HistoryList）。
export default function Sidebar({ view, chat, resume, cmdgen }: Props) {
  return (
    <aside id="sidebar">
      <Pane hidden={view !== 'chat'} p={chat} />
      <Pane hidden={view !== 'resume'} p={resume} />
      <Pane hidden={view !== 'cmdgen'} p={cmdgen} />
    </aside>
  )
}
