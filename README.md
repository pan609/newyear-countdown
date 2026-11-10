# 新年倒计时 · 世界烟花夜

纯静态网站，无构建步骤、无第三方依赖。

## 运行

双击 `start.command`，或在本目录执行 `python3 -m http.server 8799` 后打开 http://localhost:8799 。

直接双击 `index.html`（file://）也能用，但浏览器不允许读取本地图片像素，会自动退回手绘版场景。

## 结构

- `js/scenes.js` 城市与地标：实景照片的参数与天空抠图（`PHOTOS`、`computeMatte`），以及手绘版回退场景
- `js/fireworks.js` 烟花引擎：粒子、编排、建筑受光、水面倒影、泛光与硝烟
- `js/audio.js` 烟花音效与两首内置曲目（Web Audio 实时合成）
- `js/main.js` 倒计时状态机、播放列表（上传的音乐存在浏览器 IndexedDB）、界面交互
- `images/` 背景照片，来源与授权见 `CREDITS.md`

## 换一张背景照片

把图片放进 `images/`，在 `js/scenes.js` 的 `PHOTOS` 里改 `src`，再按图调整：
`base`（水面/地平线在图中的纵向比例）、`top`（地标顶端）、`focus`（横向重心）、`dim`（天空压暗程度）、`mounts`（从建筑上喷射焰火的点）。
抠图漏进暗色建筑时调小 `rt` / `tol`；地平线余晖被当成建筑时调大 `cap`。

## 快捷键

空格：齐射　←/→：换城市　M：播放/暂停音乐
