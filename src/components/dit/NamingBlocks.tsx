// 积木式归档命名 —— 参考 Hedge / ShotPut Pro 的 token 拼块交互
// 名字由一个个模块拼成，模块之间自动加分隔符 "-"（与 ShotPut 的字段分隔一致）
// 文字块即点即改，自动块实时显示填写的内容，可拖拽排序、悬停删除
// 块所在的这一行就是最终拷出来的文件夹 —— 输入与显示是同一个东西
import { Fragment, useEffect, useRef, useState } from 'react'
import { GripVertical, Plus, Type, X } from 'lucide-react'
import type { NameVars } from '@/hooks/useDitEngine'

interface Block { id: string; kind: 'text' | 'token'; value: string }

const TOKENS = [
  { label: '日期', token: '{日期}' },
  { label: '摄影机', token: '{摄影机}' },
  { label: '机型', token: '{机型}' },
  { label: '卷号', token: '{卷号}' },
] as const

const PRESETS = [
  { name: '日期-摄影机-卷号', tpl: '{日期}-{摄影机}-{卷号}' },
  { name: '摄影机-卷号-日期', tpl: '{摄影机}-{卷号}-{日期}' },
  { name: '机型-日期', tpl: '{机型}-{日期}' },
] as const

const tokenLabel = (t: string) =>
  TOKENS.find((x) => x.token === t)?.label ?? t.replaceAll('{', '').replaceAll('}', '')

const uid = () => Math.random().toString(36).slice(2, 8)

/** 模板字符串 → 模块块：'-' 是模块分隔符，文字段按它拆成独立模块 */
function parse(tpl: string): Block[] {
  const out: Block[] = []
  const re = /\{[^}]*\}/g
  let last = 0
  const pushText = (t: string) => {
    for (const seg of t.split('-')) {
      if (seg) out.push({ id: uid(), kind: 'text', value: seg })
    }
  }
  for (const m of tpl.matchAll(re)) {
    if (m.index > last) pushText(tpl.slice(last, m.index))
    out.push({ id: uid(), kind: 'token', value: m[0] })
    last = m.index + m[0].length
  }
  if (last < tpl.length) pushText(tpl.slice(last))
  return out
}

/** 模块块 → 模板字符串：模块之间自动用 '-' 连接，空块跳过 */
const serialize = (blocks: Block[]) =>
  blocks.map((b) => b.value).filter((v) => v !== '').join('-')

interface Props {
  value: string
  onChange: (v: string) => void
  /** 把变量解析成真实内容（日期、摄影机等）；空字符串 = 该变量未填，块灰色显示且不写入 */
  resolveToken: (token: string) => string
  /** 自动信息的当前值，可直接修改 */
  vars: NameVars
  onVarChange: (patch: Partial<NameVars>) => void
}

