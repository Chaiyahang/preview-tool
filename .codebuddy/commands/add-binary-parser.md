---
description: "按规范驱动脚手架，为 preview-tool 新增一种二进制格式解析（图片/动图类元数据解析，接入 analyzeImage 路由）"
argument-hint: "[format-name] [ext] [magic-desc]"
allowed-tools: Read, Edit, Write, Grep, Bash(node --check:*)
---

# 新增二进制解析格式 (add-binary-parser)

为当前 preview-tool 新增一种二进制格式解析。严格遵循 `CLAUDE.md` 中「开发约定：新增二进制解析格式」与 L4 原子级魔数表，复用 `parsers.js` 的 `parseXxx(bytes, info)` 约定与 `preview-image.js` 的 `analyzeImage` 路由，避免破坏统一 `info` 结构与信息面板。

参考模板与知识库：

@CLAUDE.md

以 `js/parsers.js` 与 `js/preview-image.js`（`analyzeImage` / `showImagePreview`）为模板参考。

## 记法约定

- `$1` = 格式名（大写缩写，如 `BMP` / `ASTC` / `KTY`）。
- `$2` = 识别扩展名（含点，如 `.bmp`）；可多个，用空格分隔。
- `$3…` = 魔数描述（可选，如 `bytes[0]==0x42 && bytes[1]==0x4D` 表示 `BM`）。

## 统一 info 契约（解析器必须写入的字段）

解析器通过**修改传入的 `info` 对象**上报结果（`analyzeImage` 中预建，键见下）。只写你能确定的字段，其余保持默认即可；`analyzeImage` 会自动用 width/height 补 `aspectRatio` 与 `megapixels`，`showImagePreview` 按字段条件渲染面板。

| 字段 | 类型/含义 | 触发面板行 |
|---|---|---|
| `format` | 字符串，格式名（通常由 `analyzeImage` 路由分支赋值，解析器也可补） | Format |
| `width` / `height` | 像素；为 0 时 `analyzeImage` 回退 `getDimensions(file)` | Dimensions |
| `animated` | bool | Animated |
| `frames` | 帧数（动图） | Frames |
| `duration` | 秒（动图总时长） | Duration / FPS(=frames/duration) |
| `loopCount` | 循环次数，`0` 表示 ∞，`-1` 表示无/未知 | Loop Count |
| `hasAlpha` | bool | Alpha |
| `colorType` | 字符串（如 `RGBA`） | Color Type |
| `bitDepth` | 数值 | Bit Depth |
| `compression` | 字符串（如 `Lossy`） | Compression |
| `gifVersion` | 字符串 | GIF Version |
| `gps` | `{ lat, lng }`（**必须 N/S、E/W 已转正负**，见下） | Location（自动触发 reverseGeocode 反查） |
| `camera` / `dateTime` / `focalLength` / `focalLength35` / `fNumber` / `exposureTime` / `iso` | EXIF 类 | 相机/拍摄时间/焦距/光圈/快门/ISO |

> ⚠️ GPS 必须经纬度已带符号：`latRef==='S' → lat=-lat`，`lngRef==='W' → lng=-lng`（参照 `parseExifData` 实现）。否则地图定位会翻到错误半球。

## 标准三步流程

### 第 1 步 · 解析函数 (`js/parsers.js`)
1. 在文件末尾（或同类解析附近）导出 `parse$1(bytes, info)`。模板：
   ```js
   export function parse$1(bytes, info) {
     if (bytes.length < 16) return;                 // 长度守卫
     if (!(/* $3 魔数条件 */)) return;               // 魔数不符立即返回，避免误写 info
     // 解析并写入 info.*
     info.width  = ...;
     info.height = ...;
     // 若内嵌 EXIF/TIFF，直接复用：
     // parseExifData(bytes.slice(off, off+len), info);  // 会自动填 gps/camera/dateTime
   }
   ```
2. 若需异步外部库（如 libpag 渲染 PAG）：保持同步占位 `parse$1(bytes, info) { info.animated = true; }` 不变，另写 `export async function parse$1Async(buffer, info)` 用 CDN 库填充真实尺寸/时长（参照 `parsePAG` / `parsePAGAsync`）；并在 `analyzeImage` 中 `await` 后检查重入。
3. 如格式内嵌标准 EXIF/TIFF（如 HEIF），优先 `import` 复用 `parseExifData`（已导出），不要重写 IFD 解析。

