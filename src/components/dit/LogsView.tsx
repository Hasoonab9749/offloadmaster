// 日志台账 —— 本地服务真实日志 / 导出 MHL / 导出文本台账
import { ScrollText, FileDown, FileCode2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { DitEngine } from '@/hooks/useDitEngine'
import { api } from '@/lib/api'

const levelCls: Record<string, string> = {
  info: 'text-zinc-400',
  success: 'text-emerald-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
}

export default function LogsView({ engine }: { engine: DitEngine }) {
  const doneJobs = engine.jobs.filter((j) => j.files.some((f) => f.status === 'done'))

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm text-zinc-200">
            <ScrollText className="h-4 w-4 text-sky-400" /> 全程操作日志（{engine.logs.length} 条）
          </CardTitle>
          <div className="flex gap-2">
            {doneJobs.length > 0 && (
              <Button size="sm" variant="outline" className="h-8 border-zinc-700 text-xs" asChild>
                <a href={api.mhlUrl(doneJobs[doneJobs.length - 1].id)} download>
                  <FileCode2 className="mr-1.5 h-3.5 w-3.5" /> 导出最近任务 MHL
                </a>
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-8 border-zinc-700 text-xs" asChild>
              <a href={api.ledgerUrl} download>
                <FileDown className="mr-1.5 h-3.5 w-3.5" /> 导出文本台账
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[520px] rounded-md border border-zinc-800 bg-zinc-950/80 p-3">
          <div className="space-y-1.5 font-mono text-xs">
            {engine.logs.map((log) => (
              <div key={log.id} className="flex items-baseline gap-3">
                <span className="shrink-0 text-zinc-600">{log.time}</span>
                <Badge variant="outline" className={`h-4 shrink-0 border-zinc-800 px-1 text-[9px] ${levelCls[log.level]}`}>
                  {log.level.toUpperCase()}
                </Badge>
                <span className={levelCls[log.level]}>{log.message}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
        <p className="mt-2 text-[11px] text-zinc-600">
          任务完成时 checksums.mhl 会自动写入每个目标盘的归档文件夹；这里导出的 MHL 与文本台账可交接后期或留档。日志同时落盘到 ~/.offloadmaster/offload.log。
        </p>
      </CardContent>
    </Card>
  )
}
