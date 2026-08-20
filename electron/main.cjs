// OffloadMaster —— Electron 主进程
// 内嵌本地服务（真实文件拷贝/校验），窗口加载本机界面，提供系统原生文件夹选择框
const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')

let server = null
let mainWindow = null

async function startOnFreePort(preferred) {
  // Windows 下动态 import 必须是 file:// 网址形式，直接给 C:\ 路径会被当成协议报错
  const serverUrl = pathToFileURL(path.join(__dirname, '../server/index.js')).href
  const { startServer } = await import(serverUrl)
  for (let port = preferred; port < preferred + 20; port++) {
    try {
      const s = startServer(port, '127.0.0.1')
      await new Promise((resolve, reject) => {
        s.once('listening', resolve)
        s.once('error', reject)
      })
      return { server: s, port }
    } catch { /* 端口被占用，试下一个 */ }
  }
  throw new Error('没有可用端口')
}

// 原生系统文件夹选择框：macOS 默认打开外置卷目录，Windows 交给系统默认位置
ipcMain.handle('pick-folder', async (_event, title) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: title || '选择文件夹',
    defaultPath: process.platform === 'win32' ? undefined : '/Volumes',
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
    buttonLabel: '选择',
  })
  return result.canceled ? null : result.filePaths[0]
})

async function createWindow() {
  let started
  try {
    started = await startOnFreePort(8310)
  } catch (err) {
    // 服务起不来时不静默挂后台：明确弹窗告知原因并退出
    dialog.showErrorBox('OffloadMaster 启动失败',
      `本地服务未能启动：${err.message}\n\n请彻底退出软件后重试；反复出现请截图联系作者（GitHub: rehedon/offloadmaster）。`)
    app.quit()
    return
  }
  server = started.server

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1280,
    minHeight: 780,
    title: 'OffloadMaster · 影视 DIT 拷贝工作站',
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.loadURL(`http://127.0.0.1:${started.port}`)

  // 导出 MHL / 台账时弹出系统原生保存框
  mainWindow.webContents.session.on('will-download', (_event, item) => {
    const savePath = dialog.showSaveDialogSync(mainWindow, {
      title: '保存导出文件',
      defaultPath: item.getFilename(),
    })
    if (savePath) item.setSavePath(savePath)
    else item.cancel()
  })

  // 外部链接交给系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('http://127.0.0.1')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(createWindow).catch((err) => {
  // 兜底：任何未捕获的启动异常都不要留下「无窗口僵尸进程」
  dialog.showErrorBox('OffloadMaster 启动失败', String(err && err.message ? err.message : err))
  app.quit()
})

app.on('window-all-closed', () => {
  if (server) server.close()
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
