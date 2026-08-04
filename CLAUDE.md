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

- `lottie-web` 5.12.2 (cdnjs) — Lottie 渲染
- `jszip` 3.10.1 (cdnjs) — ZIP 解压
- `heic2any` 0.0.4 (jsdelivr) — HEIC 转换
- `libpag` 4.2.81 (jsdelivr) — PAG 动画渲染
- `sql.js` 1.10.3 (jsdelivr) — SQLite 数据库读取
- `mux.js` 6.0.1 (jsdelivr) — 视频解封装（video 预览）
- `html5-qrcode` 2.3.8 (cdnjs) — 二维码扫码
- Google Fonts: Inter + JetBrains Mono

## Module Knowledge Base（模块资产知识库）

> 本知识库为「规范驱动」核心资产，供 AI 辅助开发时精准选组件/模块、复用示例、避免重复读代码考古。
> 结构遵循「概述索引类（说明何时用什么）+ 应用说明类（说明怎么用）」两类。所有信息以源码为准。

### L1 页面级（应用骨架与状态机）

**入口契约 `js/main.js`**（由 `<script type="module">` 引入，唯一入口）
- 导出全局可变状态 `state`：`{ currentMode, projectName, anim, isPlaying, isLooping, fileMap:Map, animGroups, progressRAF, modeState }`
- `modeState` 六模式（键与 `TAB_MODES` 一致）：`['lottie','image','video','audio','font','file']`，每模式 `{ fileMap:Map, hasContent, activeFile }`；其中 `lottie` 额外含 `animGroups`
- 模式切换：`switchMode(mode, direction)` → `saveCurrentState()`（保存当前 fileMap/animGroups）→ 切 `currentMode` → `restoreModeState(mode)`
- `restoreModeState(mode)`：从 `modeState[mode]` 恢复 UI，按 `hasContent` 决定重建文件树还是显示 drop-zone；有内容时调用对应 `show*Preview(activeFile)`。**Tab 切换不丢已加载内容依赖此**
- `hideAllPreviews()`：隐藏全部预览容器 + 清理 font 视图；各 `show*` 入口内部都会先调用它
- 其他导出：`dismissHistoryBar()`
- 内置副作用（模块加载即执行）：tab 按钮、drag/drop、paste（仅 image 模式）、各类 file input、controls、sidebar 拖拽调宽（140–450px）、移动端抽屉、触摸/触控板左右滑动切 Tab、PWA service worker 注册 + share-target、历史恢复条、天气/时钟

**状态机关键约定**
- 所有预览模块直接读写共享 `state.fileMap` 与 `state.modeState[currentMode]`，不持有私有文件集合
- 文件入口统一经 `file-handler.js` 的 `processEntries/processFiles` → `buildTree()` + `autoStart()`

### L2 模块级（各 preview / 支撑模块）

**`js/file-handler.js` — 文件摄入与文件树**
- 导出：`isHiddenFile / isImageFile / isVideoFile / isAudioFile / isFontFile`（按扩展名 `IMG/VIDEO/AUDIO/FONT_EXTS` 判定；`.ts` 仅在 video 模式下视为视频）、`getActiveDropZone / toggleMenu / closeMenu`
- 流程：`processEntries(entries)`（拖拽目录/文件，递归 `readEntry`）/ `processFiles(files)`（file input/`webkitRelativePath`）→ 单 `.zip` 走 `processZip`（JSZip 展开并过滤 `__MACOSX`/隐藏文件）→ `buildTree()` + `autoStart()`
- `buildTree()`：按 sidebar 搜索词 + `filter-pill(data-type=all|img|json|other)` 过滤，渲染树并 `findAnimGroups()`（找 `*/images` 同目录图片，组成 lottie 动画组）
- `autoStart()`：置 `modeState[currentMode]`，按当前模式选首个可播放文件并 `show*Preview`；有 `projectName` 时 `saveCurrentProjectToHistory(...)`
- `HIDDEN_FILES = ['.DS_Store','Thumbs.db','.gitkeep','__MACOSX']`；`isHiddenFile` 凡以 `.` 开头即返回 true

**`js/preview-lottie.js` — Lottie / 动画**
- 依赖 `window.lottie`（CDN lottie-web）
- 导出：`lottieABLoop`（A-B 循环状态），`playJson(jsonPath)`（含外部图片注入 `injectExternalImages`、诊断面板：图层数/表达式数/外部图片关联状态）、`updateProgress / togglePlay / stopAnim / toggleLoop / changeSpeed / seekAnim / setBg / stepFrame / updateLottieABUI`
- 渲染器固定 `svg`；`info-badge` 显示 frames/fps/时长

