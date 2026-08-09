// 校验中心 —— 真实哈希校验结果 / 去重记录 / 异常文件重拷
import { ShieldCheck, CopyX, RefreshCw, FileWarning } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { DitEngine } from '@/hooks/useDitEngine'
import { formatBytes, type FileStatus } from '@/lib/api'

const statusMeta: Record<FileStatus, { text: string; cls: string }> = {
  pending: { text: '待处理', cls: 'text-zinc-400' },
  copying: { text: '拷贝中', cls: 'text-amber-400' },
  verifying: { text: '校验中', cls: 'text-sky-400' },
  done: { text: '校验通过 ✓', cls: 'text-emerald-400' },
  duplicate: { text: '重复跳过', cls: 'text-zinc-500' },
  error: { text: '异常 ✗', cls: 'text-red-400' },
}

export default function VerifyView({ engine }: { engine: DitEngine }) {
  const rows = engine.jobs.flatMap((job) => job.files.map((f) => ({ job, file: f })))
  const done = rows.filter((r) => r.file.status === 'done').length
  const dup = rows.filter((r) => r.file.status === 'duplicate').length
  const err = rows.filter((r) => r.file.status === 'error').length

  const stats = [
    { icon: ShieldCheck, label: '校验通过', value: done, cls: 'text-emerald-400' },
    { icon: CopyX, label: '自动去重', value: dup, cls: 'text-zinc-400' },
    { icon: FileWarning, label: '异常文件', value: err, cls: 'text-red-400' },
    { icon: RefreshCw, label: '文件总数', value: rows.length, cls: 'text-sky-400' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="flex items-center gap-3 p-4">
              <s.icon className={`h-6 w-6 ${s.cls}`} />
              <div>
                <div className="text-2xl font-semibold text-zinc-100">{s.value}</div>
                <div className="text-xs text-zinc-500">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-0">
          <ScrollArea className="h-[520px]">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">文件</TableHead>
                  <TableHead className="text-zinc-400">任务</TableHead>
                  <TableHead className="text-zinc-400">大小</TableHead>
                  <TableHead className="text-zinc-400">哈希</TableHead>
                  <TableHead className="text-zinc-400">状态</TableHead>
                  <TableHead className="text-right text-zinc-400">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableCell colSpan={6} className="py-16 text-center text-zinc-500">
                      尚无拷贝记录 —— 先去「素材拷贝」加入任务
                    </TableCell>
                  </TableRow>
                )}
                {rows.map(({ job, file }) => {
                  const meta = statusMeta[file.status]
                  return (
                    <TableRow key={`${job.id}:${file.name}`} className={`border-zinc-800 ${file.status === 'error' ? 'bg-red-950/20' : 'hover:bg-zinc-900/60'}`}>
                      <TableCell className="max-w-56 truncate font-mono text-xs text-zinc-200">{file.name}</TableCell>
                      <TableCell className="text-xs text-zinc-400">{job.sourceLabel}</TableCell>
                      <TableCell className="text-xs text-zinc-400">{formatBytes(file.size)}</TableCell>
                      <TableCell className="font-mono text-[11px] text-zinc-500">{file.hash ? `${file.hash.slice(0, 16)}…` : '—'}</TableCell>
                      <TableCell>
                        <span className={`text-xs ${meta.cls}`}>{meta.text}</span>
                        {file.status === 'error' && file.error && <div className="max-w-48 truncate text-[10px] text-red-500/80">{file.error}</div>}
                        {file.status === 'duplicate' && <div className="text-[10px] text-zinc-600">与既有备份同名同大小</div>}
                      </TableCell>
                      <TableCell className="text-right">
                        {file.status === 'error' && (
                          <Button size="sm" variant="outline" className="h-7 border-red-800 text-xs text-red-400 hover:bg-red-950"
                            onClick={() => engine.recopyFile(job.id, file.name)}>
                            <RefreshCw className="mr-1 h-3 w-3" /> 单独重拷
                          </Button>
                        )}
                        {file.status === 'done' && <Badge variant="outline" className="border-emerald-800 text-[10px] text-emerald-500">已验证</Badge>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
