// 界面截图工具：以固定窗口启动软件并截屏
// 用法：node_modules/.bin/electron scripts/screenshot.cjs <输出.png> [主题:dark|light] [等待毫秒]
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const out = path.resolve(process.argv[2] || 'shot.png')
const theme = process.argv[3] || 'dark'
const waitMs = Number(process.argv[4] || 3000)

async function main() {
  const { startServer } = await import('../server/index.js')
  const server = startServer(8317, '127.0.0.1')
  await app.whenReady()

  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    show: false,
    backgroundColor: theme === 'light' ? '#ffffff' : '#09090b',
  })
  await win.loadURL('http://127.0.0.1:8317')

  // 设置主题（软件用 localStorage offloadmaster:theme 持久化）
  await win.webContents.executeJavaScript(
    `localStorage.setItem('offloadmaster:theme', '${theme}'); location.reload(); 'ok'`
  )
  await new Promise((r) => setTimeout(r, 1200))
  await new Promise((r) => setTimeout(r, waitMs))

  const img = await win.webContents.capturePage()
  fs.writeFileSync(out, img.toPNG())
  console.log('saved:', out)
  server.close()
  app.quit()
}

app.whenReady().then(main)
