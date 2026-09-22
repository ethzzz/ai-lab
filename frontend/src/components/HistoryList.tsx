import type { HistoryItemView } from '../hooks/useHistory'

interface Props {
  items: HistoryItemView[]
  activeId?: number | null
  emptyText: string
  deleteTitle?: string
  onOpen: (id: number) => void
  onDelete: (id: number) => void
}

// 通用历史列表（会话 / 简历 / 命令复用），置于 .side-list 容器内。
export default function HistoryList({
  items,
  activeId,
  emptyText,
  deleteTitle = '删除',
  onOpen,
  onDelete,
}: Props) {
  if (!items.length) return <div className="sess-empty">{emptyText}</div>
  return (
    <>
      {items.map((it) => (
        <div
          key={it.id}
          className={'sess' + (it.id === activeId ? ' active' : '')}
          onClick={() => onOpen(it.id)}
        >
          <span className="sess-title" title={it.tooltip}>
            {it.title}
          </span>
          <button
            className="sess-del"
            title={deleteTitle}
            onClick={(e) => {
              e.stopPropagation()
              onDelete(it.id)
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </>
  )
}
