---
description: "按规范驱动脚手架，为 preview-tool 新增一种预览模式（一类新的文件/媒体类型预览）"
argument-hint: "[mode-name] [ext1] [ext2] ..."
allowed-tools: Read, Edit, Write, Grep, Bash(node --check:*)
---

# 新增预览模式 (add-preview-mode)

为当前 preview-tool 项目新增一种预览类型。严格遵循 `CLAUDE.md` 中「开发约定：新增预览类型的标准步骤」，保证与现有六模式（lottie/image/video/audio/font/file）架构一致，避免破坏状态机与文件树。

参考知识库与模板：

@CLAUDE.md

以 `js/preview-audio.js`（最简模式，无复杂解析）与 `js/preview-video.js` 作为新模块的模板参考。

## 记法约定

- `$1` = 第 1 步入参的模式名（小写，如 `model`）。
- `$Upper1` = `$1` 首字母大写形式（如 `model` → `Model`，故 `show$Upper1Preview` = `showModelPreview`）。所有函数/变量命名均沿用此规则。

## 入参

- `$1` = 新模式名（小写英文，如 `model` / `pdf` / `archive`）。将作为：
  - `TAB_MODES` 数组元素
  - `state.modeState` 的键
  - 新模块 `js/preview-$1.js` 的文件名
  - `index.html` 中 `drop-zone-$1` / `preview-$1` / `<$1>-folder|zip|file`(+`2` 后缀) 容器与 file input 的命名前缀
- `$2`、`$3`… = 该模式识别的扩展名（含点，如 `.glb` `.gltf`）。若未提供，先向用户确认再继续。

## 标准五步流程（必须全部完成）

### 第 1 步 · 主状态机 (`js/main.js`)
1. 在 `TAB_MODES`（`['lottie','image','video','audio','font','file']`）数组中追加 `'$1'`。
2. 在 `state.modeState` 对象中追加：`$1: { fileMap: new Map(), hasContent: false, activeFile: null }`。
3. 在 `restoreModeState(mode)` 的 else-if 链，仿照现有分支追加（注意 `font` 用 `fileMap.get`，其余用 `filePath`）：
   ```js
   else if (mode === '$1' && s.activeFile) show$Upper1Preview(state.fileMap.get(s.activeFile));
   ```
4. 在 `resetAll()` 的末尾 else-if 链追加 `else if (state.currentMode === '$1') document.getElementById('drop-zone-$1').classList.remove('hidden');`
5. 在 `hideAllPreviews()` 中追加对应容器显隐：
   ```js
   document.getElementById('drop-zone-$1').classList.add('hidden');
   document.getElementById('preview-$1').classList.add('hidden');
   ```

### 第 2 步 · 新建预览模块 (`js/preview-$1.js`)
- 顶部 `import { state, hideAllPreviews } from './main.js';`（如需要解析再 import 相关依赖）。
- 导出 `export async function show$Upper1Preview(filePath)`（首字母大写，如 `showModelPreview`），结构遵循：
  1. `state.modeState[state.currentMode].activeFile = filePath;`
  2. `document.querySelectorAll('.tree-item').forEach(el => el.classList.toggle('active', el.title === filePath));`
  3. `var file = state.fileMap.get(filePath); if (!file) return;`
  4. `hideAllPreviews();` → 显示 `#preview-$1` → 渲染内容 → 写 `#info-badge`（参考 `infoBadge.textContent`）或 `#$1-info-panel`（用 `infoItem('Label', value)`，该函数由 `preview-image.js` 导出，如需复用先 `import { infoItem } from './preview-image.js';`）。
- 若模块持有 canvas / 音频 / WebGL 等需要释放的资源，额外导出 `cleanup$Upper1Preview()`，并在 `hideAllPreviews()` 与 `resetAll()` 中调用它（仿照 `cleanupPAGView` / `cleanupAudio`）。
- 如需 SQLite 等外部库，必须在 `index.html` 用 CDN 引入并 **pin 死版本**（见 `CLAUDE.md` 外部依赖表），不得浮动。

