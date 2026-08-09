// 与本地服务通信的 API 层（全部为真实磁盘操作）
export interface CameraInfo {
  id: string
  brand: string
  model: string
  codec: string
  accent: string
  res?: string
}

export interface ScannedSource {
  id: string
  path: string
  label: string
  camera: CameraInfo
  fileCount: number
  mediaCount: number
  totalBytes: number
}

export interface DestInfo {
  id: string
  path: string
  freeBytes: number
  totalBytes: number
}

export type FileStatus = 'pending' | 'copying' | 'verifying' | 'done' | 'duplicate' | 'error'

export interface JobFile {
  name: string
  size: number
  copied: number
  hash: string
  status: FileStatus
  error?: string
  verifyBytes?: number
  verifyTotal?: number
}

export interface Job {
  id: string
  sourcePath: string
  sourceLabel: string
  camera?: CameraInfo
  destPaths: string[]
  files: JobFile[]
  fileIdx: number
  status: 'queued' | 'running' | 'paused' | 'done' | 'error' | 'cancelled'
  speedMBs: number
  verifyMode: string
  template: string
  project: string
  /** 服务端实际渲染出的归档文件夹名 */
  rendered: string
  createdAt: string
  reverify?: { running: boolean; done: number; total: number; failed: string[] } | null
}

export interface LogEntry {
  id: string
  time: string
  level: 'info' | 'success' | 'warn' | 'error'
  message: string
}

export interface VolumeInfo {
  name: string
  path: string
  freeBytes: number
  totalBytes: number
  isSystem: boolean
}

export interface DirEntry { name: string; path: string }
export interface ListResult { path: string; parent: string | null; dirs: DirEntry[] }

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || `请求失败（${r.status}）`)
  return data as T
}

const post = (url: string, body: unknown) =>
  req<{ ok?: boolean; id?: string }>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const api = {
  list: (p?: string) => req<ListResult>(`/api/list${p ? `?path=${encodeURIComponent(p)}` : ''}`),
  mkdir: (p: string) => post('/api/mkdir', { path: p }),
  space: (p: string) => req<{ freeBytes: number; totalBytes: number }>(`/api/space?path=${encodeURIComponent(p)}`),
  volumes: () => req<VolumeInfo[]>('/api/volumes'),
  scan: (p: string) =>
    req<{ files: { rel: string; size: number }[]; totalBytes: number; camera: CameraInfo; mediaCount: number }>('/api/scan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }),
    }).then((d) => d),
  state: () => req<{ jobs: Job[]; logs: LogEntry[]; queueRunning: boolean }>('/api/state'),
  createJob: (payload: {
    sourcePath: string; sourceLabel: string; destPaths: string[]
    verifyMode: string; template: string; project: string
    nameVars?: { date: string; camera: string; model: string; reel: string }
    report?: boolean
    theme?: 'dark' | 'light'
  }) => post('/api/jobs', payload),
  jobAction: (id: string, action: 'pause' | 'resume' | 'cancel' | 'clear-finished' | 'reverify', body?: unknown) =>
    post(`/api/jobs/${id}/${action}`, body ?? {}),
  recopy: (id: string, file: string) => post(`/api/jobs/${id}/recopy`, { file }),
  reveal: (p: string) => post('/api/reveal', { path: p }),
  sound: (kind: 'done' | 'error') => post('/api/sound', { kind }),
  startQueue: () => post('/api/queue/start', {}),
  stopQueue: () => post('/api/queue/stop', {}),
  format: (p: string, confirm: string) => post('/api/format', { path: p, confirm }),
  mhlUrl: (jobId: string) => `/api/export/mhl?jobId=${jobId}`,
  ledgerUrl: '/api/export/ledger',
}

export const uid = () => Math.random().toString(36).slice(2, 9)

export function formatBytes(b: number): string {
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
}

export function eta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '--:--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