export default function NamingBlocks({ value, onChange, resolveToken, vars, onVarChange }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(() => parse(value))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const dragIdx = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const next = parse(value)
    setBlocks((cur) => (serialize(cur) === value ? cur : next))
  }, [value])

  useEffect(() => { if (editingId) inputRef.current?.focus() }, [editingId])

  const commit = (next: Block[]) => { setBlocks(next); onChange(serialize(next)) }
  const addBlock = (kind: Block['kind'], v: string) => {
    const nb = { id: uid(), kind, value: v }
    commit([...blocks, nb])
    if (kind === 'text') { setEditingId(nb.id); setEditText(v) }
  }
  const removeBlock = (id: string) => commit(blocks.filter((b) => b.id !== id))
  const startEdit = (b: Block) => { setEditingId(b.id); setEditText(b.value) }
  const finishEdit = () => {
    if (editingId) commit(blocks.map((b) => (b.id === editingId ? { ...b, value: editText } : b)))
    setEditingId(null)
  }
  const onDrop = (idx: number) => {
    const from = dragIdx.current
    dragIdx.current = null
    if (from === null || from === idx) return
    const next = [...blocks]
    const [moved] = next.splice(from, 1)
    next.splice(idx, 0, moved)
    commit(next)
  }

  const hasToken = blocks.some((b) => b.kind === 'token')

  return (
    <div className="space-y-2.5">
      {/* 结果就是编辑器：目标盘/[模块]-[模块]/ —— 看到什么拷出来就是什么 */}
      <div className="rounded-md border border-emerald-900/60 bg-emerald-950/20 p-3">
        <div className="flex flex-wrap items-center gap-1 font-mono text-sm leading-7">
          <span className="shrink-0 text-zinc-500">目标盘/</span>
          {blocks.length === 0 && (
            <button onClick={() => addBlock('text', '')}
              title="灰色是示例，不会被拷贝 —— 点击开始起名字"
              className="flex items-center gap-1 transition-opacity hover:opacity-70">
              <span className="rounded border border-dashed border-zinc-700 px-1.5 text-zinc-600">《入场券》</span>
              <span className="text-zinc-700">-</span>
              <span className="rounded border border-dashed border-zinc-700 px-1.5 text-zinc-600">2026.6.1</span>
            </button>
          )}
          {blocks.map((b, i) => {
            const resolved = b.kind === 'token' ? resolveToken(b.value) : b.value
            const emptyToken = b.kind === 'token' && resolved === ''
            return (
            <Fragment key={b.id}>
              {i > 0 && <span className="select-none text-zinc-600">-</span>}
              <span
                draggable={editingId !== b.id}
                onDragStart={() => { dragIdx.current = i }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(i)}
                className={`group flex items-center gap-0.5 rounded border px-1.5 ${
                  b.kind === 'token'
                    ? emptyToken
                      ? 'border-zinc-700/70 bg-zinc-900/50 text-zinc-500'
                      : 'border-violet-700/70 bg-violet-950/50 text-violet-200'
                    : 'border-emerald-800/70 bg-emerald-950/40 text-emerald-200'
                }`}
                title={
                  b.kind === 'token'
                    ? emptyToken
                      ? `「${tokenLabel(b.value)}」还没填 —— 在下方补上，或删除此块；留空不会写进名字`
                      : '自动信息：拷贝时替换成下方填写的内容，可拖动排序'
                    : '文字块：点击修改，可拖动排序'
                }
              >
                <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-zinc-600" />
                {editingId === b.id ? (
                  <input
                    ref={inputRef}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={finishEdit}
                    onKeyDown={(e) => { if (e.key === 'Enter') finishEdit(); if (e.key === 'Escape') setEditingId(null) }}
                    size={Math.max(2, editText.length)}
                    className="bg-transparent text-emerald-100 outline-none"
                  />
                ) : (
                  <button onClick={() => b.kind === 'text' && startEdit(b)} className="max-w-56 truncate">
                    {b.kind === 'token' ? (emptyToken ? `（${tokenLabel(b.value)}）` : resolved) : (b.value || '（空）')}
                  </button>
                )}
                <button onClick={() => removeBlock(b.id)} title="删除"
                  className="hidden shrink-0 text-zinc-500 hover:text-red-400 group-hover:block">
                  <X className="h-3 w-3" />
                </button>
              </span>
            </Fragment>
            )
          })}
          <span className="shrink-0 text-zinc-500">/</span>
        </div>
        <div className="mt-0.5 pl-3 font-mono text-[10px] text-emerald-400/60">└─ 素材文件 + checksums.mhl</div>
      </div>

      {/* 自动信息栏：用到自动变量时才出现 —— 直接改，紫色块实时跟着变；留空则不写进名字 */}
      {hasToken && (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2">
        <span className="text-[11px] text-zinc-500">自动信息（可改，留空不写入）：</span>
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          日期
          <input
            value={vars.date}
            onChange={(e) => onVarChange({ date: e.target.value })}
            className="w-28 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200 outline-none focus:border-violet-600"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          摄影机
          <input
            value={vars.camera}
            onChange={(e) => onVarChange({ camera: e.target.value })}
            placeholder="如 Sony"
            className="w-24 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-violet-600"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          机型
          <input
            value={vars.model}
            onChange={(e) => onVarChange({ model: e.target.value })}
            placeholder="如 FX3"
            className="w-24 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-violet-600"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          卷号
          <input
            value={vars.reel}
            onChange={(e) => onVarChange({ reel: e.target.value })}
            placeholder="001"
            className="w-14 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-violet-600"
          />
        </label>
      </div>
      )}
      {blocks.length === 0 && (
        <p className="text-[11px] text-zinc-600">灰色是示例模块，不会被拷贝 —— 点击示例或下方按钮起名字</p>
      )}

      {/* 加块 + 常用组合，一行搞定 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => addBlock('text', '')}
          className="flex items-center gap-1 rounded-md border border-emerald-800/70 bg-emerald-950/30 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-950/60">
          <Type className="h-3 w-3" /> 文字
        </button>
        {TOKENS.map((t) => (
          <button key={t.token} onClick={() => addBlock('token', t.token)}
            className="flex items-center gap-1 rounded-md border border-violet-800/70 bg-violet-950/30 px-2 py-1 text-[11px] text-violet-300 hover:bg-violet-950/60">
            <Plus className="h-3 w-3" /> {t.label}
          </button>
        ))}
        <span className="mx-0.5 hidden h-4 w-px bg-zinc-800 sm:block" />
        {PRESETS.map((p) => (
          <button key={p.name} onClick={() => onChange(p.tpl)} title="一键拼好常用组合"
            className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[11px] text-zinc-500 hover:border-amber-700 hover:text-amber-300">
            {p.name}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-zinc-600">模块间自动加“-” · 紫色=自动信息 · 点击文字块修改 · 拖动排序 · 悬停删除</span>
      </div>
    </div>
  )
}
