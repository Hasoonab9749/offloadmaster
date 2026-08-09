// ============================================================
// OffloadMaster 本地服务 —— 真实文件拷贝 / 哈希校验 / MHL / 格式化
// 仅监听 127.0.0.1，供本机界面调用
// ============================================================
import express from 'express'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 8310
const HOST = '127.0.0.1'
const IS_WIN = process.platform === 'win32'
const DATA_DIR = path.join(os.homedir(), '.offloadmaster')
const LEDGER_FILE = path.join(DATA_DIR, 'ledger.json')
const LOG_FILE = path.join(DATA_DIR, 'offload.log')
const MAX_SCAN_FILES = 20000

// Windows 盘符枚举（C-Z 中真实存在的驱动器；macOS 用 /Volumes）
function winDrives() {
  const out = []
  for (const c of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const p = `${c}:\\`
    try { fs.statfsSync(p); out.push(p) } catch { /* 盘不存在 */ }
  }
  return out
}

fs.mkdirSync(DATA_DIR, { recursive: true })

// 软件版本（读 package.json，用于报告与 MHL 署名）
const VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version } catch { return '' }
})()

// ---------------- 去重台账（哈希登记本，持久化） ----------------
let ledger = {}
try { ledger = JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')) } catch { /* 首次运行 */ }
const saveLedger = () => fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2))

// ---------------- 日志 ----------------
const logs = []
const uid = () => Math.random().toString(36).slice(2, 9)
const nowTime = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })

function addLog(level, message) {
  logs.unshift({ id: uid(), time: nowTime(), level, message })
  if (logs.length > 500) logs.pop()
  fs.appendFile(LOG_FILE, `${new Date().toISOString()} [${level.toUpperCase()}] ${message}\n`, () => {})
}
addLog('info', 'OffloadMaster 本地服务已启动')

// ---------------- 摄影机素材识别 ----------------
const VIDEO_EXTS = new Set(['.mov', '.mp4', '.mxf', '.mts', '.m2ts', '.avi', '.r3d', '.braw', '.ari', '.m2v'])

function detectCamera(files) {
  const rels = files.map((f) => f.rel)
  const exts = new Set(files.map((f) => path.extname(f.rel).toLowerCase()))
  if (exts.has('.r3d')) return { id: 'red', brand: 'RED', model: 'RED 摄影机', codec: 'REDCODE RAW (R3D)', accent: '#f87171', res: '6K' }
  if (exts.has('.braw')) return { id: 'bmd', brand: 'Blackmagic', model: 'BMD 摄影机', codec: 'Blackmagic RAW', accent: '#fbbf24', res: '12K' }
  if (exts.has('.ari') || rels.some((r) => /^ARRI\//i.test(r)) || rels.some((r) => /[A-Z]\d{3}C\d{3}_.*\.(mxf|mov)$/i.test(path.basename(r))))
    return { id: 'arri', brand: 'ARRI', model: 'ARRI 摄影机', codec: 'ARRIRAW / ProRes', accent: '#38bdf8', res: '4.6K' }
  if (rels.some((r) => /XDROOT/i.test(r))) return { id: 'sony', brand: 'Sony', model: 'Sony 摄影机', codec: 'X-OCN / XAVC', accent: '#a78bfa', res: '8.6K' }
  if (rels.some((r) => /CONTENTS\/CLIP/i.test(r))) return { id: 'canon', brand: 'Canon', model: 'Canon 摄影机', codec: 'XF-AVC / Cinema RAW', accent: '#fb923c', res: '4K' }
  if (rels.some((r) => /^DJI_/i.test(path.basename(r)))) return { id: 'dji', brand: 'DJI', model: 'DJI 影像设备', codec: 'ProRes / H.264', accent: '#34d399', res: '4K' }
  if ([...exts].some((e) => VIDEO_EXTS.has(e))) return { id: 'generic', brand: '通用', model: '视频素材', codec: 'MOV/MP4/MXF 等', accent: '#94a3b8', res: '' }
  return { id: 'unknown', brand: '未知', model: '未识别素材', codec: '—', accent: '#71717a', res: '' }
}

async function walk(dir, base, out) {
  if (out.length >= MAX_SCAN_FILES) { out.truncated = true; return }
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isSymbolicLink()) {
      // 符号链接：解析真实目标，避免素材被静默漏拷
      try {
        const st = await fsp.stat(full)
        if (st.isFile()) out.push({ rel: path.relative(base, full), size: st.size })
        else if (st.isDirectory()) await walk(full, base, out)
      } catch { /* 失效链接跳过 */ }
    } else if (e.isDirectory()) await walk(full, base, out)
    else if (e.isFile()) {
      const st = await fsp.stat(full)
      out.push({ rel: path.relative(base, full), size: st.size })
      if (out.length >= MAX_SCAN_FILES) { out.truncated = true; return }
    }
  }
}

