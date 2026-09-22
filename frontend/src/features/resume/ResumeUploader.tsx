import { useState } from 'react'
import type { DragEvent, RefObject } from 'react'

interface Props {
  fileRef: RefObject<HTMLInputElement | null>
  onFile: (file: File | null | undefined) => void
}

/**
 * 上传区：点击 label 触发隐藏的 file input；拖拽进入/移出切换 .drag 高亮，落下即解析。
 * 与原 #rzDrop / #rzFile 行为一致（accept .docx/.pdf/.txt/.md）。
 */
export default function ResumeUploader({ fileRef, onFile }: Props) {
  const [drag, setDrag] = useState(false)

  const stop = (e: DragEvent<HTMLLabelElement>): void => {
    e.preventDefault()
  }

  return (
    <label
      className={'rz-drop' + (drag ? ' drag' : '')}
      id="rzDrop"
      onDragEnter={(e) => {
        stop(e)
        setDrag(true)
      }}
      onDragOver={(e) => {
        stop(e)
        setDrag(true)
      }}
      onDragLeave={(e) => {
        stop(e)
        setDrag(false)
      }}
      onDrop={(e) => {
        stop(e)
        setDrag(false)
        onFile(e.dataTransfer.files && e.dataTransfer.files[0])
      }}
    >
      <input
        type="file"
        id="rzFile"
        ref={fileRef}
        accept=".docx,.pdf,.txt,.md"
        hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <span className="rz-drop-t">📎 点击或拖拽文件到此处</span>
      <span className="rz-drop-s">支持 .docx / .pdf / .txt / .md（≤5MB）</span>
    </label>
  )
}
