#!/bin/bash
# 双击启动：在本机开一个静态服务器并打开浏览器（实景照片需要通过 http 访问才能做天空抠图）
cd "$(dirname "$0")"
PORT=8799
(sleep 1; open "http://localhost:$PORT") &
exec python3 -m http.server "$PORT" --bind 127.0.0.1