**`js/preview-image.js` — 图片 / 动图 / SVG / HEIC / PAG**
- 导出工具：`infoItem(label,value)`（信息面板行，Lottie 面板也复用）、`formatSize / gcd / formatAspectRatio`、`getDimensions(file,info)`、`reverseGeocode(lat,lng,id)`（OpenStreetMap 反查）
- 导出函数：`analyzeImage(file)`（按扩展名+魔数路由到 parsers，产出 `info`：format/dimensions/animated/frames/duration/EXIF/GPS 等）、`showImagePreview(filePath)`、`cleanupPAGView`（PAG 画布销毁）、`disableColorPicker / enableColorPicker`、`svgCodeText`（当前 SVG 源码，供 code view / JSX 复制）
- 特殊类型：`.pag`→`renderPAGPreview`（用 `window.libpag`，locateFile 指向 jsdelivr libpag@4.2.81）；`.heic/.heif`→`window.heic2any` 转 JPEG；`.svg`→`svgCodeView` 标签页（含 raw 复制 / JSX 转换 `svgToJsx`）
- 取色器（color picker，键 `P`）：offscreen canvas + magnifier，点击复制 hex
- 缩放查看器 `initZoom`：overlay + 网格（≥5x 显示 1px 网格）+ 取色

**`js/preview-video.js` — 视频**
- 导出：`showVideoPreview(filePath)`；内部用 `parseMP4Location(bytes)` 提取 GPS/拍摄时间（见 L4）

**`js/preview-audio.js` — 音频**
- 导出：`showAudioPreview(filePath)`、`showAudioPreviewFromUrl(url)`（顶部 URL 输入框直链加载）、`cleanupAudio()`

**`js/preview-font.js` — 字体**
- 导出：`showFontPreview(file)`、`cleanupFontPreview()`；用 `state.fileMap.get(fp)`

**`js/preview-file.js` — 文件（文本/JSON/hex/SQLite/PDF/EPUB）**
- 导出：`showFilePreview(filePath)`（按类型分流）、`showDocPreview(file,type)`（PDF/Office 类用 iframe/embed）、`showEpubPreview(file)`
- SQLite 走 `window.SQL`（CDN sql.js）；超长文件做分段/hex 视图

**`js/parsers.js` — 二进制格式解析（纯头部解析，无外部依赖）**
- 导出：`parseExifData(data,info)`（底层 TIFF/IFD，含 GPS 经纬度换算）、`parseEXIF(bytes,info)`（JPEG APP1 段）、`parseGIF / parseWebP / parsePNG / parsePAG / parsePAGAsync(buffer,info) / parseMP4Location / parseHEIF`
- `parsePAG` 为占位（仅标 animated=true）；真实尺寸/时长由异步 `parsePAGAsync` 用 libpag 计算
- `parseMP4Location` 支持 5 种 GPS/时间提取路径（udta/©xyz、meta/keys+ilst、udta/loci、XYZ_、暴力扫 ISO6709）

**`js/history-manager.js` — 项目历史（IndexedDB）**
- 库 `preview_tool_db` / store `projects`（keyPath `id`），LRU 上限 3
- 导出：`saveCurrentProjectToHistory(name,fileMap,mode,activeFile)`、`updateActiveFileInHistory(activeFile)`、`checkLastProjectHistory()`、`deleteProjectHistory(id)`、`restoreProjectFromHistory(id)`

**`js/qr-scanner.js` — 二维码扫码**
- 导出：`initQrScanner()`（模块加载时由 main.js 调用）

### L3 函数/组件级（复用入口速查）
- 信息面板统一写法：`infoItem('Label', value)`（preview-image 导出，Lottie 也用）
- 文件读取：统一从 `state.fileMap.get(filePath)` 取 `File`；大文件用 `file.arrayBuffer()` / `file.text()`
- 预览清理：`hideAllPreviews()`（切模式前）与各类 `cleanup*`（PAG/Audio/Font）必须配对调用，否则画布/音频泄漏

### L4 原子级（格式魔数与结构 — parsers.js 判定依据）
| 格式 | 判定（扩展名或魔数） | 解析函数 | 备注 |
|---|---|---|---|
| GIF | `47 49 46` (GIF) | `parseGIF` | 版本、尺寸、帧数、总时长、loopCount（0=∞） |
| PNG | `89 50 4E 47` (`‰PNG`) | `parsePNG` | 含 `acTL` 块→APNG（animated/frames/loopCount） |
| WebP | bytes[8..11]=`WEBP` | `parseWebP` | VP8X/VP8 /VP8L/ANIM/ANMF；EXIF 子块 |
| JPEG | `FF D8` | `parseEXIF` | APP1 Exif 段 |
| TIFF | `49 49 2A 00` 或 `4D 4D 00 2A` | `parseExifData` | 直接走 IFD |
| HEIC/HEIF/AVIF | 扩展名 | `parseHEIF` | 扫 `ispe` 取最大 w/h + 内嵌 TIFF Exif |
| PAG | 扩展名 `.pag` | `parsePAG`+`parsePAGAsync` | 异步经 libpag |
| MP4/MOV | 容器 | `parseMP4Location` | moov 内 GPS/创建时间 |