### 第 2 步 · 接入分析路由 (`js/preview-image.js`)
1. 在 `import { parseExifData, parseEXIF, parseGIF, parseWebP, parsePNG, parsePAG, parsePAGAsync, parseHEIF } from './parsers.js';` 行追加 `parse$1`。
2. 在 `analyzeImage` 的 `if/else if` 路由链中追加分支，**必须「扩展名或魔数」双判定**以兼容无扩展名文件（仿照 WebP：`name.endsWith('.webp') || (bytes[8..11]==='WEBP')`）：
   ```js
   else if (name.endsWith('$2') || (/* $3 魔数条件 */)) { info.format = '$1'; parse$1(bytes, info); }
   ```
   放在既有分支之后、`if (info.width === 0) await getDimensions(file, info);` 之前。
3. **异步解析器特例**：若第 1 步用了 `parse$1Async`，改为
   ```js
   else if (name.endsWith('$2') || (/* 魔数 */)) { info.format = '$1'; parse$1(bytes, info); if (previewCallId === callId) await parse$1Async(buffer, info); }
   ```
   （`previewCallId` 重入守卫已在 `analyzeImage` 顶部定义，await 后必须再校验，参照 PAG 分支）。

### 第 3 步 · 文件归类（仅当该格式属于「图片/动图」类）
若新格式应归入图片模式（如新位图/动图），在 `js/file-handler.js` 的 `IMG_EXTS` 数组追加 `$2`，使其进入 `isImageFile` → 图片模式文件树与 `autoStart` 选取。纯容器/视频类元数据（如 MP4 位置解析）**不**加此步，见下方「容器类旁路」。

## 容器类旁路（视频/容器元数据，如 GPS/拍摄时间）

若格式是视频容器而非图片（如新增 MKV/FLV 的位置解析），**不要**走 `analyzeImage`，而仿照 `parseMP4Location`：
- 在 `parsers.js` 导出 `parseXxxLocation(bytes)`，**返回 `{ gps, creationDate }` 结果对象**（不写 info）。
- 在 `js/preview-video.js` 的 `showVideoPreview` 中调用并消费该结果（写 `info-badge` / 面板），与 `parseMP4Location` 现有用法一致。

## 特殊渲染（可选）

若新格式不能走通用 `<img>` 渲染（如 PAG 需 canvas、HEIC 需 `heic2any` 转码、SVG 需源码视图），在 `showImagePreview` 的「按扩展名分支」区（`lower.endsWith('.pag')` / `.heic` / `.svg` 处）追加专属渲染分支，并对应清理函数（如 `cleanupPAGView`）在 `hideAllPreviews` / `resetAll` 中调用。纯元数据解析器（GIF/PNG/WebP 类）**不需要**此步。

## 完成后校验

1. 语法检查：
   !`node --check js/parsers.js && node --check js/preview-image.js && node --check js/file-handler.js`
2. 一致性自检清单：
   - [ ] `parsers.js` 导出 `parse$1`，且魔数/长度守卫完备（不符时 `return` 不误写）
   - [ ] `preview-image.js` 的 import 列表含 `parse$1`
   - [ ] `analyzeImage` 路由为「扩展名或魔数」双判定，且位于 `getDimensions` 回退之前
   - [ ] 异步分支 `await` 后已用 `previewCallId === callId` 重入守卫
   - [ ] 若写 `info.gps`，已带 N/S、E/W 符号
   - [ ] 图片类格式已在 `file-handler.js` 的 `IMG_EXTS` 注册；容器类未误注册
   - [ ] 未引入未 pin 版本的 CDN 依赖
3. 向用户输出改动文件清单、解析出的字段，并提示可 `open index.html` 或 `python3 -m http.server 8080` 用真实样本实测。

## 注意

- 纯 vanilla ES Module，**无构建、无 TS、无 npm**；解析器为同步纯函数（除非确需外部库）。
- 解析基于二进制头部，部分老格式（如旧版 PAG）字段可为占位值——若无法精确获取某项，留默认即可，不要编造。
- 所有状态存内存，刷新即丢，不要试图持久化解析结果。
