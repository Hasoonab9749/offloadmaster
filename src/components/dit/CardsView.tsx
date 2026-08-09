// 存储卡管理 —— 完成提醒开关 / 真实外置卷列表 / 安全格式化（diskutil + 输入卷名确认）
import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, Eraser, HardDrive, RefreshCw, ShieldAlert, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import type { DitEngine } from '@/hooks/useDitEngine'
import { api, formatBytes, type VolumeInfo } from '@/lib/api'

export default function CardsView({ engine }: { engine: DitEngine }) {
  const [volumes, setVolumes] = useState<VolumeInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState<VolumeInfo | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [erasing, setErasing] = useState(false)

  const loadVolumes = useCallback(async () => {
    setLoading(true)
    try {
      setVolumes(await api.volumes())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '读取外置卷失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadVolumes() }, [loadVolumes])

  const startFormat = async () => {
    if (!target) return
    setErasing(true)
    try {
      await api.format(target.path, confirmText)
      toast.success(`${target.name} 格式化完成`)
      setTarget(null)
      setConfirmText('')
      loadVolumes()
    } catch (e) {
      toast.error(`格式化失败：${e instanceof Error ? e.message : '未知错误'}`)
    } finally {
      setErasing(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            {engine.notifyOnDone ? <Bell className="h-5 w-5 text-amber-400" /> : <BellOff className="h-5 w-5 text-zinc-500" />}
            <div>
              <div className="text-sm text-zinc-100">任务完成提醒</div>
              <div className="text-xs text-zinc-500">每个任务拷贝并校验完成后弹出通知</div>
            </div>
          </div>
          <Switch checked={engine.notifyOnDone} onCheckedChange={engine.setNotifyOnDone} />
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm text-zinc-200">
              <Eraser className="h-4 w-4 text-red-400" /> 安全格式化外置卷（ExFAT）
            </CardTitle>
            <Button size="icon" variant="outline" className="h-7 w-7 border-zinc-700" onClick={loadVolumes} disabled={loading}>
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 rounded-md border border-amber-900/50 bg-amber-950/20 p-3 text-xs text-amber-300/90">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            这里列出的是 Mac 上真实挂载的外置卷。格式化会调用系统 diskutil 并彻底清空该卷，需输入卷名二次确认。请务必先确认素材已全部备份并通过校验。系统盘不会显示格式化按钮。
          </div>
          {volumes.length === 0 && !loading && (
            <div className="rounded-lg border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
              未检测到外置卷 —— 插入存储卡或移动硬盘后点右上角刷新
            </div>
          )}
          {volumes.map((v) => (
            <div key={v.path} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/70 p-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <HardDrive className={`h-5 w-5 shrink-0 ${v.isSystem ? 'text-zinc-600' : 'text-amber-400'}`} />
                <div className="min-w-0">
                  <div className="truncate text-sm text-zinc-100">
                    {v.name} {v.isSystem && <span className="text-xs text-zinc-500">（系统盘）</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    可用 {formatBytes(v.freeBytes)} / 共 {formatBytes(v.totalBytes)} · <span className="font-mono text-[10px]">{v.path}</span>
                  </div>
                  <Progress value={v.totalBytes > 0 ? ((v.totalBytes - v.freeBytes) / v.totalBytes) * 100 : 0} className="mt-1.5 h-1.5 w-56" />
                </div>
              </div>
              {!v.isSystem && (
                <Button size="sm" variant="destructive" className="h-8 shrink-0 text-xs"
                  onClick={() => { setTarget(v); setConfirmText('') }}>
                  <Eraser className="mr-1.5 h-3.5 w-3.5" /> 安全格式化
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(o) => { if (!o && !erasing) { setTarget(null); setConfirmText('') } }}>
        <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <TriangleAlert className="h-5 w-5" /> 确认格式化「{target?.name}」？
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              此操作会调用 diskutil 将 <span className="font-mono text-zinc-300">{target?.path}</span> 抹掉为 ExFAT，
              卷内全部数据不可恢复。请输入卷名 <span className="font-mono text-amber-400">{target?.name}</span> 确认。
            </DialogDescription>
          </DialogHeader>
          {erasing ? (
            <div className="space-y-2 py-2">
              <div className="text-xs text-zinc-400">diskutil 正在抹掉卷…</div>
              <Progress value={50} className="h-2 animate-pulse" />
            </div>
          ) : (
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
              placeholder="输入卷名确认" className="border-zinc-700 bg-zinc-950 font-mono" />
          )}
          <DialogFooter>
            <Button variant="ghost" className="text-zinc-400" disabled={erasing} onClick={() => { setTarget(null); setConfirmText('') }}>取消</Button>
            <Button variant="destructive" disabled={!target || confirmText !== target.name || erasing} onClick={startFormat}>
              永久格式化
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
