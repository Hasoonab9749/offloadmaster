// 系统原生能力桥（仅 Electron 打包应用中可用）
declare global {
  interface Window {
    native?: {
      pickFolder: (title?: string) => Promise<string | null>
    }
  }
}

/** 是否在桌面应用内运行 */
export const isNativeApp = typeof window !== 'undefined' && !!window.native

/**
 * 唤起系统原生访达文件夹选择框。
 * 返回选中的绝对路径；用户取消返回 null；非桌面环境返回 undefined（调用方走网页选择器后备）。
 */
export async function pickNativeFolder(title: string): Promise<string | null | undefined> {
  if (!window.native) return undefined
  return window.native.pickFolder(title)
}
