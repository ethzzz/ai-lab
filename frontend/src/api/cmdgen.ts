import { apiJson, postJson } from './client'
import type { CmdDetail, CmdGenerateResp, CmdHistoryItem } from './types'

export function generateCmd(text: string): Promise<CmdGenerateResp> {
  return postJson<CmdGenerateResp>('api/cmdgen/generate', { text })
}

export function listCmdHistory(): Promise<{ items: CmdHistoryItem[] }> {
  return apiJson<{ items: CmdHistoryItem[] }>('api/cmdgen/history')
}

export function getCmdHistory(id: number): Promise<CmdDetail> {
  return apiJson<CmdDetail>(`api/cmdgen/history/${id}`)
}

export function deleteCmdHistory(id: number): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`api/cmdgen/history/${id}`, { method: 'DELETE' })
}
