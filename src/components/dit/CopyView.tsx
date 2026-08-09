// 拷贝视图 —— 真实文件夹选择 / 一源多目标 / 队列 / 断点续传 / 空间预判
import { useState } from 'react'
import { FolderOpen, HardDrive, Plus, Pause, Play, X, CircleAlert, CircleCheck, Clock3, Trash2, RefreshCw, FolderSearch, FolderCog, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import FolderPicker from '@/components/dit/FolderPicker'
import NamingBlocks from '@/components/dit/NamingBlocks'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { DitEngine } from '@/hooks/useDitEngine'
import { eta, formatBytes, type Job } from '@/lib/api'
import { pickNativeFolder } from '@/lib/native'

const jobStatusText: Record<Job['status'], string> = {
  queued: '排队中', running: '拷贝中', paused: '已暂停（断点已保存）',
  done: '完成 ✓', error: '有异常', cancelled: '已取消',
}

// 归档命名变量解析：以用户填写的自动信息为准，留空返回 ''（块灰色显示，不写入名字）
function useTokenResolver(engine: DitEngine) {
  const map: Record<string, string> = {
    '{日期}': engine.nameVars.date,
    '{摄影机}': engine.nameVars.camera,
    '{机型}': engine.nameVars.model,
    '{卷号}': engine.nameVars.reel,
    '{项目}': engine.projectName,
  }
  return (token: string) => map[token] ?? ''
}

export default function CopyView({ engine }: { engine: DitEngine }) {
  const [selectedDests, setSelectedDests] = useState<string[]>([])
  const [precheckSrc, setPrecheckSrc] = useState<string | null>(null)
  const [pickSource, setPickSource] = useState(false)
  const [pickDest, setPickDest] = useState(false)
  // 空命名弹窗：记录待入队的素材 id 列表（支持批量），填完名字直接全部入队
  const [pendingEnqueue, setPendingEnqueue] = useState<string[] | null>(null)

  const toggleDest = (id: string) =>
    setSelectedDests((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const resolveToken = useTokenResolver(engine)

  // 加入队列前检查：没起名字先弹窗引导填写（与归档命名区是同一个编辑器）
  const tryEnqueue = (sourceIds: string[]) => {
    if (sourceIds.length === 0) return
    if (!engine.nameTemplate.trim()) { setPendingEnqueue(sourceIds); return }
    sourceIds.forEach((id) => engine.enqueue(id, selectedDests))
  }
  const confirmPendingEnqueue = () => {
    if (!pendingEnqueue) return
    pendingEnqueue.forEach((id) => engine.enqueue(id, selectedDests))
    setPendingEnqueue(null)
  }

  // 优先唤起 macOS 原生访达选择框；浏览器模式回退到网页选择器
  const chooseSource = async () => {
    const p = await pickNativeFolder('选择源素材文件夹')
    if (p === undefined) { setPickSource(true); return }
    if (p) engine.addSource(p)
  }
  const chooseDest = async () => {
    const p = await pickNativeFolder('选择备份目标文件夹（可在弹窗中新建）')
    if (p === undefined) { setPickDest(true); return }
    if (p) engine.addDest(p)
  }

  const checks = precheckSrc ? engine.spaceCheck(precheckSrc, selectedDests) : []

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      {/* 左列：源 + 目标（min-w-0：防止长路径等内容把右列撑爆、挤压本列宽度） */}
      <div className="min-w-0 space-y-4">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm text-zinc-200">
                <FolderSearch className="h-4 w-4 text-emerald-400" /> 源素材文件夹（只读访问）
              </CardTitle>
              <Button size="sm" className="h-7 bg-amber-500 text-xs text-zinc-950 hover:bg-amber-400" onClick={chooseSource}>
                <Plus className="mr-1 h-3 w-3" /> 选择文件夹
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {engine.sources.length === 0 && (
              <button onClick={chooseSource}
                className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-800 p-8 text-zinc-500 hover:border-amber-700 hover:text-zinc-300">
                <FolderOpen className="h-8 w-8" />
                <span className="text-sm">尚未选择素材文件夹</span>
                <span className="text-xs">从外置盘或存储卡中选择素材目录，软件只读取、不写入</span>
              </button>
            )}
            {engine.sources.map((s) => {
              const status = engine.sourceStatus(s)
              return (
                <div key={s.id} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.camera.accent }} />
                      <span className="truncate text-sm font-medium text-zinc-100">{s.label}</span>
                      <Badge variant="outline" className="shrink-0 border-emerald-700/60 text-[10px] text-emerald-400">只读</Badge>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {status === 'idle' && '待拷贝'}
                        {status === 'queued' && '已入队'}
                        {status === 'copying' && '拷贝中'}
                        {status === 'done' && '已备份 ✓'}
                        {status === 'error' && '异常'}
                      </Badge>
                      {status === 'idle' && (
                        <button title="移除" onClick={() => engine.removeSource(s.id)}
                          className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-red-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-1.5 text-xs text-zinc-400">
                    识别为 {s.camera.brand} {s.camera.model} · {s.camera.codec} · {s.fileCount} 个文件（素材 {s.mediaCount} 个）· 共 {formatBytes(s.totalBytes)}
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-zinc-600">{s.path}</div>
                  <div className="mt-2.5 flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 flex-1 border-zinc-700 text-xs"
                      onClick={() => setPrecheckSrc(precheckSrc === s.id ? null : s.id)}>
                      空间预判
                    </Button>
                    <Button size="sm" className="h-7 flex-1 bg-amber-500 text-xs text-zinc-950 hover:bg-amber-400"
                      disabled={status === 'queued' || status === 'copying' || selectedDests.length === 0}
                      onClick={() => tryEnqueue([s.id])}>
                      <Plus className="mr-1 h-3 w-3" /> {status === 'done' || status === 'error' ? '再次拷贝' : '加入队列'}
                    </Button>
                  </div>
                  {precheckSrc === s.id && (
                    <div className="mt-2.5 space-y-1.5 rounded-md border border-zinc-800 bg-zinc-900/80 p-2.5">
                      <div className="text-[11px] text-zinc-400">需要写入 {formatBytes(s.totalBytes)}（含 2% 余量预判）：</div>
                      {checks.length === 0 && <div className="text-[11px] text-zinc-500">请先勾选下方目标文件夹</div>}
                      {checks.map(({ dest, ok, needBytes }) => (
                        <div key={dest.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-zinc-300">{dest.path}</span>
                          <span className={`shrink-0 ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
                            {ok ? <CircleCheck className="mr-1 inline h-3.5 w-3.5" /> : <CircleAlert className="mr-1 inline h-3.5 w-3.5" />}
                            需 {formatBytes(needBytes)} / 可用 {formatBytes(dest.freeBytes)} {ok ? '充足' : '不足！'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm text-zinc-200">
                <HardDrive className="h-4 w-4 text-amber-400" /> 目标文件夹（一源多目标同步写入）
              </CardTitle>
              <div className="flex gap-1.5">
                <Button size="icon" variant="outline" className="h-7 w-7 border-zinc-700" title="刷新可用空间" onClick={engine.refreshDestSpace}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="outline" className="h-7 border-zinc-700 text-xs" onClick={chooseDest}>
                  <Plus className="mr-1 h-3 w-3" /> 添加目标
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {engine.dests.length === 0 && (
              <button onClick={chooseDest}
                className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-800 p-8 text-zinc-500 hover:border-amber-700 hover:text-zinc-300">
                <HardDrive className="h-8 w-8" />
                <span className="text-sm">尚未添加目标文件夹</span>
                <span className="text-xs">选择本地磁盘 / 移动硬盘上的备份目录</span>
              </button>
            )}
            {engine.dests.map((d) => (
              <label key={d.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 hover:border-zinc-700">
                <Checkbox checked={selectedDests.includes(d.id)} onCheckedChange={() => toggleDest(d.id)} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-zinc-100">{d.path.split('/').filter(Boolean).pop()}</div>
                  <div className="truncate font-mono text-[10px] text-zinc-600">{d.path}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <Progress value={d.totalBytes > 0 ? ((d.totalBytes - d.freeBytes) / d.totalBytes) * 100 : 0} className="h-1.5 flex-1" />
                    <span className="shrink-0 text-[11px] text-zinc-500">可用 {formatBytes(d.freeBytes)}</span>
                  </div>
                </div>
                <button title="移除" onClick={(e) => { e.preventDefault(); engine.removeDest(d.id); setSelectedDests((p) => p.filter((x) => x !== d.id)) }}
                  className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </label>
            ))}
            <div className="flex items-center gap-2 pt-1 text-xs text-zinc-400">
              <span>校验方式</span>
              <Select value={engine.verifyMode} onValueChange={engine.setVerifyMode}>
                <SelectTrigger className="h-7 w-44 border-zinc-700 bg-zinc-950 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MD5">MD5（快，推荐）</SelectItem>
                  <SelectItem value="SHA-256">SHA-256（更严格）</SelectItem>
                  <SelectItem value="NONE">不校验（最快）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {engine.verifyMode === 'NONE' ? (
              <div className="rounded-md border border-amber-900/50 bg-amber-950/20 p-2 text-[11px] text-amber-300/90">
                ⚠ 已选择不校验：拷贝后不做哈希比对，无法确认素材是否完整拷入，也不会生成 MHL 校验清单。正式备份建议开启校验。
              </div>
            ) : (
              <div className="text-[11px] text-zinc-600">每个文件拷完立即与源做 {engine.verifyMode} 哈希比对，完成后还可随时「二次复检」</div>
            )}
            {/* 校验报告开关：KOCARD 式可打印报告，随素材存进目标盘 */}
            <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2">
              <div>
                <div className="text-xs text-zinc-300">生成校验报告（HTML）</div>
                <div className="mt-0.5 text-[10px] text-zinc-600">
                  拷完自动存进归档文件夹，可直接打印交付{engine.verifyMode === 'NONE' ? '；当前未开校验，报告不含哈希值' : '，含逐文件哈希与结果'}
                </div>
              </div>
              <Switch checked={engine.reportEnabled} onCheckedChange={engine.setReportEnabled} />
            </div>
          </CardContent>
        </Card>

        {/* 素材命名 —— 结果就是输入框：看到什么，拷出来就是什么 */}
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm text-zinc-200">
              <FolderCog className="h-4 w-4 text-violet-400" /> 素材命名
            </CardTitle>
            <p className="text-[11px] text-zinc-500">给素材起名字 —— 拷贝后，文件会存进目标盘里这个名字的文件夹</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <NamingBlocks
              value={engine.nameTemplate}
              onChange={engine.setNameTemplate}
              resolveToken={resolveToken}
              vars={engine.nameVars}
              onVarChange={engine.setNameVars}
            />
          </CardContent>
        </Card>

        {/* 批量入队：把所有待拷贝的源一次性排进队列（不自动开跑，由队列里的「开始拷贝」启动） */}
        {(() => {
          const idleSources = engine.sources.filter((s) => engine.sourceStatus(s) === 'idle')
          if (idleSources.length < 2) return null
          return (
            <Button variant="outline"
              className="h-9 w-full border-amber-800/70 text-amber-300 hover:bg-amber-950/40"
              disabled={selectedDests.length === 0}
              onClick={() => tryEnqueue(idleSources.map((s) => s.id))}>
              <Plus className="mr-1.5 h-4 w-4" />
              全部加入队列（{idleSources.length} 个源 · 共 {formatBytes(idleSources.reduce((a, s) => a + s.totalBytes, 0))}）
            </Button>
          )
        })()}
      </div>

      {/* 右列：任务队列（min-w-0：长路径自动截断，不把左列挤窄） */}
      <Card className="min-w-0 border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm text-zinc-200">
              <Clock3 className="h-4 w-4 text-sky-400" /> 拷贝队列（依次调度 · 支持断点续传）
            </CardTitle>
            {engine.jobs.some((j) => j.status === 'done' || j.status === 'cancelled' || j.status === 'error') && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-zinc-500 hover:text-zinc-200" onClick={engine.clearFinished}>
                <Trash2 className="mr-1 h-3 w-3" /> 清除已结束
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 队列总控：加入队列只是排队，点「开始拷贝」才真正执行（ShotPut 式） */}
          {(() => {
            const queued = engine.jobs.filter((j) => j.status === 'queued')
            const active = engine.jobs.find((j) => j.status === 'running' || j.status === 'paused')
            if (engine.queueRunning && (active || queued.length > 0)) {
              return (
                <div className="flex items-center justify-between rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2">
                  <span className="text-xs text-amber-300">
                    队列运行中{active ? `：${active.sourceLabel}` : ''}{queued.length > 0 ? ` · 还有 ${queued.length} 个等待` : ''}
                  </span>
                  <Button size="sm" variant="outline" className="h-7 border-amber-800 text-xs text-amber-300 hover:bg-amber-950"
                    onClick={engine.stopQueue}>
                    <Pause className="mr-1 h-3 w-3" /> 暂停全部
                  </Button>
                </div>
              )
            }
            if (queued.length === 0 && !engine.jobs.some((j) => j.status === 'paused')) return null
            const startable = engine.jobs.filter((j) => j.status === 'queued' || j.status === 'paused')
            const totalBytes = startable.reduce((a, j) => a + j.files.filter((f) => f.status !== 'duplicate').reduce((x, f) => x + (f.size - f.copied), 0), 0)
            return (
              <button onClick={engine.startQueue}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-600 bg-amber-500 py-2.5 text-sm font-bold text-zinc-950 transition-colors hover:bg-amber-400">
                <Play className="h-4 w-4" /> 开始拷贝
                <span className="text-[11px] font-normal opacity-80">
                  {startable.length} 个任务 · 共 {formatBytes(totalBytes)} · 依次执行{startable.some((j) => j.status === 'paused') ? '（含断点续传）' : ''}
                </span>
              </button>
            )
          })()}
          {engine.jobs.length === 0 && (
            <div className="rounded-lg border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
              队列为空 —— 选好源素材和目标后点「加入队列」排进来，再点「开始拷贝」统一执行
            </div>
          )}
          {engine.jobs.map((job) => {
            const active = job.files.filter((f) => f.status !== 'duplicate')
            const total = active.reduce((a, f) => a + f.size, 0)
            const copied = active.reduce((a, f) => a + f.copied, 0)
            const pct = total > 0 ? Math.min(100, (copied / total) * 100) : 0
            const remainSec = job.speedMBs > 0 ? (total - copied) / (job.speedMBs * 1024 * 1024) : 0
            const current = job.files[job.fileIdx]
            const dupCount = job.files.filter((f) => f.status === 'duplicate').length
            const verifying = job.status === 'running' && current?.status === 'verifying'
            const verifyPct = verifying && (current.verifyTotal ?? 0) > 0
              ? Math.min(100, ((current.verifyBytes ?? 0) / (current.verifyTotal ?? 1)) * 100)
              : 0
            const verifiedCount = job.files.filter((f) => f.status === 'done').length
            const needVerify = job.files.filter((f) => f.status !== 'duplicate').length
            return (
              <div key={job.id} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-zinc-100">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: job.camera?.accent ?? '#71717a' }} />
                    <span className="truncate">{job.sourceLabel}</span>
                    <span className="truncate text-xs font-normal text-zinc-500">
                      → {job.destPaths.map((p) => p.split('/').filter(Boolean).pop()).join('＋')}
                    </span>
                  </div>
                  <Badge variant={job.status === 'done' ? 'default' : job.status === 'error' ? 'destructive' : 'secondary'}
                    className={`shrink-0 text-[10px] ${job.status === 'done' ? 'bg-emerald-600' : ''}`}>
                    {jobStatusText[job.status]}
                  </Badge>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-zinc-600">
                  {job.sourcePath} → {job.destPaths.join(' ＋ ')}
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  <Progress value={pct} className="h-2 flex-1" />
                  <span className="w-12 shrink-0 text-right text-xs text-zinc-300">{pct.toFixed(1)}%</span>
                </div>
                {/* 校验进度条：拷贝完成的文件逐文件哈希比对，实时显示 */}
                {(verifying || (job.status === 'running' && verifiedCount > 0)) && (
                  <div className="mt-1.5 flex items-center gap-3">
                    <Progress value={verifying ? verifyPct : (needVerify > 0 ? (verifiedCount / needVerify) * 100 : 0)}
                      className="h-1.5 flex-1 [&>div]:bg-sky-400" />
                    <span className="w-24 shrink-0 text-right text-[11px] text-sky-400">
                      校验 {verifiedCount}/{needVerify}{verifying ? ` · ${verifyPct.toFixed(0)}%` : ''}
                    </span>
                  </div>
                )}
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-500">
                  <span className="truncate">
                    {job.status === 'running' && current
                      ? verifying
                        ? `正在校验：${current.name}（${formatBytes(current.verifyBytes ?? 0)} / ${formatBytes(current.verifyTotal ?? 0)}）`
                        : `正在拷贝：${current.name}（${formatBytes(current.copied)} / ${formatBytes(current.size)}）`
                      : `${job.files.length} 个文件 · ${formatBytes(total)}${dupCount > 0 ? ` · ${dupCount} 个重复已跳过` : ''}`}
                  </span>
                  {job.status === 'running' && <span className="shrink-0 text-amber-400">{job.speedMBs.toFixed(1)} MB/s · 剩余 {eta(remainSec)}</span>}
                </div>
                <div className="mt-2 flex max-h-6 flex-wrap gap-1 overflow-hidden">
                  {job.files.map((f) => (
                    <div key={f.name} title={`${f.name} — ${f.status}`}
                      className={`h-1.5 w-6 rounded-full ${
                        f.status === 'done' ? 'bg-emerald-500' :
                        f.status === 'copying' ? 'bg-amber-400' :
                        f.status === 'verifying' ? 'bg-sky-400' :
                        f.status === 'duplicate' ? 'bg-zinc-600' :
                        f.status === 'error' ? 'bg-red-500' : 'bg-zinc-800'}`} />
                  ))}
                </div>
                {(job.status === 'done' || job.status === 'error') && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {job.status === 'done' && (
                      <Button size="sm" variant="outline" className="h-7 border-emerald-800 text-xs text-emerald-400 hover:bg-emerald-950"
                        onClick={() => engine.reveal(`${job.destPaths[0]}/${job.rendered}`)}>
                        <FolderOpen className="mr-1 h-3 w-3" /> 打开归档文件夹
                      </Button>
                    )}
                    {job.reverify?.running ? (
                      <span className="flex items-center gap-2 text-xs text-sky-400">
                        <RefreshCw className="h-3 w-3 animate-spin" /> 二次复检中 {job.reverify.done}/{job.reverify.total}…
                      </span>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 border-sky-800 text-xs text-sky-400 hover:bg-sky-950"
                        onClick={() => engine.reverifyJob(job.id)}>
                        <ShieldCheck className="mr-1 h-3 w-3" /> 二次复检
                      </Button>
                    )}
                    {job.reverify && !job.reverify.running && job.reverify.total > 0 && (
                      job.reverify.failed.length === 0
                        ? <span className="text-xs text-emerald-400">复检通过 ✓ {job.reverify.total} 个文件源与目标哈希全部一致</span>
                        : <span className="text-xs text-red-400">复检发现 {job.reverify.failed.length} 个文件哈希不一致！</span>
                    )}
                  </div>
                )}
                {(job.status === 'running' || job.status === 'paused' || job.status === 'queued') && (
                  <div className="mt-2.5 flex gap-2">
                    {job.status === 'running' && (
                      <Button size="sm" variant="outline" className="h-7 border-zinc-700 text-xs" onClick={() => engine.pauseJob(job.id)}>
                        <Pause className="mr-1 h-3 w-3" /> 暂停
                      </Button>
                    )}
                    {job.status === 'paused' && (
                      <Button size="sm" className="h-7 bg-sky-600 text-xs hover:bg-sky-500" onClick={() => engine.resumeJob(job.id)}>
                        <Play className="mr-1 h-3 w-3" /> 断点续传
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-zinc-500 hover:text-red-400" onClick={() => engine.cancelJob(job.id)}>
                      <X className="mr-1 h-3 w-3" /> 取消
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* KOCARD 式底部日志条：不用切页也能看到软件在干什么 */}
      {engine.logs.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 lg:col-span-2">
          {engine.logs.slice(0, 2).map((l) => (
            <div key={l.id} className="flex items-center gap-2 truncate font-mono text-[11px] leading-5">
              <span className="shrink-0 text-zinc-600">{l.time}</span>
              <span className={`truncate ${
                l.level === 'success' ? 'text-emerald-400' :
                l.level === 'warn' ? 'text-amber-300' :
                l.level === 'error' ? 'text-red-400' : 'text-zinc-400'}`}>
                {l.message}
              </span>
            </div>
          ))}
          <div className="mt-0.5 text-right text-[10px] text-zinc-600">完整记录见左侧「日志台账」，可导出文本台账与 MHL</div>
        </div>
      )}

      <FolderPicker open={pickSource} onOpenChange={setPickSource} title="选择源素材文件夹（只读）" onSelect={engine.addSource} />
      <FolderPicker open={pickDest} onOpenChange={setPickDest} title="选择目标文件夹（可在里面新建文件夹）" allowCreate onSelect={engine.addDest} />

      {/* 空命名引导弹窗：与归档命名区是同一个积木编辑器，改的是同一份名字 */}
      <Dialog open={pendingEnqueue !== null} onOpenChange={(o) => { if (!o) setPendingEnqueue(null) }}>
        <DialogContent className="border-zinc-800 bg-zinc-950 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">先给素材起个名字</DialogTitle>
            <DialogDescription className="text-zinc-500">
              素材拷贝后会存进目标盘里这个名字的文件夹。这里的编辑器和「素材命名」区域是同一个，改的是同一份名字。
            </DialogDescription>
          </DialogHeader>
          <NamingBlocks
            value={engine.nameTemplate}
            onChange={engine.setNameTemplate}
            resolveToken={resolveToken}
            vars={engine.nameVars}
            onVarChange={engine.setNameVars}
          />
          <DialogFooter className="gap-2 sm:justify-between">
            <button
              onClick={confirmPendingEnqueue}
              className="text-[11px] text-zinc-600 underline underline-offset-2 hover:text-zinc-400">
              不命名，直接拷贝（命名为「未命名项目」）
            </button>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="text-zinc-400" onClick={() => setPendingEnqueue(null)}>返回</Button>
              <Button size="sm" className="bg-amber-500 text-zinc-950 hover:bg-amber-400"
                disabled={!engine.nameTemplate.trim()} onClick={confirmPendingEnqueue}>
                用这个名字拷贝{pendingEnqueue && pendingEnqueue.length > 1 ? `（${pendingEnqueue.length} 个源）` : ''}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
