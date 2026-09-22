import { apiJson } from './client'
import type { ModelsResp } from './types'

// 聊天相关：模型信息与提示词预设（流式对话见 lib/sse.ts 的 streamChat）。
export function getModels(): Promise<ModelsResp> {
  return apiJson<ModelsResp>('api/models')
}
