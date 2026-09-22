import { apiJson, postJson } from './client'
import type { Session, StoredMessage } from './types'

export function listSessions(): Promise<{ items: Session[] }> {
  return apiJson<{ items: Session[] }>('api/sessions')
}

export function createSession(): Promise<Session> {
  return postJson<Session>('api/sessions', {})
}

export function getMessages(sid: number): Promise<{ items: StoredMessage[] }> {
  return apiJson<{ items: StoredMessage[] }>(`api/sessions/${sid}/messages`)
}

export function renameSession(sid: number, title: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`api/sessions/${sid}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

export function deleteSession(sid: number): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`api/sessions/${sid}`, { method: 'DELETE' })
}