### 第 3 步 · 文件识别与树点击 (`js/file-handler.js`)
1. 顶部 `EXTS` 区追加：`var $UPPER1_EXTS = [<入参扩展名数组>];`
2. 追加判定函数：`export function is$Upper1File(name) { var lower = name.toLowerCase(); return $UPPER1_EXTS.some(function(ext){ return lower.endsWith(ext); }); }`
3. 在 `buildTree()` 内的 `renderTreeNode` 点击分支追加（仿照 `isFont` 分支）：
   ```js
   else if (!isDir && is$Upper1) div.addEventListener('click', (function(fp){ return function(){ show$Upper1Preview(state.fileMap.get(fp)); updateActiveFileInHistory(fp); }; })(fullPath));
   ```
   并在 `is$Upper1` 变量定义处补充（位于 `renderTreeNode` 开头，`isFont` 之后）。
4. 在 `autoStart()` 中按当前模式追加首个文件选取：
   ```js
   else if (currentMode === '$1') { var first$Upper1 = Array.from(fileMap.keys()).find(function(p){ return is$Upper1File(p); }); if (first$Upper1) { show$Upper1Preview(fileMap.get(first$Upper1)); activeFile = first$Upper1; } }
   ```
5. 在文件顶部 import 区 `import { show$Upper1Preview } from './preview-$1.js';`

### 第 4 步 · HTML 结构 (`index.html`)
1. 在 tab 栏（`TAB_MODES` 对应的 `.tab-btn` 列表）追加一个 `<button class="tab-btn">…</button>`（文案按模式语义，如「模型」）。
2. 在 `#canvas-area` 内追加 drop-zone 与 preview 容器（仿照 `drop-zone-audio` / `preview-audio` 的 DOM 结构）：
   ```html
   <div id="drop-zone-$1" class="drop-zone hidden">…浏览/拖拽入口…</div>
   <div id="preview-$1" class="preview hidden">…该模式渲染区 + 信息面板…</div>
   ```
3. 在对应模式的「浏览」菜单（`select-menu`）追加 file input，命名遵循 `<$1>-folder` / `<$1>-zip` / `<$1>-file` 及 `…2` 后缀（main.js 的 input 监听器数组需同步追加这些 id）。

### 第 5 步 · 历史恢复 (`js/history-manager.js`)
在 `restoreProjectFromHistory(id)` 的分支中追加 `else if (mode === '$1') show$Upper1Preview(state.fileMap.get(activeFile));`（与现有 audio/font 分支一致）。

## 完成后校验

1. 对新改动的 JS 文件执行 `node --check`：
   !`node --check js/main.js && node --check js/file-handler.js && node --check js/preview-$1.js && node --check js/history-manager.js`
   （如某文件语法错误立即修复后重跑）
2. 一致性自检清单：
   - [ ] `TAB_MODES`、`state.modeState`、`restoreModeState`、`resetAll`、`hideAllPreviews` 五处都已含新模式
   - [ ] `main.js` 的 file-input 监听器数组已追加 `<$1>-*` 系列 id
   - [ ] `file-handler.js` 的 `is$Upper1File` + `buildTree` 点击分支 + `autoStart` 分支三处齐全
   - [ ] `index.html` 的 tab 按钮 / drop-zone / preview / file-input 命名前缀全部为 `$1`
   - [ ] 若有 `cleanup*`，已在 `hideAllPreviews` 与 `resetAll` 调用
   - [ ] 未引入未 pin 版本的 CDN 依赖
3. 向用户输出本次改动的文件清单与新增模式名，并提示可 `open index.html` 或 `python3 -m http.server 8080` 实测。

## 注意

- 本项目为纯 vanilla ES Module，**无构建、无 TS、无 npm**，不要引入打包/类型/框架依赖。
- 所有状态存内存，刷新即丢，不要尝试持久化到 localStorage 之外的地方（历史项目持久化走 `history-manager.js` 的 IndexedDB）。
- 若新模式需要二进制格式解析（如新图片/视频容器），应改走 `parsers.js` + `preview-image.js` 的 `analyzeImage` 路由，而非新建独立解析，参见 `CLAUDE.md` 的「新增二进制解析格式」约定。