// ---------------- 哈希 ----------------
function hashFile(filePath, algo, onProgress) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash(algo)
    const rs = fs.createReadStream(filePath)
    rs.on('data', (d) => { h.update(d); if (onProgress) onProgress(d.length) })
    rs.on('end', () => resolve(h.digest('hex')))
    rs.on('error', reject)
  })
}

// ---------------- 归档文件夹命名 ----------------
// 拷贝只生成一个文件夹：模板即文件夹名，变量替换真实内容，'/' 一律拍平为 '-'
function renderTemplate(tpl, { project, camera, sourcePath, vars }) {
  const date = new Date().toISOString().slice(0, 10)
  const reelMatch = path.basename(sourcePath).match(/(\d{1,3})/)
  const autoReel = (reelMatch?.[1] ?? '1').padStart(3, '0')
  // 变量以用户填写的为准（可修改）；留空的变量不写入名字；老客户端未传 vars 时回退到自动检测
  const v = vars ?? null
  const pick = (userVal, autoVal) => (v === null ? autoVal : String(userVal ?? ''))
  const rendered = (tpl || '{项目}')
    .replaceAll('{项目}', project || '未命名项目')
    .replaceAll('{日期}', pick(v?.date, date))
    .replaceAll('{摄影机}', pick(v?.camera, camera.brand))
    .replaceAll('{机型}', pick(v?.model, camera.model.replaceAll(' ', '-')))
    .replaceAll('{卷号}', pick(v?.reel, autoReel))
    .replaceAll('{分辨率}', camera.res || '素材')
  // 安全 + 单层：过滤路径穿越，分段合并为一个文件夹名；变量留空产生的多余分隔符顺手收掉
  const safe = rendered
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s && s !== '.' && s !== '..')
    .join('-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
  return safe || '未命名项目'
}

// ---------------- 拷贝任务引擎 ----------------
const jobs = []
// 队列总开关：只有点了「开始拷贝」才会真正执行；队列清空后自动解除
let queueRunning = false

// 队列排空检查：没有等待中的任务就解除运行状态
function disarmIfDrained() {
  if (!jobs.some((j) => j.status === 'queued' || j.status === 'running' || j.status === 'paused')) queueRunning = false
}

// 启动下一个排队任务（仅在队列已启动时）
function startNextQueued() {
  if (!queueRunning) return
  if (jobs.some((j) => j.status === 'running')) return
  const next = jobs.find((j) => j.status === 'queued')
  if (next) runJob(next).catch((e) => addLog('error', `任务异常中断：${e.message}`))
  else disarmIfDrained()
}

function jobSummary(j) {
  return {
    id: j.id, sourcePath: j.sourcePath, sourceLabel: j.sourceLabel, camera: j.camera,
    destPaths: j.destPaths, status: j.status, speedMBs: j.speedMBs, verifyMode: j.verifyMode,
    template: j.template, project: j.project, createdAt: j.createdAt, fileIdx: j.fileIdx,
    rendered: j.rendered,
    reverify: j.reverify ?? null,
    files: j.files.map((f) => ({ name: f.rel, size: f.size, copied: f.copied, hash: f.hash, status: f.status, error: f.error, verifyBytes: f.verifyBytes ?? 0, verifyTotal: f.verifyTotal ?? 0 })),
  }
}

async function copyOne(src, dst, offset, job, file) {
  await fsp.mkdir(path.dirname(dst), { recursive: true })
  const rs = fs.createReadStream(src, offset > 0 ? { start: offset } : undefined)
  const ws = fs.createWriteStream(dst, offset > 0 ? { flags: 'r+', start: offset } : {})
  rs.on('data', (chunk) => {
    file.sessionBytes += chunk.length
    file.copied = offset + file.sessionBytes // 实时进度（含续传偏移）
    job.sessionBytes += chunk.length
    if (job.control !== 'run') rs.destroy()
  })
  try {
    await pipeline(rs, ws)
  } catch (err) {
    if (job.control !== 'run') return 'paused'
    throw err
  }
  return 'done'
}

