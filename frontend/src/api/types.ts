// 后端响应类型定义（与 app/ 各 router/store 的返回结构精确对齐，后端不改动）。

export type ViewKey = 'chat' | 'resume' | 'cmdgen'

// ---------- 通用 / 聊天 ----------
export interface Template { key: string; label: string }
export interface ModelsResp { model: string; templates: Template[] }
export interface ChatMessage { role: 'user' | 'assistant'; content: string }

// ---------- 会话持久化 ----------
export interface Session { id: number; title: string; created_at: string; updated_at: string }
export interface StoredMessage { role: string; content: string }

// ---------- 简历优化 ----------
export interface ResumeSegment {
  section?: string
  original?: string
  optimized?: string
  reason?: string
}
export interface ResumeParseResp { ok: boolean; title: string; text: string; chars: number }
export interface ResumeOptimizeResp { id: number; summary: string; segments: ResumeSegment[] }
export interface ResumeHistoryItem {
  id: number; title: string; source_name: string; model: string
  created_at: string; segment_count: number
}
export interface ResumeDetail {
  id: number; title: string; source_name: string; raw_text: string; model: string
  created_at: string; summary: string; segments: ResumeSegment[]
}

// ---------- 命令获取 ----------
export interface CmdParam { flag: string; desc: string }
export interface CmdPlatform {
  os: string; shell?: string; command: string; params?: CmdParam[]; note?: string
}
export interface CmdGenerateResp { id: number; intent: string; platforms: CmdPlatform[] }
export interface CmdHistoryItem {
  id: number; query: string; intent: string; model: string
  created_at: string; platform_count: number
}
export interface CmdDetail {
  id: number; query: string; intent: string; model: string
  created_at: string; platforms: CmdPlatform[]
}