### L5 主题级（style.css 设计 token 与响应式）
- 主色变量：`--accent`（字体/链接）、`--pink`（视频）、`--amber`（音频/其他）、`--destructive`（错误/缺失）
- 响应式断点：`≤768px` 时 sidebar 变 off-canvas 抽屉（`.open` + backdrop），`≥769px` 固定侧栏可拖拽
- 信息面板 class：`.img-info-item` / `.label` / `.value`；标签页 `.tab-preview` / `.tab-code`

---

### 开发约定：新增「预览类型 / 解析格式」的标准步骤（规范驱动脚手架）

**新增一种预览模式（如新增 `model` 模式）**
1. `main.js`：在 `TAB_MODES` 数组加 `'model'`；在 `state.modeState` 加 `model:{ fileMap:new Map(), hasContent:false, activeFile:null }`；在 `restoreModeState`、`resetAll` 的 else-if 链各加 `model` 分支；在 `hideAllPreviews` 加对应 `drop-zone-model`/`preview-model` 的显隐
2. 新建 `js/preview-model.js`，导出 `async function showModelPreview(filePath)`，约定：先 `hideAllPreviews()` → 显示 `#preview-model` → `state.modeState[state.currentMode].activeFile = filePath` → 从 `state.fileMap.get(filePath)` 取文件 → 渲染 → 写 `#info-badge`/`#*-info-panel`
3. `file-handler.js`：加 `MODEL_EXTS` 与 `isModelFile(name)`；在 `buildTree` 的 `renderTreeNode` 点击分支加 `isModel` 调用 `showModelPreview`；在 `autoStart` 加该模式首个文件选取
4. `index.html`：加 tab 按钮、对应 `drop-zone-model`/`preview-model` 容器、file input（遵循 `<mode>-folder|zip|file` + `2` 后缀命名）
5. 若需 IndexedDB 历史恢复，`history-manager.js` 的 `restoreProjectFromHistory` 加 `showModelPreview` 分支

**新增一种二进制解析格式**
- 在 `parsers.js` 加 `parseXxx(bytes, info)`，把结果写入统一的 `info` 字段（format/dimensions/animated/frames/duration/gps/...）
- 在 `preview-image.js` 的 `analyzeImage` 路由表（按扩展名+魔数）加分支；若需 GPS 反查，确保写 `info.gps={lat,lng}`
- 魔数探测务必放在 `analyzeImage` 的「扩展名或魔数」双判定中，兼容无扩展名文件

### 外部依赖（CDN，版本须 pin 死，禁止随版本浮动）
- `lottie-web` 5.12.2 (cdnjs) — Lottie 渲染
- `jszip` 3.10.1 (cdnjs) — ZIP 解压
- `heic2any` 0.0.4 (jsdelivr) — HEIC 转换
- `libpag` 4.2.81 (jsdelivr，代码内 locateFile 指向 `cdn.jsdelivr.net/npm/libpag@4.2.81/lib/`) — PAG 渲染
- `sql.js` 1.10.3 (jsdelivr) — SQLite 读取
- `mux.js` 6.0.1 (jsdelivr) — 视频解封装
- `html5-qrcode` 2.3.8 (cdnjs) — 二维码扫码
- Google Fonts: Inter + JetBrains Mono
- 地理反查：OpenStreetMap Nominatim / geocode.maps.co；天气：Open-Meteo（均无需 key）
- **版本锁由 pre-commit 钩子强制校验**：`.githooks/pre-commit` → `scripts/validate.mjs` 扫描 `index.html`/`js/*.js`，禁止 `@latest/@beta/@next` 等浮动版本与未锁定版本，对与基线（`scripts/validate.mjs` 内 `ALLOWED`）不一致者告警。绕过：`SKIP_PRECOMMIT=1 git commit`。

## Constraints

- 无构建工具、无包管理器、无 TypeScript — 纯 vanilla HTML/CSS/JS（ES Module）
- 所有状态存于内存，页面刷新即丢失
- 隐藏文件过滤：`.DS_Store`、`Thumbs.db`、`__MACOSX`、`.gitkeep`
- 图片解析基于二进制头部解析，部分格式为占位值（如旧版 PAG）
- commit 信息使用中文
