#!/bin/bash
# OffloadMaster 启动器 —— 双击即可启动本地服务并打开界面
cd "$(dirname "$0")"

if [ ! -d "dist" ]; then
  echo "首次运行，正在构建界面…"
  npm run build
fi

echo "正在启动 OffloadMaster…"
( sleep 2 && open "http://127.0.0.1:8310" ) &
npm start