async function runJob(job) {
  job.status = 'running'
  job.control = 'run'
  job.lastSample = job.sessionBytes // 重置速度采样基点，避免续传后速率虚高
  addLog('info', `开始拷贝：${job.sourceLabel} → ${job.destPaths.length} 个目标（${job.verifyMode === 'NONE' ? '校验已关闭' : `${job.verifyMode} 校验`}）`)

  for (let i = 0; i < job.files.length; i++) {
    job.fileIdx = i
    const file = job.files[i]
    if (file.status === 'done' || file.status === 'duplicate') continue
    if (job.control === 'cancel') break
    while (job.control === 'pause') {
      job.status = 'paused'
      await new Promise((r) => setTimeout(r, 300))
    }
    job.status = 'running'

    const src = path.join(job.sourcePath, file.rel)
    file.status = 'copying'
    file.error = undefined

    for (const destRoot of job.destPaths) {
      const dst = path.join(destRoot, job.rendered, file.rel)
      // 断点续传：目标已存在且小于源文件 → 从已有长度继续
      let offset = 0
      try {
        const st = await fsp.stat(dst)
        if (st.size < file.size) offset = st.size
        else if (st.size === file.size && file.copied >= file.size) offset = file.size
      } catch { /* 目标不存在 */ }
      if (file.copied < offset) file.copied = offset
      file.sessionBytes = 0
      try {
        const r = await copyOne(src, dst, offset, job, file)
        if (r === 'paused') break
      } catch (err) {
        file.status = 'error'
        file.error = `拷贝失败：${err.message}`
        addLog('error', `${file.rel} 拷贝失败：${err.message}`)
        break
      }
      file.copied = file.size
    }
    if (job.control !== 'run') { if (file.status === 'copying') file.status = 'pending'; break }
    if (file.status === 'error') continue

    // 用户可选择不校验：跳过哈希比对，直接标记完成（不登记台账、不生成 MHL）
    if (job.verifyMode === 'NONE') {
      file.status = 'done'
      file.hash = ''
      addLog('info', `已拷贝（校验关闭，未做哈希比对）：${file.rel}`)
      continue
    }

    // 哈希校验（实时进度：源 + 每个目标各算一遍，总量 = 大小 × (1+目标数)）
    file.status = 'verifying'
    file.verifyBytes = 0
    file.verifyTotal = file.size * (1 + job.destPaths.length)
    try {
      const algo = job.verifyMode === 'SHA-256' ? 'sha256' : 'md5'
      const tick = (n) => { file.verifyBytes += n }
      const srcHash = await hashFile(src, algo, tick)
      for (const destRoot of job.destPaths) {
        const dstHash = await hashFile(path.join(destRoot, job.rendered, file.rel), algo, tick)
        if (dstHash !== srcHash) throw new Error(`${path.basename(destRoot)} 哈希不一致`)
      }
      file.hash = srcHash
      file.status = 'done'
      ledger[`${file.rel}:${file.size}`] = { hash: srcHash, when: new Date().toISOString(), source: job.sourceLabel }
      saveLedger()
      addLog('success', `校验通过 ✓ ${file.rel} [${srcHash.slice(0, 16)}…]`)
    } catch (err) {
      file.status = 'error'
      file.error = err.message
      addLog('error', `校验失败：${file.rel}（${err.message}），已单独标记`)
    }
  }

  if (job.control === 'cancel') {
    job.status = 'cancelled'
    addLog('warn', `任务已取消：${job.sourceLabel}（目标盘可能留有未完成文件，重新入队会续拷或覆盖）`)
    startNextQueued()
    return
  }
  if (job.status === 'paused') return
  job.status = job.files.some((f) => f.status === 'error') ? 'error' : 'done'
  job.speedMBs = 0
  job.finishedAt = nowTime()
  // 只要有带哈希的校验通过文件就写 MHL（关闭校验的任务不生成）
  if (job.files.some((f) => f.status === 'done' && f.hash)) {
    for (const destRoot of job.destPaths) {
      try { await fsp.writeFile(path.join(destRoot, job.rendered, 'checksums.mhl'), buildMHL(job)) } catch { /* ignore */ }
    }
  }
  // 校验报告（可选）：KOCARD 式可打印 HTML，随素材存入目标盘
  if (job.report) {
    const name = `校验报告-${job.sourceLabel.replace(/[\\/:*?"<>|]/g, '-')}.html`
    for (const destRoot of job.destPaths) {
      try { await fsp.writeFile(path.join(destRoot, job.rendered, name), buildReport(job, destRoot)) } catch { /* ignore */ }
    }
    addLog('info', `校验报告已写入目标盘：${name}`)
  }
  if (job.status === 'done') {
    addLog('success', `任务完成：${job.sourceLabel}${job.verifyMode === 'NONE' ? '（校验关闭，素材未做哈希比对，建议尽快复检）' : '，全部文件校验通过 ✓ MHL 已写入目标盘'}`)
  } else {
    addLog('error', `任务完成但有异常文件：${job.sourceLabel}，已到校验中心标记；通过的文件已写入 MHL`)
  }
  // 队列结束时自动启动下一个任务；队列清空则解除运行状态
  startNextQueued()
}

// 二次复检：任务完成后，把源与全部目标重新算哈希比对，确认素材真正拷对
async function reverifyJob(job) {
  const files = job.files.filter((f) => f.status === 'done')
  job.reverify = { running: true, done: 0, total: files.length, failed: [] }
  addLog('info', `开始二次复检：${job.sourceLabel}（重新计算 ${files.length} 个文件的哈希并比对）`)
  const algo = job.verifyMode === 'SHA-256' ? 'sha256' : 'md5'
  for (const f of files) {
    try {
      const srcHash = await hashFile(path.join(job.sourcePath, f.rel), algo)
      for (const destRoot of job.destPaths) {
        const dstHash = await hashFile(path.join(destRoot, job.rendered, f.rel), algo)
        if (dstHash !== srcHash) throw new Error('哈希不一致')
      }
    } catch (err) {
      job.reverify.failed.push(f.rel)
      addLog('error', `复检失败：${f.rel}（${err.message}）`)
    }
    job.reverify.done++
  }
  job.reverify.running = false
  if (job.reverify.failed.length === 0) addLog('success', `二次复检通过 ✓ ${job.sourceLabel}：${files.length} 个文件源与目标哈希全部一致`)
  else addLog('error', `二次复检发现 ${job.reverify.failed.length} 个异常文件：${job.sourceLabel}`)
}

