# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

一个纯客户端的多媒体预览工具，支持 Lottie 动画、图片（含动图解析）、视频、文件（文本/JSON/二进制/SQLite/PDF）预览。无需构建步骤或服务端。

## How to run

```bash
open index.html        # 直接浏览器打开
python3 -m http.server 8080  # 本地起服务（ES Module 需要 HTTP）
```

无需安装依赖，所有外部库通过 CDN 加载。

## Architecture

### 文件结构

```
index.html              # HTML 结构
style.css               # 全部样式（含移动端响应式 @media）
js/
  main.js               # 入口：全局状态、模式切换、事件绑定、sidebar
  file-handler.js       # 拖拽/文件输入、ZIP 解压、文件树构建、自动播放
  preview-lottie.js     # Lottie 动画预览
  preview-image.js      # 图片预览（含格式解析、信息面板、缩放）
  preview-video.js      # 视频预览
  preview-file.js       # 文件预览（文本/JSON/二进制 hex/SQLite/PDF/EPUB）
  parsers.js            # 二进制格式解析器（GIF/WebP/PNG/APNG/PAG/HEIF/EXIF/TIFF）
```

### 模块化 ES Module

使用原生 `import/export`，`main.js` 为入口（`<script type="module">`），各模块通过 `state` 对象共享全局状态。

### 四模式状态机

应用在 `lottie`、`image`、`video`、`file` 四种模式间切换，每个模式有独立的 `modeState`：

```js
modeState = {
  lottie: { fileMap, animGroups, hasContent, activeFile },
  image:  { fileMap, hasContent, activeFile },
  video:  { fileMap, hasContent, activeFile },
  file:   { fileMap, hasContent, activeFile }
}
```

`switchMode()` 保存当前状态再切换，`restoreModeState()` 从目标模式的保存状态恢复 UI。Tab 切换不丢失已加载内容。

### 文件加载流程

1. Drop / file input → `processEntries()` 或 `processFiles()`
2. ZIP 文件通过 JSZip 展开为 `fileMap`（path → File）
3. `buildTree()` 渲染侧栏文件树
4. `autoStart()` 选择首个可播放项开始预览

### 响应式布局

- 桌面端：左侧固定 sidebar（可拖拽调宽 140-450px）
- 移动端（≤768px）：sidebar 变为 off-canvas 抽屉，通过汉堡菜单按钮触发，backdrop 遮罩点击关闭

### 外部依赖（CDN）

- `lottie-web` 5.12.2 — Lottie 渲染
- `jszip` 3.10.1 — ZIP 解压
- `heic2any` 0.0.4 — HEIC 转换
- `libpag` 4.2.81 — PAG 动画渲染
- `sql.js` 1.10.3 — SQLite 数据库读取
- Google Fonts: Inter + JetBrains Mono

## Constraints

- 无构建工具、无包管理器、无 TypeScript — 纯 vanilla HTML/CSS/JS（ES Module）
- 所有状态存于内存，页面刷新即丢失
- 隐藏文件过滤：`.DS_Store`、`Thumbs.db`、`__MACOSX`、`.gitkeep`
- 图片解析基于二进制头部解析，部分格式为占位值（如旧版 PAG）
- commit 信息使用中文
