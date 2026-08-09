// 整理归档 —— 命名模板（随拷贝任务提交给本地服务执行）
import { useMemo } from 'react'
import { FolderTree, FolderCog, ScanSearch } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DitEngine } from '@/hooks/useDitEngine'
import type { CameraInfo, ScannedSource } from '@/lib/api'

// 与服务端 renderTemplate 一致：变量以用户填写的为准，留空不写入，多余分隔符收拢
function renderTemplate(tpl: string, camera: CameraInfo, _source: ScannedSource, project: string, vars: { date: string; camera: string; model: string; reel: string }): string {
  const rendered = (tpl || '{项目}')
    .replaceAll('{项目}', project || '未命名项目')
    .replaceAll('{日期}', vars.date)
    .replaceAll('{摄影机}', vars.camera)
    .replaceAll('{机型}', vars.model)
    .replaceAll('{卷号}', vars.reel)
    .replaceAll('{分辨率}', camera.res || '素材')
  return rendered
    .split('/').map((s) => s.trim()).filter((s) => s && s !== '.' && s !== '..').join('-')
    .replace(/-{2,}/g, '-').replace(/^[-_]+|[-_]+$/g, '') || '未命名项目'
}

export default function OrganizeView({ engine }: { engine: DitEngine }) {
  const preview = useMemo(
    () => engine.sources.map((s) => ({ source: s, path: renderTemplate(engine.nameTemplate, s.camera, s, engine.projectName, engine.nameVars) })),
    [engine.sources, engine.nameTemplate, engine.projectName, engine.nameVars],
  )

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm text-zinc-200">
            <ScanSearch className="h-4 w-4 text-violet-400" /> 已扫描素材的识别结果
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {engine.sources.length === 0 && (
            <div className="rounded-lg border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
              尚未选择素材 —— 到「素材拷贝」选择文件夹后，这里会显示识别结果
            </div>
          )}
          {engine.sources.map((s) => (
            <div key={s.id} className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.camera.accent }} />
                  <span className="truncate text-sm font-medium text-zinc-100">{s.label}</span>
                </div>
                <Badge variant="outline" className="shrink-0 border-violet-800 text-[10px] text-violet-400">
                  {s.camera.brand} {s.camera.model}
                </Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-400">
                <span>编码格式：{s.camera.codec}</span>
                <span>素材文件：{s.mediaCount} / {s.fileCount} 个</span>
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-zinc-600">{s.path}</div>
            </div>
          ))}
          <p className="text-[11px] text-zinc-600">识别依据：文件扩展名 + 目录结构 + 命名规则（R3D → RED，BRAW → BMD，XDROOT → Sony，CONTENTS/CLIP → Canon，DJI_ → DJI，ARRI 命名 → ARRI）</p>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm text-zinc-200">
            <FolderCog className="h-4 w-4 text-amber-400" /> 归档路径实时预览
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3 text-xs">
            <div className="text-zinc-500">归档文件夹名：<span className="font-mono text-zinc-200">{engine.nameTemplate || '（未填写，将使用「未命名项目」）'}</span></div>
            <div className="mt-1.5 text-[11px] text-zinc-600">文件夹名在「素材拷贝」页的「素材命名」卡片中编辑，随每个拷贝任务生效。</div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <FolderTree className="h-3.5 w-3.5" /> 各素材的归档位置
            </div>
            {preview.length === 0 && (
              <div className="rounded-md border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-600">
                选择素材文件夹后显示归档预览
              </div>
            )}
            {preview.map(({ source, path }) => (
              <div key={source.id} className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3 font-mono text-xs leading-6">
                <div className="text-zinc-500"># {source.label}</div>
                <div className="text-zinc-500">目标盘/</div>
                {path.split('/').map((seg, i, arr) => (
                  <div key={i} style={{ paddingLeft: (i + 1) * 14 }} className="text-zinc-300">
                    {i === arr.length - 1 ? '└─ ' : '├─ '}{seg}/
                    {i === arr.length - 1 && <div style={{ paddingLeft: 14 }} className="text-emerald-400/80">└─ （素材文件保持原目录结构）+ checksums.mhl</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
