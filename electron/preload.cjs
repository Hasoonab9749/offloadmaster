// 预加载脚本 —— 把系统原生对话框安全地暴露给界面
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('native', {
  /** 唤起 macOS 原生访达文件夹选择框，返回选中的绝对路径；取消返回 null */
  pickFolder: (title) => ipcRenderer.invoke('pick-folder', title),
})
