// 真实引擎 —— 轮询本地服务，管理源文件夹 / 目标文件夹选择
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api, uid, type DestInfo, type Job, type LogEntry, type ScannedSource } from '@/lib/api'

// 用户设置持久化（localStorage）—— 不预设任何值，用户填过一次后自动记住
function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`offloadmaster:${key}`)
    return v !== null ? (JSON.parse(v) as T) : fallback
  } catch { return fallback }
}

/** 归档命名的自动信息 —— 全部可修改；扫描素材时自动带出摄影机/机型（不默认任何品牌） */
export interface NameVars {
  date: string
  camera: string
  model: string
  reel: string
}

const defaultNameVars = (): NameVars => ({
  date: new Date().toISOString().slice(0, 10),
  camera: '', model: '', reel: '001',
})

export function useDitEngine() {
  const [sources, setSources] = useState<ScannedSource[]>([])
  const [dests, setDests] = useState<DestInfo[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [notifyOnDone, setNotifyOnDone] = useState(() => loadPref('notifyOnDone', true))
  // 命名每次启动都是空白：不读旧值、不写存储，每次拷卡都重新起名，避免把上一场戏的名字带进下一场
  const [nameTemplate, setNameTemplate] = useState('')
  const [nameVars, setNameVarsState] = useState<NameVars>(defaultNameVars())
  const [projectName, setProjectName] = useState('')
  const [verifyMode, setVerifyMode] = useState(() => loadPref('verifyMode', 'MD5'))
  // 校验报告开关（KOCARD 式交付物，偏好会记住）
  const [reportEnabled, setReportEnabled] = useState(() => loadPref('reportEnabled', true))
  const [online, setOnline] = useState(false)
  const [queueRunning, setQueueRunning] = useState(false)

  // 清掉旧版本存过的命名，彻底告别"上次的命名还在"
  useEffect(() => {
    localStorage.removeItem('offloadmaster:nameTemplate')
    localStorage.removeItem('offloadmaster:nameVars')
    localStorage.removeItem('offloadmaster:projectName')
  }, [])

  useEffect(() => { localStorage.setItem('offloadmaster:notifyOnDone', JSON.stringify(notifyOnDone)) }, [notifyOnDone])

  const setNameVars = useCallback((patch: Partial<NameVars>) => {
    setNameVarsState((prev) => ({ ...prev, ...patch }))
  }, [])
  useEffect(() => { localStorage.setItem('offloadmaster:verifyMode', JSON.stringify(verifyMode)) }, [verifyMode])
  useEffect(() => { localStorage.setItem('offloadmaster:reportEnabled', JSON.stringify(reportEnabled)) }, [reportEnabled])

  const prevStatuses = useRef<Map<string, Job['status']>>(new Map())
  const notifyRef = useRef(notifyOnDone)
  notifyRef.current = notifyOnDone

  // ---------------- 轮询任务与日志 ----------------
  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const { jobs: js, logs: ls, queueRunning: qr } = await api.state()
        if (!alive) return
        setOnline(true)
        setJobs(js)
        setLogs(ls)
        setQueueRunning(!!qr)
        for (const j of js) {
          const prev = prevStatuses.current.get(j.id)
          if (prev && prev !== j.status && notifyRef.current) {
            if (j.status === 'done') {
              toast.success(`拷贝完成：${j.sourceLabel}，全部校验通过 ✓`, { description: 'MHL 校验清单已写入目标盘' })
              api.sound('done').catch(() => {})
            }
            if (j.status === 'error') {
              toast.error(`任务异常：${j.sourceLabel} 有文件校验失败`)
              api.sound('error').catch(() => {})
            }
          }
          prevStatuses.current.set(j.id, j.status)
        }
      } catch {
        if (alive) setOnline(false)
      }
    }
    tick()
    const t = setInterval(tick, 800)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // ---------------- 选择源素材文件夹 ----------------
  const addSource = useCallback(async (p: string) => {
    if (sources.some((s) => s.path === p)) { toast.error('该文件夹已在列表中'); return }
    const toastId = toast.loading('正在扫描素材文件夹…')
    try {
      const r = await api.scan(p)
      if (r.files.length === 0) { toast.error('文件夹为空', { id: toastId }); return }
      const label = p.split('/').filter(Boolean).pop() ?? p
      setSources((prev) => [...prev, {
        id: uid(), path: p, label, camera: r.camera,
        fileCount: r.files.length, mediaCount: r.mediaCount, totalBytes: r.totalBytes,
      }])
      // 自动带出摄影机/机型到命名变量（不覆盖用户已填的内容，可随时改）
      setNameVarsState((prev) => ({
        ...prev,
        camera: prev.camera || r.camera.brand,
        model: prev.model || r.camera.model,
      }))
      toast.success(`已添加：${label}（识别为 ${r.camera.brand} ${r.camera.model}）`, { id: toastId })
      if ((r as { truncated?: boolean }).truncated) toast.warning('文件数量超过扫描上限，建议分目录拷贝')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '扫描失败', { id: toastId })
    }
  }, [sources])

  const removeSource = useCallback((id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id))
  }, [])

  // ---------------- 添加目标文件夹 ----------------
  const addDest = useCallback(async (p: string) => {
    if (dests.some((d) => d.path === p)) { toast.error('该目标已在列表中'); return }
    try {
      const sp = await api.space(p)
      setDests((prev) => [...prev, { id: uid(), path: p, freeBytes: sp.freeBytes, totalBytes: sp.totalBytes }])
      toast.success(`已添加目标：${p}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '读取失败')
    }
  }, [dests])

  const removeDest = useCallback((id: string) => {
    setDests((prev) => prev.filter((d) => d.id !== id))
  }, [])

  const refreshDestSpace = useCallback(async () => {
    setDests((prev) => {
      prev.forEach(async (d) => {
        try {
          const sp = await api.space(d.path)
          setDests((cur) => cur.map((x) => (x.id === d.id ? { ...x, freeBytes: sp.freeBytes, totalBytes: sp.totalBytes } : x)))
        } catch { /* 目标可能被拔出 */ }
      })
      return prev
    })
  }, [])

  // ---------------- 源文件夹的任务状态（由真实任务推导） ----------------
  const sourceStatus = useCallback((s: ScannedSource): 'idle' | 'queued' | 'copying' | 'done' | 'error' => {
    const js = jobs.filter((j) => j.sourcePath === s.path)
    if (js.length === 0) return 'idle'
    const last = js[js.length - 1]
    if (last.status === 'done') return 'done'
    if (last.status === 'error') return 'error'
    if (last.status === 'running' || last.status === 'paused') return 'copying'
    if (last.status === 'queued') return 'queued'
    return 'idle'
  }, [jobs])

  // ---------------- 空间预判（本地即时计算） ----------------
  const spaceCheck = useCallback((sourceId: string, destIds: string[]) => {
    const s = sources.find((x) => x.id === sourceId)
    if (!s) return []
    const need = Math.ceil(s.totalBytes * 1.02)
    return destIds.map((id) => {
      const d = dests.find((x) => x.id === id)!
      return { dest: d, needBytes: need, ok: d.freeBytes >= need }
    })
  }, [sources, dests])

  // ---------------- 加入队列（提交真实拷贝任务） ----------------
  const enqueue = useCallback(async (sourceId: string, destIds: string[], templateOverride?: string) => {
    const s = sources.find((x) => x.id === sourceId)
    if (!s || destIds.length === 0) return
    const bad = spaceCheck(sourceId, destIds).filter((c) => !c.ok)
    if (bad.length > 0) { toast.error('目标空间不足，无法加入队列'); return }
    const tpl = templateOverride ?? nameTemplate
    if (templateOverride !== undefined && templateOverride !== nameTemplate) setNameTemplate(templateOverride)
    try {
      await api.createJob({
        sourcePath: s.path, sourceLabel: s.label,
        destPaths: destIds.map((id) => dests.find((d) => d.id === id)!.path),
        verifyMode, template: tpl, project: projectName, nameVars, report: reportEnabled,
        // 报告版式跟随当前界面主题，保持内外一致
        theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
      })
      toast.success(destIds.length > 1
        ? `${s.label} 已加入队列：${destIds.length} 个目标拆成 ${destIds.length} 个任务，分开显示`
        : `${s.label} 已加入队列`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建任务失败')
    }
  }, [sources, dests, spaceCheck, verifyMode, nameTemplate, projectName, nameVars, reportEnabled])

  const pauseJob = useCallback((id: string) => api.jobAction(id, 'pause').catch((e) => toast.error(e.message)), [])
  const resumeJob = useCallback((id: string) => api.jobAction(id, 'resume').catch((e) => toast.error(e.message)), [])
  const cancelJob = useCallback((id: string) => api.jobAction(id, 'cancel').catch((e) => toast.error(e.message)), [])
  const recopyFile = useCallback((id: string, file: string) => api.recopy(id, file)
    .then(() => toast.success('已标记重拷'))
    .catch((e) => toast.error(e.message)), [])

  const reverifyJob = useCallback((id: string) => api.jobAction(id, 'reverify')
    .then(() => toast.info('开始二次复检：重新计算全部哈希'))
    .catch((e) => toast.error(e.message)), [])

  const clearFinished = useCallback(async () => {
    try {
      const r = await api.jobAction('all', 'clear-finished') as { cleared?: number }
      toast.success(r.cleared ? `已清除 ${r.cleared} 个已结束的任务` : '没有可清除的任务')
    } catch (e) { toast.error(e instanceof Error ? e.message : '清除失败') }
  }, [])

  const reveal = useCallback((p: string) => api.reveal(p)
    .catch((e) => toast.error(e instanceof Error ? e.message : '打开失败')), [])

  const startQueue = useCallback(() => api.startQueue()
    .then(() => toast.success('开始拷贝：队列依次执行'))
    .catch((e) => toast.error(e instanceof Error ? e.message : '启动失败')), [])

  const stopQueue = useCallback(() => api.stopQueue()
    .then(() => toast.warning('队列已暂停，断点已保存'))
    .catch((e) => toast.error(e instanceof Error ? e.message : '操作失败')), [])

  return {
    online, sources, dests, jobs, logs, queueRunning,
    notifyOnDone, setNotifyOnDone,
    reportEnabled, setReportEnabled,
    nameTemplate, setNameTemplate,
    nameVars, setNameVars,
    projectName, setProjectName,
    verifyMode, setVerifyMode,
    addSource, removeSource, addDest, removeDest, refreshDestSpace,
    sourceStatus, spaceCheck, enqueue,
    pauseJob, resumeJob, cancelJob, recopyFile, reverifyJob, clearFinished, reveal,
    startQueue, stopQueue,
  }
}

export type DitEngine = ReturnType<typeof useDitEngine>