// 速度采样
setInterval(() => {
  for (const j of jobs) {
    if (j.status === 'running') {
      const delta = j.sessionBytes - (j.lastSample ?? 0)
      j.speedMBs = delta / 1024 / 1024
      j.lastSample = j.sessionBytes
    } else j.speedMBs = 0
  }
}, 1000)

// ---------------- MHL / 台账导出 ----------------
function buildMHL(job) {
  const date = new Date().toISOString()
  const tag = job.verifyMode === 'SHA-256' ? 'sha256' : 'md5'
  const items = job.files
    .filter((f) => f.status === 'done')
    .map((f) => `  <hash>\n    <file size="${f.size}">${f.rel}</file>\n    <${tag}>${f.hash}</${tag}>\n  </hash>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<hashlist version="2.0" xmlns="urn:ASC:MHL:v2.0">\n  <creatorinfo>\n    <creationdate>${date}</creationdate>\n    <hostname>${os.hostname()}</hostname>\n    <tool>OffloadMaster ${VERSION}</tool>\n  </creatorinfo>\n${items}\n</hashlist>\n`
}

// ---------------- 校验报告（KOCARD 式：可打印的 HTML 报告，随素材存入目标盘） ----------------
const escHtml = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

function fmtBytes(b) {
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`
  if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
}

function buildReport(job, destRoot) {
  const done = job.files.filter((f) => f.status === 'done')
  const dup = job.files.filter((f) => f.status === 'duplicate')
  const failed = job.files.filter((f) => f.status === 'error')
  const total = job.files.reduce((a, f) => a + f.size, 0)
  const verified = done.filter((f) => f.hash).length
  const noVerify = job.verifyMode === 'NONE'
  const ok = failed.length === 0
  const resultText = noVerify ? '未校验（拷贝时关闭了校验）' : ok ? '全部校验通过 ✓' : `${failed.length} 个文件校验失败`
  const resultClass = noVerify ? 'warn' : ok ? 'ok' : 'bad'
  // 报告跟随软件界面主题：深/浅色与 App 内同一套配色（琥珀主色 + 翠绿通过 / 红异常 / 琥珀警示）
  const dark = job.theme !== 'light'
  const C = dark
    ? { bg: '#09090b', fg: '#f4f4f5', sub: '#71717a', border: '#27272a', th: '#18181b', infoBg: '#101013', infoKey: '#a1a1aa', hash: '#a1a1aa', ok: '#34d399', bad: '#f87171', warn: '#fbbf24', muted: '#71717a', amber: '#f59e0b', onAmber: '#09090b' }
    : { bg: '#ffffff', fg: '#1c1c1e', sub: '#8e8e93', border: '#d1d1d6', th: '#f2f2f7', infoBg: '#f9f9fb', infoKey: '#636366', hash: '#636366', ok: '#248a3d', bad: '#d70015', warn: '#b25000', muted: '#8e8e93', amber: '#d97706', onAmber: '#ffffff' }
  const statusOf = (f) => {
    if (f.status === 'done') return f.hash ? ['校验通过 ✓', 'ok'] : ['已拷贝（未校验）', 'warn']
    if (f.status === 'duplicate') return ['重复跳过', 'muted']
    if (f.status === 'error') return [`异常 ✗ ${f.error || ''}`, 'bad']
    return ['未完成', 'bad']
  }
  const rows = job.files.map((f, i) => {
    const [txt, cls] = statusOf(f)
    return `    <tr><td>${i + 1}</td><td class="mono">${escHtml(f.rel)}</td><td>${fmtBytes(f.size)}</td><td class="mono hash">${f.hash || '—'}</td><td class="${cls}">${escHtml(txt)}</td></tr>`
  }).join('\n')
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>校验报告 - ${escHtml(job.sourceLabel)}</title>
<style>
  body { font-family: -apple-system, "PingFang SC", sans-serif; max-width: 900px; margin: 32px auto; padding: 0 24px; color: ${C.fg}; background: ${C.bg}; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
  .logo { width: 34px; height: 34px; border-radius: 8px; background: ${C.amber}; color: ${C.onAmber}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; letter-spacing: 0.5px; }
  .brand .name { font-weight: 700; font-size: 15px; }
  .brand .ver { color: ${C.sub}; font-size: 11px; }
  .sub { color: ${C.sub}; font-size: 13px; margin-bottom: 24px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid ${C.border}; padding: 6px 10px; text-align: left; }
  th { background: ${C.th}; }
  .info td:first-child { width: 130px; background: ${C.infoBg}; color: ${C.infoKey}; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; }
  .hash { word-break: break-all; max-width: 260px; color: ${C.hash}; }
  .ok { color: ${C.ok}; font-weight: 600; }
  .bad { color: ${C.bad}; font-weight: 600; }
  .warn { color: ${C.warn}; font-weight: 600; }
  .muted { color: ${C.muted}; }
  .summary { display: flex; gap: 12px; margin: 16px 0 24px; }
  .stat { flex: 1; border: 1px solid ${C.border}; border-radius: 8px; padding: 10px 14px; }
  .stat b { display: block; font-size: 20px; margin-top: 2px; }
  .stat span { font-size: 12px; color: ${C.sub}; }
  .footer { margin-top: 24px; font-size: 12px; color: ${C.sub}; border-top: 1px solid ${C.border}; padding-top: 12px; }
  @media print { body { margin: 0; background: #fff; color: #1c1c1e; } }
</style>
</head>
<body>
  <div class="brand">
    <div class="logo">OM</div>
    <div>
      <div class="name">OffloadMaster</div>
      <div class="ver">影视 DIT 拷贝工作站 ${escHtml(VERSION)}</div>
    </div>
  </div>
  <h1>素材拷贝校验报告</h1>
  <div class="sub">生成时间 ${new Date().toLocaleString('zh-CN')} · ${dark ? '深色版式' : '浅色版式'}（与软件界面一致）</div>
  <table class="info">
    <tr><td>源素材</td><td>${escHtml(job.sourceLabel)}（<span class="mono">${escHtml(job.sourcePath)}</span>）</td></tr>
    <tr><td>备份位置</td><td class="mono">${escHtml(path.join(destRoot, job.rendered))}</td></tr>
    <tr><td>摄影机</td><td>${escHtml(`${job.camera.brand} ${job.camera.model} · ${job.camera.codec}`)}</td></tr>
    <tr><td>校验方式</td><td>${noVerify ? '未启用' : escHtml(job.verifyMode) + ' 逐文件哈希比对'}</td></tr>
    <tr><td>开始时间</td><td>${escHtml(job.createdAt)}</td></tr>
    <tr><td>完成时间</td><td>${escHtml(job.finishedAt || '—')}</td></tr>
    <tr><td>结果</td><td class="${resultClass}">${escHtml(resultText)}</td></tr>
  </table>
  <div class="summary">
    <div class="stat"><span>文件总数</span><b>${job.files.length}</b></div>
    <div class="stat"><span>总大小</span><b>${fmtBytes(total)}</b></div>
    <div class="stat"><span>校验通过</span><b class="ok">${verified}</b></div>
    <div class="stat"><span>重复跳过</span><b class="muted">${dup.length}</b></div>
    <div class="stat"><span>异常</span><b class="bad">${failed.length}</b></div>
  </div>
  <h2 style="font-size:16px">文件明细</h2>
  <table>
    <tr><th style="width:40px">#</th><th>文件</th><th style="width:90px">大小</th><th>${noVerify ? '哈希（未校验）' : escHtml(job.verifyMode) + ' 哈希'}</th><th style="width:130px">状态</th></tr>
${rows}
  </table>
  <div class="footer">
    同目录下的 checksums.mhl 为机器可读的哈希清单，可用于后期二次复检。本报告由 OffloadMaster 自动生成。打印时自动转为白纸黑字。
  </div>
</body>
</html>
`
}

// ---------------- HTTP API ----------------
const app = express()
app.use(express.json({ limit: '2mb' }))

// 目录浏览（仅列目录，供文件夹选择器）
app.get('/api/list', async (req, res) => {
  try {
    let p = req.query.path
    if (!p) {
      if (IS_WIN) {
        const roots = [
          { name: '用户目录', path: os.homedir() },
          ...winDrives().map((d) => ({ name: `磁盘 ${d.replace('\\', '')}`, path: d })),
        ]
        return res.json({ path: '', parent: null, dirs: roots })
      }
      const vols = await fsp.readdir('/Volumes').catch(() => [])
      const roots = [
        { name: '用户目录', path: os.homedir() },
        ...vols.filter((v) => !v.startsWith('.')).map((v) => ({ name: `外置卷 · ${v}`, path: path.join('/Volumes', v) })),
      ]
      return res.json({ path: '', parent: null, dirs: roots })
    }
    p = String(p)
    const entries = await fsp.readdir(p, { withFileTypes: true })
    const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, path: path.join(p, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name))
    res.json({ path: p, parent: path.dirname(p) === p ? null : path.dirname(p), dirs })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

app.post('/api/mkdir', async (req, res) => {
  try {
    const p = String(req.body.path)
    await fsp.mkdir(p, { recursive: true })
    addLog('info', `新建文件夹：${p}`)
    res.json({ ok: true })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

app.get('/api/space', (req, res) => {
  try {
    const st = fs.statfsSync(String(req.query.path))
    res.json({ freeBytes: st.bavail * st.bsize, totalBytes: st.blocks * st.bsize })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

app.get('/api/volumes', async (_req, res) => {
  try {
    if (IS_WIN) {
      const out = []
      for (const d of winDrives()) {
        try {
          const st = fs.statfsSync(d)
          const letter = d.replace('\\', '')
          out.push({ name: `磁盘 ${letter}`, path: d, freeBytes: st.bavail * st.bsize, totalBytes: st.blocks * st.bsize, isSystem: letter === 'C:' })
        } catch { /* 跳过无权限盘 */ }
      }
      return res.json(out)
    }
    const vols = await fsp.readdir('/Volumes')
    const out = []
    for (const v of vols) {
      if (v.startsWith('.')) continue
      const p = path.join('/Volumes', v)
      try {
        const st = fs.statfsSync(p)
        const real = fs.realpathSync(p)
        out.push({ name: v, path: p, freeBytes: st.bavail * st.bsize, totalBytes: st.blocks * st.bsize, isSystem: real === '/' })
      } catch { /* 跳过无权限卷 */ }
    }
    res.json(out)
  } catch (err) { res.status(400).json({ error: err.message }) }
})

// 扫描素材文件夹
app.post('/api/scan', async (req, res) => {
  try {
    const p = String(req.body.path)
    const st = await fsp.stat(p)
    if (!st.isDirectory()) throw new Error('不是文件夹')
    const files = []
    await walk(p, p, files)
    const camera = detectCamera(files)
    const totalBytes = files.reduce((a, f) => a + f.size, 0)
    const mediaCount = files.filter((f) => VIDEO_EXTS.has(path.extname(f.rel).toLowerCase())).length
    if (files.truncated) addLog('warn', `扫描截断：${p} 文件数超过 ${MAX_SCAN_FILES}，建议分目录拷贝`)
    addLog('info', `扫描素材文件夹：${p}（${files.length} 个文件，识别为 ${camera.brand} ${camera.model}）`)
    res.json({ files, totalBytes, camera, mediaCount, truncated: !!files.truncated })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

// 任务状态
app.get('/api/state', (_req, res) => {
  res.json({ jobs: jobs.map(jobSummary), logs, queueRunning })
})

// 队列总控：开始拷贝（启动排队中的任务，依次执行；有暂停的任务先接续断点）
app.post('/api/queue/start', (_req, res) => {
  const queued = jobs.filter((j) => j.status === 'queued')
  const paused = jobs.find((j) => j.status === 'paused')
  if (queued.length === 0 && !paused && !jobs.some((j) => j.status === 'running'))
    return res.status(400).json({ error: '队列是空的，先把素材加入队列' })
  queueRunning = true
  addLog('info', `▶ 开始拷贝：队列共 ${queued.length + (paused ? 1 : 0)} 个任务，依次执行`)
  if (paused && !jobs.some((j) => j.status === 'running')) {
    addLog('info', `断点续传：${paused.sourceLabel} 从中断位置继续`)
    runJob(paused).catch((e) => addLog('error', `任务异常中断：${e.message}`))
  } else {
    startNextQueued()
  }
  res.json({ ok: true })
})

// 队列总控：停止（当前任务暂停，后续任务不再自动开始）
app.post('/api/queue/stop', (_req, res) => {
  queueRunning = false
  const running = jobs.find((j) => j.status === 'running')
  if (running) {
    running.control = 'pause'
    addLog('warn', `队列已暂停：${running.sourceLabel} 断点已保存，剩余任务等待手动开始`)
  } else {
    addLog('warn', '队列已停止：剩余任务等待手动开始')
  }
  res.json({ ok: true })
})

// 创建拷贝任务 —— 一个源 × N 个目标 = N 个独立任务（队列里分开显示，可单独暂停/取消/复检）
app.post('/api/jobs', async (req, res) => {
  try {
    const { sourcePath, sourceLabel, destPaths, verifyMode, template, project, nameVars, report, theme } = req.body
    if (!sourcePath || !Array.isArray(destPaths) || destPaths.length === 0) throw new Error('参数不完整')
    for (const d of destPaths) fs.statfsSync(d) // 目标盘不可用会直接抛错
    const files = []
    await walk(String(sourcePath), String(sourcePath), files)
    if (files.length === 0) throw new Error('源文件夹为空')
    if (files.truncated) addLog('warn', `源文件夹文件数超过 ${MAX_SCAN_FILES}，已截断扫描，请分目录拷贝`)
    const camera = detectCamera(files)
    const vars = nameVars && typeof nameVars === 'object' ? nameVars : null
    const rendered = renderTemplate(String(template || ''), { project: String(project || ''), camera, sourcePath: String(sourcePath), vars })
    const mode = verifyMode === 'SHA-256' ? 'SHA-256' : verifyMode === 'NONE' ? 'NONE' : 'MD5'
    const algo = mode === 'SHA-256' ? 'sha256' : 'md5'
    const label = String(sourceLabel || path.basename(String(sourcePath)))

    const ids = []
    for (const destRaw of destPaths) {
      const dest = String(destRaw)
      let dupCount = 0
      const jobFiles = []
      for (const f of files) {
        // 去重需过三关：台账有记录 + 这个目标真实存在 + 源文件哈希与台账一致；校验关闭时一律不去重
        let dup = false
        const inLedger = mode !== 'NONE' ? ledger[`${f.rel}:${f.size}`] : null
        if (inLedger) {
          let existsInDest = false
          try { existsInDest = fs.statSync(path.join(dest, rendered, f.rel)).size === f.size } catch { /* 目标没有 */ }
          if (existsInDest) {
            try {
              const srcHash = await hashFile(path.join(String(sourcePath), f.rel), algo)
              dup = srcHash === inLedger.hash
              if (!dup) addLog('warn', `去重复核：${f.rel} 同名同大小但内容不同，按新素材正常拷贝`)
            } catch { dup = false }
          }
        }
        if (dup) dupCount++
        jobFiles.push({ rel: f.rel, size: f.size, copied: 0, sessionBytes: 0, hash: '', status: dup ? 'duplicate' : 'pending' })
      }

      // 空间预判：该目标可用空间需 ≥ 需要写入量 × 1.02
      const needBytes = jobFiles.filter((f) => f.status !== 'duplicate').reduce((a, f) => a + f.size, 0)
      const st = fs.statfsSync(dest)
      if (st.bavail * st.bsize < needBytes * 1.02)
        return res.status(400).json({ error: `空间不足：${dest} 可用 ${(st.bavail * st.bsize / 1e9).toFixed(1)} GB，需要 ${(needBytes * 1.02 / 1e9).toFixed(1)} GB` })

      const job = {
        id: uid(), sourcePath: String(sourcePath), sourceLabel: label,
        camera, destPaths: [dest], files: jobFiles, fileIdx: 0,
        status: 'queued', control: 'queue', speedMBs: 0, sessionBytes: 0,
        verifyMode: mode, report: report !== false, // 校验报告默认生成，用户可关
        theme: theme === 'light' ? 'light' : 'dark', // 报告版式跟随软件界面主题
        template: String(template || ''), project: String(project || ''), rendered, createdAt: nowTime(),
      }
      jobs.push(job)
      ids.push(job.id)
      addLog('info', `已加入队列：${label} → ${path.basename(dest) || dest}，共 ${(needBytes / 1e9).toFixed(2)} GB，归档至 ${rendered}`)
      if (dupCount > 0) addLog('warn', `自动去重：${dupCount} 个文件在该目标已有备份，将跳过`)
    }
    // 只在队列已启动时才接续执行；否则停在队列里等「开始拷贝」
    startNextQueued()
    res.json({ id: ids[0], ids })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

app.post('/api/jobs/:id/:action', async (req, res) => {
  const { action } = req.params
  // 批量操作：清除已结束的任务（完成/已取消/异常；正在复检的保留）
  if (req.params.id === 'all' && action === 'clear-finished') {
    const before = jobs.length
    for (let i = jobs.length - 1; i >= 0; i--) {
      const st = jobs[i].status
      if ((st === 'done' || st === 'cancelled' || st === 'error') && !jobs[i].reverify?.running) jobs.splice(i, 1)
    }
    const n = before - jobs.length
    addLog('info', n > 0 ? `已清除 ${n} 个已结束的任务` : '没有可清除的任务')
    disarmIfDrained()
    return res.json({ ok: true, cleared: n })
  }
  const job = jobs.find((j) => j.id === req.params.id)
  if (!job) return res.status(404).json({ error: '任务不存在' })
  if (action === 'pause' && job.status === 'running') {
    job.control = 'pause'
    addLog('warn', `任务已暂停：${job.sourceLabel} —— 断点已保存，可随时续传`)
  } else if (action === 'resume' && (job.status === 'paused')) {
    addLog('info', `断点续传：${job.sourceLabel} 从中断位置继续`)
    runJob(job).catch((e) => addLog('error', `任务异常中断：${e.message}`))
  } else if (action === 'cancel') {
    job.control = 'cancel'
    if (job.status === 'queued') { job.status = 'cancelled'; addLog('warn', `任务已取消：${job.sourceLabel}`) }
  } else if (action === 'recopy') {
    const rel = String(req.body.file || '')
    const file = job.files.find((f) => f.rel === rel)
    if (!file) return res.status(404).json({ error: '文件不存在' })
    file.status = 'pending'; file.copied = 0; file.error = undefined
    // 删除目标残缺文件后重拷
    for (const destRoot of job.destPaths) { await fsp.rm(path.join(destRoot, job.rendered, file.rel), { force: true }).catch(() => {}) }
    addLog('info', `异常文件已标记重拷：${rel}`)
    if (!jobs.some((j) => j.status === 'running')) runJob(job).catch((e) => addLog('error', `任务异常中断：${e.message}`))
  } else if (action === 'reverify') {
    if (job.verifyMode === 'NONE') return res.status(400).json({ error: '该任务拷贝时未启用校验，没有基准哈希，无法复检' })
    if (job.status === 'running' || job.status === 'paused') return res.status(400).json({ error: '任务进行中，不能复检' })
    if (job.reverify?.running) return res.status(400).json({ error: '复检已在进行' })
    reverifyJob(job).catch((e) => addLog('error', `复检异常中断：${e.message}`))
  } else return res.status(400).json({ error: '未知操作' })

  // 任务操作后按队列总开关决定是否接续（暂停/取消不会绕过「开始拷贝」）
  startNextQueued()
  res.json({ ok: true })
})

app.get('/api/export/mhl', (req, res) => {
  const job = jobs.find((j) => j.id === req.query.jobId)
  if (!job) return res.status(404).send('任务不存在')
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${job.sourceLabel}.mhl"`)
  res.send(buildMHL(job))
})

app.get('/api/export/ledger', (_req, res) => {
  const head = `OffloadMaster DIT 拷贝台账\n导出时间：${new Date().toLocaleString('zh-CN')}\n${'='.repeat(64)}\n`
  const body = logs.slice().reverse().map((l) => `${l.time}  [${l.level.toUpperCase().padEnd(7)}] ${l.message}`).join('\n')
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="DIT-ledger-${new Date().toISOString().slice(0, 10)}.txt"`)
  res.send(head + body)
})

// 完成提醒声音（macOS 系统提示音，完成 = Glass，异常 = Basso；Windows 用系统通知音）
app.post('/api/sound', (req, res) => {
  const kind = req.body.kind === 'error' ? 'error' : 'done'
  if (IS_WIN) {
    const file = kind === 'error'
      ? 'C:\\Windows\\Media\\Windows Critical Stop.wav'
      : 'C:\\Windows\\Media\\Windows Notify System Generic.wav'
    execFile('powershell', ['-NoProfile', '-c', `(New-Object Media.SoundPlayer '${file}').PlaySync()`], () => {})
    return res.json({ ok: true })
  }
  const file = kind === 'error' ? '/System/Library/Sounds/Basso.aiff' : '/System/Library/Sounds/Glass.aiff'
  if (fs.existsSync(file)) execFile('afplay', [file], () => {})
  res.json({ ok: true })
})

// 在访达中打开文件夹（拷贝完成后一键查看归档结果）
app.post('/api/reveal', async (req, res) => {
  try {
    const p = String(req.body.path || '')
    if (!p) throw new Error('路径为空')
    const st = await fsp.stat(p)
    if (!st.isDirectory()) throw new Error('目标不是文件夹')
    if (IS_WIN) execFile('explorer', [p], () => {}) // explorer 打开目录时退出码非 0 属正常
    else execFile('open', [p], (err) => { if (err) addLog('error', `打开文件夹失败：${err.message}`) })
    res.json({ ok: true })
  } catch (err) { res.status(400).json({ error: `无法打开文件夹：${err.message}` }) }
})

// 安全格式化（仅限 /Volumes 下的外置卷，需输入卷名确认；系统卷一律拒绝）
app.post('/api/format', (req, res) => {
  if (IS_WIN) return res.status(400).json({ error: 'Windows 版暂不支持安全格式化，请使用系统自带的磁盘格式化功能' })
  const p = String(req.body.path || '')
  const confirm = String(req.body.confirm || '')
  const name = path.basename(p)
  if (!p.startsWith('/Volumes/') || p.split('/').filter(Boolean).length !== 2)
    return res.status(400).json({ error: '仅允许格式化 /Volumes 下的外置卷' })
  try {
    if (fs.realpathSync(p) === '/') return res.status(400).json({ error: '拒绝操作系统启动卷' })
  } catch (err) { return res.status(400).json({ error: err.message }) }
  if (confirm !== name) return res.status(400).json({ error: '确认名称不匹配' })
  addLog('warn', `开始安全格式化：${p}`)
  execFile('diskutil', ['eraseVolume', 'ExFAT', name, p], { timeout: 180000 }, (err, stdout, stderr) => {
    if (err) {
      addLog('error', `格式化失败：${stderr || err.message}`)
      return res.status(500).json({ error: stderr || err.message })
    }
    addLog('success', `格式化完成：${p}`)
    res.json({ ok: true, output: stdout })
  })
})

// 生产模式：托管前端构建产物
const distDir = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

export function startServer(port = PORT, host = HOST) {
  const server = app.listen(port, host, () => {
    console.log(`OffloadMaster server: http://${host}:${(server.address()).port}`)
  })
  return server
}

// 直接运行（npm start）时自动启动；被 Electron 引入时由主进程启动
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  startServer()
}
