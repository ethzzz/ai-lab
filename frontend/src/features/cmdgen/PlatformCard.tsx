import { useState } from 'react'

import type { CmdPlatform } from '../../api/types'
import { copyText } from '../../lib/copy'
import { osIcon } from './useCmdgen'

/**
 * 单个系统的命令卡片：系统名 + shell 标签 + 命令（可复制）+ 参数表 + 补充说明。
 * 复制按钮点击后短暂显示「✓ 已复制」（等价原 copyText 的 done 回调）。
 */
export default function PlatformCard({ p }: { p: CmdPlatform }) {
  const [copied, setCopied] = useState(false)

  const onCopy = (): void => {
    copyText(p.command || '', () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }

  const params = p.params || []

  return (
    <div className="cg-card">
      <div className="cg-card-h">
        <span className="cg-os">
          {osIcon(p.os)} {p.os || '其他'}
        </span>
        {p.shell && <span className="cg-shell">{p.shell}</span>}
      </div>
      <div className="cg-cmd">
        <code>{p.command || ''}</code>
        <button className="cg-copy" onClick={onCopy}>
          {copied ? '✓ 已复制' : '复制'}
        </button>
      </div>
      {params.length > 0 && (
        <table className="cg-params">
          <tbody>
            {params.map((it, i) => (
              <tr key={i}>
                <td className="cg-flag">{it.flag || ''}</td>
                <td>{it.desc || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {p.note && <div className="cg-note">💡 {p.note}</div>}
    </div>
  )
}
