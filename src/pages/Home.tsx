// OffloadMaster —— 影视 DIT 素材拷贝管理工作站
import { useEffect, useState } from 'react'
import { HardDriveDownload, ShieldCheck, FolderCog, ScrollText, MemoryStick, Clapperboard, Sun, Moon } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import CopyView from '@/components/dit/CopyView'
import VerifyView from '@/components/dit/VerifyView'
import OrganizeView from '@/components/dit/OrganizeView'
import LogsView from '@/components/dit/LogsView'
import CardsView from '@/components/dit/CardsView'
import { useDitEngine } from '@/hooks/useDitEngine'

const NAV = [
  { id: 'copy', label: '素材拷贝', desc: '只读 · 多盘 · 队列 · 续传', icon: HardDriveDownload },
  { id: 'verify', label: '校验中心', desc: '哈希校验 · 去重 · 重拷', icon: ShieldCheck },
  { id: 'organize', label: '整理归档', desc: '机型识别 · 命名模板', icon: FolderCog },
  { id: 'logs', label: '日志台账', desc: '全程日志 · MHL 导出', icon: ScrollText },
  { id: 'cards', label: '存储卡管理', desc: '完成提醒 · 安全格式化', icon: MemoryStick },
] as const

type NavId = (typeof NAV)[number]['id']

export default function Home() {
  const engine = useDitEngine()
  const [nav, setNav] = useState<NavId>('copy')
  // 浅色/深色：软件偏好，记住选择
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('offloadmaster:theme') === 'light' ? 'light' : 'dark'))
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('offloadmaster:theme', theme)
  }, [theme])

  const running = engine.jobs.filter((j) => j.status === 'running').length
  const queued = engine.jobs.filter((j) => j.status === 'queued').length
  const paused = engine.jobs.filter((j) => j.status === 'paused').length
  const doneCount = engine.jobs.filter((j) => j.status === 'done').length
  const errCount = engine.jobs.reduce((a, j) => a + j.files.filter((f) => f.status === 'error').length, 0)

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {/* 侧边导航 */}
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950/90 p-4">
        <div className="flex items-center gap-2.5 px-1 pb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500">
            <Clapperboard className="h-5 w-5 text-zinc-950" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">OffloadMaster</div>
            <div className="text-[10px] text-zinc-500">影视 DIT 拷贝工作站</div>
          </div>
        </div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <button key={item.id} onClick={() => setNav(item.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                nav === item.id ? 'bg-amber-500/15 text-amber-300' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}>
              <item.icon className="h-4 w-4 shrink-0" />
              <div>
                <div className="text-[13px] font-medium leading-tight">{item.label}</div>
                <div className="text-[10px] text-zinc-500">{item.desc}</div>
              </div>
              {item.id === 'verify' && errCount > 0 && (
                <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] text-white">{errCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-2">
          {/* 队列全局状态（原顶部状态条，整合进左下角） */}
          <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-[11px]">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <span className={`h-1.5 w-1.5 rounded-full ${engine.online ? 'bg-emerald-400' : 'bg-red-500'}`} />
              {engine.online ? '本地服务已连接' : '本地服务未连接'}
            </div>
            <div className="flex justify-between text-zinc-500">
              <span>拷贝中</span>
              <span className={`font-mono ${running > 0 ? 'text-amber-400' : ''}`}>{running} 个任务</span>
            </div>
            <div className="flex justify-between text-zinc-500">
              <span>排队</span>
              <span className={`font-mono ${queued > 0 ? 'text-sky-400' : ''}`}>{queued} 个任务</span>
            </div>
            <div className="flex justify-between text-zinc-500">
              <span>已暂停</span>
              <span className={`font-mono ${paused > 0 ? 'text-amber-300' : ''}`}>{paused} 个任务</span>
            </div>
            <div className="flex justify-between text-zinc-500">
              <span>已完成</span>
              <span className={`font-mono ${doneCount > 0 ? 'text-emerald-400' : ''}`}>{doneCount} 个任务</span>
            </div>
            <div className="flex justify-between text-zinc-500">
              <span>异常文件</span>
              <span className={`font-mono ${errCount > 0 ? 'text-red-400' : ''}`}>{errCount} 个</span>
            </div>
            <div className="flex justify-between text-zinc-500">
              <span>源文件夹</span><span className="text-emerald-400">只读 ✓</span>
            </div>
          </div>
          {/* 浅色/深色切换 */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 py-2 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200">
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          </button>
        </div>
      </aside>

      {/* 主区域 */}
      <main className="min-w-0 flex-1 p-6">
        {!engine.online && (
          <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
            无法连接本地服务（127.0.0.1:8310）。请先启动服务：在项目目录运行 <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-xs">npm start</code>，或双击「启动 OffloadMaster.command」。
          </div>
        )}

        <header className="mb-5">
          <h1 className="text-xl font-semibold">{NAV.find((n) => n.id === nav)?.label}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{NAV.find((n) => n.id === nav)?.desc}</p>
        </header>
        {nav === 'copy' && <CopyView engine={engine} />}
        {nav === 'verify' && <VerifyView engine={engine} />}
        {nav === 'organize' && <OrganizeView engine={engine} />}
        {nav === 'logs' && <LogsView engine={engine} />}
        {nav === 'cards' && <CardsView engine={engine} />}
      </main>

      <Toaster theme={theme} position="bottom-right" richColors />
    </div>
  )
}
