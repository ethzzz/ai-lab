import { useCallback, useRef, useState } from 'react'

// 侧栏历史列表项的统一视图模型（会话 / 简历 / 命令通用）。
export interface HistoryItemView {
  id: number
  title: string
  tooltip: string
}

interface HistoryConfig<TItem extends { id: number }> {
  list: () => Promise<{ items: TItem[] }>
  remove: (id: number) => Promise<unknown>
  map: (it: TItem) => HistoryItemView
  confirmText?: string
}

/**
 * 通用历史列表 hook：统一 load / delete（三个 agent 高度重复的部分），
 * open（详情回填）因各视图字段不同，交由调用方处理。
 * 用 ref 固化配置 + 空依赖 useCallback，保证 reload/remove 引用稳定，
 * 避免调用方 useEffect([reload]) 反复触发。
 */
export function useHistory<TItem extends { id: number }>(config: HistoryConfig<TItem>) {
  const ref = useRef(config)
  ref.current = config
  const [items, setItems] = useState<HistoryItemView[]>([])

  const reload = useCallback(async () => {
    try {
      const j = await ref.current.list()
      setItems(j.items.map((it) => ref.current.map(it)))
    } catch {
      /* 静默失败（401 已在 client 内跳转登录） */
    }
  }, [])

  /** 删除（带 confirm）；返回是否真的执行了删除，供调用方决定后续清理。 */
  const remove = useCallback(
    async (id: number): Promise<boolean> => {
      if (!confirm(ref.current.confirmText ?? '删除这条记录？')) return false
      try {
        await ref.current.remove(id)
      } catch {
        /* ignore */
      }
      reload()
      return true
    },
    [reload],
  )

  return { items, reload, remove }
}
