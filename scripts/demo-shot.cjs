// 演示场景截图：造一张假的 ARRI 素材卡，真实走一遍拷贝+校验流程，截取各阶段界面
// 用法：node_modules/.bin/electron scripts/demo-shot.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const DEMO = path.join(ROOT, '.demo-data')
const CARD = path.join(DEMO, 'card-A001')
const DEST = path.join(DEMO, 'backup-disk')
const OUT = path.join(ROOT, 'docs', 'screenshots')

// 隔离：日志/台账写到临时 HOME，不污染真实用户数据
process.env.HOME = path.join(DEMO, 'fake-home')
fs.mkdirSync(process.env.HOME, { recursive: true })

const API = 'http://127.0.0.1:8317'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(p, body) {
  const res = await fetch(API + p, body !== undefined
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined)
  return res.json()
}

async function state() { return (await fetch(API + '/api/state')).json() }

async function clickSidebar(win, text) {
  await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('${text}'))?.click(); 'ok'`
  )
}

async function shot(win, name) {
  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, name), img.toPNG())
  console.log('saved:', name)
}

async function main() {
  // ---- 造一张假素材卡（ARRI 结构，10GB 零填充文件，瞬间生成） ----
  const clipDir = path.join(CARD, 'ARRI', 'A001')
  fs.mkdirSync(clipDir, { recursive: true })
  fs.mkdirSync(DEST, { recursive: true })
  for (let i = 1; i <= 4; i++) {
    execSync(`mkfile -n 2500m "${path.join(clipDir, `A001C00${i}_260805_R7K2.mov`)}"`)
  }
  fs.writeFileSync(path.join(clipDir, 'A001_001.xml'), '<clipmeta/>')

  const { startServer } = await import('../server/index.js')
  const server = startServer(8317, '127.0.0.1')
  await sleep(800)

  // ---- 建任务并开跑 ----
  await api('/api/scan', { path: CARD })
  const r = await api('/api/jobs', {
    sourcePath: CARD,
    sourceLabel: 'A001 卡 · ARRI',
    destPaths: [DEST],
    verifyMode: 'MD5',
    template: '{项目}-{日期}-{摄影机}',
    project: '入场券',
    nameVars: { date: '2026-08-05', camera: 'ARRI' },
    report: true,
    theme: 'dark',
  })
  console.log('jobs:', JSON.stringify(r))
  await api('/api/queue/start', {})

  await app.whenReady()
  const win = new BrowserWindow({ width: 1480, height: 920, show: false, backgroundColor: '#09090b' })
  await win.loadURL(API)
  await win.webContents.executeJavaScript(`localStorage.setItem('offloadmaster:theme','dark'); 'ok'`)
  await sleep(1500)

  // 等拷贝跑到一半，截主界面（队列进行中）
  for (let i = 0; i < 200; i++) {
    const s = await state()
    const j = s.jobs[0]
    if (j && j.status === 'running' && j.copiedBytes / j.totalBytes > 0.3) break
    await sleep(100)
  }
  await win.webContents.executeJavaScript(`location.reload(); 'ok'`)
  await sleep(1200)
  await shot(win, 'main-dark.png')

  // 等全部完成（拷贝+哈希）
  for (let i = 0; i < 600; i++) {
    const s = await state()
    if (s.jobs[0] && (s.jobs[0].status === 'done' || s.jobs[0].status === 'error')) break
    await sleep(200)
  }
  await sleep(500)
  await shot(win, 'main-done-dark.png')

  await clickSidebar(win, '校验中心')
  await sleep(1000)
  await shot(win, 'verify-dark.png')

  await clickSidebar(win, '日志台账')
  await sleep(1000)
  await shot(win, 'log-dark.png')

  // 浅色主题主界面
  await clickSidebar(win, '素材拷贝')
  await win.webContents.executeJavaScript(`localStorage.setItem('offloadmaster:theme','light'); location.reload(); 'ok'`)
  await sleep(1500)
  await shot(win, 'main-light.png')

  server.close()
  app.quit()
}

app.whenReady().then(main).catch((e) => { console.error(e); app.exit(1) })
