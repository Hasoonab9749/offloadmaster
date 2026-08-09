# OffloadMaster · 影视 DIT 拷卡软件

> 片场素材的「入场券」—— 一张存储卡到素材盘之间，最稳的那一段路。

**OffloadMaster 是一款面向影视现场的 DIT（数字影像工程师）拷卡软件**，专注于把摄影机存储卡里的素材安全、可验证地拷入素材盘，并留下完整的校验记录。对标 Silverstack、YoYotta、KOCARD 等专业工具的核心拷卡流程，免费、开源、跨平台。

## 下载

| 平台 | 安装包 | 说明 |
| --- | --- | --- |
| macOS（M 芯片） | [OffloadMaster-2.5.0-arm64.dmg](https://github.com/rehedon/offloadmaster/releases/download/v2.5.0/OffloadMaster-2.5.0-arm64.dmg) | 首次打开如被系统拦截，按安装窗口里的「安装说明」放行一次即可 |
| Windows 10 / 11（x64） | [OffloadMaster-2.5.0-win-x64.exe](https://github.com/rehedon/offloadmaster/releases/download/v2.5.0/OffloadMaster-2.5.0-win-x64.exe) | 双击安装，可自选安装位置 |

历史版本与更新说明见 [Releases](https://github.com/rehedon/offloadmaster/releases) 和 [CHANGELOG](CHANGELOG.md)。

## 功能

**拷贝**
- 源盘只读保护，拷贝全程不写入源卡
- 一源多盘同步拷贝（同一份素材同时拷到多块备份盘）
- 多卡队列、断点续传、目标盘剩余空间预判

**校验**
- 哈希校验（MD5 / SHA-256 可选），逐文件比对源与目标
- 自动去重（哈希台账登记，重复素材跳过）
- 异常文件单独标记，一键重拷
- 可生成随素材归档的 HTML 校验报告（KOCARD 式，可打印）

**整理**
- 自动识别 ARRI / RED / Sony / Canon / Blackmagic / DJI 等摄影机素材
- 模块化命名积木：片名、日期、机位等模块自由拼接，灰字提示示例
- 自定义文件夹命名归档，不写死任何预设

**记录**
- 全程操作日志
- 一键导出 MHL（Media Hash List）与文本台账，符合片场交接规范

**附加**
- 拷贝完成系统提示音提醒
- 安全格式化存储卡（macOS，仅限外置卷，需输入卷名确认）
- 浅色 / 深色主题切换

## 安装

**macOS**：打开 dmg，把 OffloadMaster 拖进「应用程序」。首次双击如提示「无法验证开发者」，到 系统设置 → 隐私与安全性 底部点「仍要打开」即可，放行一次永久有效。

**Windows**：双击 exe 安装。首次运行如 SmartScreen 提示，点「更多信息 → 仍要运行」。

## 技术栈

- 前端：React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- 本地服务：Node.js + Express（真实文件拷贝 / 哈希校验 / MHL 生成，仅监听 127.0.0.1）
- 桌面壳：Electron（electron-builder 打包 dmg / nsis）

## 本地开发

```bash
npm install        # 安装依赖
npm run dev        # 前端开发（另需 npm start 起本地服务）
npm start          # 单独启动本地拷贝服务（127.0.0.1:8310）

npm run build      # 构建前端
npm run dist       # 打包 macOS dmg
npm run dist:win   # 打包 Windows nsis 安装包
```

## 作者

独立开发的学生作品，为短片《入场券》的片场工作流而生。使用中遇到问题欢迎提 [Issue](https://github.com/rehedon/offloadmaster/issues)。
