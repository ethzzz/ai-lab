interface Props {
  msg: string
  err?: boolean
  className?: string
}

// 状态提示行（简历 / 命令获取复用 .rz-status，含 .err 红色态）。
export default function StatusText({ msg, err, className = 'rz-status' }: Props) {
  return <div className={className + (err ? ' err' : '')}>{msg}</div>
}
