import { apiJson, postJson } from './client'
import type { ResumeDetail, ResumeHistoryItem, ResumeOptimizeResp, ResumeParseResp } from './types'

export function parseResume(file: File): Promise<ResumeParseResp> {
  const fd = new FormData()
  fd.append('file', file)
  // 不手动设 Content-Type，交给浏览器带 multipart boundary
  return apiJson<ResumeParseResp>('api/resume/parse', { method: 'POST', body: fd })
}

export function optimizeResume(
  text: string,
  title: string,
  sourceName: string,
): Promise<ResumeOptimizeResp> {
  return postJson<ResumeOptimizeResp>('api/resume/optimize', {
    text,
    title,
    source_name: sourceName,
  })
}

export function listResumeHistory(): Promise<{ items: ResumeHistoryItem[] }> {
  return apiJson<{ items: ResumeHistoryItem[] }>('api/resume/history')
}

export function getResumeHistory(id: number): Promise<ResumeDetail> {
  return apiJson<ResumeDetail>(`api/resume/history/${id}`)
}

export function deleteResumeHistory(id: number): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`api/resume/history/${id}`, { method: 'DELETE' })
}
