# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A single-file preview tool (`index.html`) for Lottie animations and static/animated images. Runs entirely client-side with no build step or server required.

## How to run

```bash
open index.html        # opens directly in browser
python3 -m http.server 8080  # or serve locally if CORS issues arise
```

No dependencies to install — CDN-loaded libraries (lottie-web, JSZip) and Google Fonts are fetched at runtime.

## Architecture

Everything lives in `index.html` — HTML structure, inline CSS (`<style>`), and inline JS (`<script>`).

**Dual-mode state machine:** The app switches between two modes — `lottie` and `image`. Each mode has independent state stored in `modeState`:

```js
modeState = {
  lottie: { fileMap, animGroups, hasContent, activeFile },
  image:  { fileMap, hasContent, activeFile }
}
```

`switchMode()` saves the current mode's state before switching, and `restoreModeState()` rebuilds the UI from the target mode's saved state. This means switching tabs preserves everything — loaded files, active preview, tree selection.

**File ingestion flow (unified):**
1. Drop / file input → `processEntries()` or `processFiles()`
2. ZIP files are expanded via JSZip into `fileMap` (path → File object)
3. `buildTree()` renders the sidebar explorer from `fileMap`
4. `autoStart()` picks the first playable item and starts preview

**Lottie path:**
- `playJson(jsonPath)` — parses JSON, injects external images via `injectExternalImages()` from the same directory's `images/` folder, creates `lottie.loadAnimation()` instance
- `animGroups` tracks each JSON + its associated images directory for `findAnimGroups()`

**Image path:**
- `showImagePreview(filePath)` — creates an object URL, runs `analyzeImage()` which does binary header parsing (GIF/WebP/PNG/APNG/PAG) to extract format, dimensions, frame count, duration, FPS
- Displays info in a panel below the image

**Key global state:**
- `fileMap` — `Map<path, File>` — the canonical file store for the active mode
- `anim` — current `lottie.loadAnimation()` instance (or null)
- `animGroups` — `[{ jsonPath, images: Map<name, File> }]` — JSON files paired with their image dependencies
- `currentMode` — `'lottie'` or `'image'`
- `modeState` — persisted state per mode (see above)

**DOM conventions:**
- Elements referenced by ID stored as global vars (e.g. `lottiePlayer`, `progressFill`, `imgInfoPanel`)
- Event handlers are inline `onclick` attributes in HTML
- The sidebar resizer uses `mousedown/mousemove/mouseup` listeners (clamped to 140-450px)

**External dependencies (CDN):**
- `lottie-web` 5.12.2 — Lottie animation rendering
- `jszip` 3.10.1 — ZIP file extraction
- Google Fonts: Inter + JetBrains Mono

## Constraints

- No build tooling, no package manager, no TypeScript — pure vanilla HTML/CSS/JS
- All state is in-memory; no persistence across page reloads
- The hidden file filter (`HIDDEN_FILES`) skips `.DS_Store`, `Thumbs.db`, `__MACOSX`
- Image analysis relies on binary header parsing and does not support all edge cases (e.g., PAG gets placeholder values)
