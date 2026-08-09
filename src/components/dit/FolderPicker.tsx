// 真实文件系统选择器 —— 浏览本机目录，支持新建文件夹
import { useCallback, useEffect, useState } from 'react'
import { ArrowUp, Folder, FolderPlus, HardDrive, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api, type ListResult } from '@/lib/api'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  allowCreate?: boolean
  onSelect: (path: string) => void
}

export default function FolderPicker({ open, onOpenChange, title, allowCreate, onSelect }: Props) {
  const [current, setCurrent] = useState<ListResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newFolder, setNewFolder] = useState('')

  const load = useCallback(async (p?: string) => {
    setLoading(true)
    setError('')
    try {
      setCurrent(await api.list(p))
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const create = async () => {
    if (!current?.path || !newFolder.trim()) return
    const target = `${current.path}/${newFolder.trim()}`
    try {
      await api.mkdir(target)
      setNewFolder('')
      await load(current.path)
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
        </DialogHeader>

        {/* 路径栏 */}
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" className="h-8 w-8 shrink-0 border-zinc-700"
            disabled={!current?.parent && current?.path !== ''} onClick={() => load(current?.parent ?? undefined)}>
            <ArrowUp className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1 truncate rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-400">
            {current?.path || '选择位置（外置卷 / 用户目录）'}
          </div>
          <Button size="icon" variant="outline" className="h-8 w-8 shrink-0 border-zinc-700" onClick={() => load(current?.path || undefined)}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* 目录列表 */}
        <ScrollArea className="h-72 rounded-md border border-zinc-800 bg-zinc-950/70">
          {loading && (
            <div className="flex h-full items-center justify-center text-zinc-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 读取中…
            </div>
          )}
          {!loading && error && <div className="p-4 text-sm text-red-400">{error}</div>}
          {!loading && !error && current?.dirs.length === 0 && (
            <div className="p-6 text-center text-sm text-zinc-500">此位置没有子文件夹</div>
          )}
          {!loading && !error && current?.dirs.map((d) => (
            <button key={d.path} onClick={() => load(d.path)}
              className="flex w-full items-center gap-2.5 border-b border-zinc-900 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900">
              {d.path.startsWith('/Volumes/') && d.path.split('/').filter(Boolean).length === 2
                ? <HardDrive className="h-4 w-4 shrink-0 text-amber-400" />
                : <Folder className="h-4 w-4 shrink-0 text-sky-400" />}
              <span className="truncate">{d.name}</span>
            </button>
          ))}
        </ScrollArea>

        {allowCreate && current?.path && (
          <div className="flex gap-2">
            <Input value={newFolder} onChange={(e) => setNewFolder(e.target.value)}
              placeholder="在当前位置新建文件夹…" className="h-8 border-zinc-700 bg-zinc-950 text-xs"
              onKeyDown={(e) => e.key === 'Enter' && create()} />
            <Button size="sm" variant="outline" className="h-8 shrink-0 border-zinc-700 text-xs" disabled={!newFolder.trim()} onClick={create}>
              <FolderPlus className="mr-1 h-3.5 w-3.5" /> 新建
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" className="text-zinc-400" onClick={() => onOpenChange(false)}>取消</Button>
          <Button className="bg-amber-500 text-zinc-950 hover:bg-amber-400"
            disabled={!current?.path}
            onClick={() => { if (current?.path) { onSelect(current.path); onOpenChange(false) } }}>
            选择此文件夹
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
