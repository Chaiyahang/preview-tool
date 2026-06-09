// main.js — Entry point: state, mode switching, event binding, sidebar resizer
import { playJson, togglePlay, stopAnim, toggleLoop, changeSpeed, seekAnim, setBg, updateProgress } from './preview-lottie.js';
import { showImagePreview, formatSize, cleanupPAGView } from './preview-image.js';
import { showVideoPreview } from './preview-video.js';
import { showAudioPreview, cleanupAudio, showAudioPreviewFromUrl } from './preview-audio.js';
import { showFilePreview } from './preview-file.js';
import { showFontPreview, cleanupFontPreview } from './preview-font.js';
import { processEntries, processFiles, buildTree, getActiveDropZone, toggleMenu, closeMenu, isImageFile, isVideoFile, isAudioFile } from './file-handler.js';
import { checkLastProjectHistory, restoreProjectFromHistory, deleteProjectHistory } from './history-manager.js';

// Shared state — exported for other modules to import
export var state = {
  currentMode: 'lottie',
  projectName: '',
  anim: null,
  isPlaying: false,
  isLooping: true,
  fileMap: new Map(),
  animGroups: [],
  progressRAF: null,
  modeState: {
    lottie: { fileMap: new Map(), animGroups: [], hasContent: false, activeFile: null },
    image: { fileMap: new Map(), hasContent: false, activeFile: null },
    video: { fileMap: new Map(), hasContent: false, activeFile: null },
    audio: { fileMap: new Map(), hasContent: false, activeFile: null },
    font: { fileMap: new Map(), hasContent: false, activeFile: null },
    file: { fileMap: new Map(), hasContent: false, activeFile: null }
  }
};

export function hideAllPreviews() {
  document.getElementById('drop-zone-lottie').classList.add('hidden');
  document.getElementById('drop-zone-image').classList.add('hidden');
  document.getElementById('drop-zone-video').classList.add('hidden');
  document.getElementById('drop-zone-audio').classList.add('hidden');
  document.getElementById('drop-zone-font').classList.add('hidden');
  document.getElementById('drop-zone-file').classList.add('hidden');
  document.getElementById('preview-lottie').classList.add('hidden');
  document.getElementById('preview-image').classList.add('hidden');
  document.getElementById('preview-video').classList.add('hidden');
  document.getElementById('preview-audio').classList.add('hidden');
  document.getElementById('preview-font').classList.add('hidden');
  document.getElementById('preview-file').classList.add('hidden');
  document.getElementById('preview-doc').classList.add('hidden');
  cleanupFontPreview();
}

var TAB_MODES = ['lottie', 'image', 'video', 'audio', 'font', 'file'];

function saveCurrentState() {
  var s = state.modeState[state.currentMode];
  s.fileMap = new Map(state.fileMap);
  if (state.currentMode === 'lottie') s.animGroups = state.animGroups.slice();
}

function restoreModeState(mode) {
  var s = state.modeState[mode];
  state.fileMap = new Map(s.fileMap);
  if (mode === 'lottie') state.animGroups = s.animGroups.slice();
  hideAllPreviews();
  document.getElementById('controls').classList.add('hidden');
  document.getElementById('info-badge').style.display = 'none';
  if (s.hasContent) {
    buildTree();
    if (mode === 'lottie' && s.activeFile) playJson(s.activeFile);
    else if (mode === 'image' && s.activeFile) showImagePreview(s.activeFile);
    else if (mode === 'video' && s.activeFile) showVideoPreview(s.activeFile);
    else if (mode === 'audio' && s.activeFile) showAudioPreview(s.activeFile);
    else if (mode === 'font' && s.activeFile) showFontPreview(state.fileMap.get(s.activeFile));
    else if (mode === 'file' && s.activeFile) showFilePreview(s.activeFile);
  } else {
    document.getElementById('file-tree').innerHTML = '';
    if (mode === 'lottie') document.getElementById('drop-zone-lottie').classList.remove('hidden');
    else if (mode === 'image') document.getElementById('drop-zone-image').classList.remove('hidden');
    else if (mode === 'video') document.getElementById('drop-zone-video').classList.remove('hidden');
    else if (mode === 'audio') document.getElementById('drop-zone-audio').classList.remove('hidden');
    else if (mode === 'font') document.getElementById('drop-zone-font').classList.remove('hidden');
    else document.getElementById('drop-zone-file').classList.remove('hidden');
  }
}

function applyTransition(direction) {
  if (!direction) return;
  var activeContainer = document.querySelector('#canvas-area > div:not(.hidden)');
  if (activeContainer) {
    activeContainer.classList.remove('swipe-next-in', 'swipe-prev-in');
    void activeContainer.offsetWidth; // Force reflow
    if (direction === 'next') {
      activeContainer.classList.add('swipe-next-in');
    } else if (direction === 'prev') {
      activeContainer.classList.add('swipe-prev-in');
    }
  }
}

function switchMode(mode, direction) {
  var oldMode = state.currentMode;
  var oldIdx = TAB_MODES.indexOf(oldMode);
  var newIdx = TAB_MODES.indexOf(mode);

  if (!direction && oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
    direction = newIdx > oldIdx ? 'next' : 'prev';
  }

  saveCurrentState();
  state.currentMode = mode;
  document.querySelectorAll('.tab-btn').forEach(function(btn, i) {
    btn.classList.toggle('active', TAB_MODES[i] === mode);
  });

  // Scroll active tab into view on mobile
  var activeBtn = document.querySelectorAll('.tab-btn')[newIdx];
  if (activeBtn && activeBtn.scrollIntoView) {
    activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  restoreModeState(mode);

  if (direction) {
    applyTransition(direction);
  }
}

function resetAll() {
  var lottiePlayer = document.getElementById('lottie-player');
  var imgPreviewEl = document.getElementById('img-preview-el');
  var imgInfoPanel = document.getElementById('img-info-panel');
  var videoPlayer = document.getElementById('video-player');
  var videoInfoPanel = document.getElementById('video-info-panel');
  var fileContent = document.getElementById('file-content');
  var fileHex = document.getElementById('file-hex');
  var filePreviewHeader = document.getElementById('file-preview-header');
  var docIframe = document.getElementById('doc-iframe');
  var docEmbed = document.getElementById('doc-embed');
  var docInfoHeader = document.getElementById('doc-info-header');
  var infoBadge = document.getElementById('info-badge');
  var controls = document.getElementById('controls');
  var progressFill = document.getElementById('progress-fill');
  var progressTime = document.getElementById('progress-time');
  var fileTree = document.getElementById('file-tree');

  if (state.anim) { state.anim.destroy(); state.anim = null; } cancelAnimationFrame(state.progressRAF);
  cleanupPAGView();
  state.fileMap.clear(); state.animGroups = []; fileTree.innerHTML = ''; lottiePlayer.innerHTML = ''; lottiePlayer.style.background = '';
  imgPreviewEl.src = ''; imgInfoPanel.innerHTML = '';
  videoPlayer.src = ''; videoInfoPanel.innerHTML = '';
  cleanupAudio(); document.getElementById('audio-info-panel').innerHTML = '';
  fileContent.innerHTML = ''; fileHex.innerHTML = ''; fileHex.classList.add('hidden'); filePreviewHeader.innerHTML = '';
  docIframe.src = ''; docIframe.srcdoc = ''; docEmbed.data = ''; docInfoHeader.innerHTML = '';
  var oldPdfIframe = document.querySelector('.pdf-iframe'); if (oldPdfIframe) oldPdfIframe.remove();
  
  // Font cleanups
  var fontSpecimenInput = document.getElementById('font-specimen-input');
  var fontSpecimensContainer = document.getElementById('font-specimens-container');
  var fontPreviewHeader = document.getElementById('font-preview-header');
  if (fontSpecimenInput) fontSpecimenInput.value = 'The quick brown fox jumps over the lazy dog. 1234567890 汉字测试 零一二三四五六七八九十';
  if (fontSpecimensContainer) fontSpecimensContainer.innerHTML = '';
  if (fontPreviewHeader) fontPreviewHeader.innerHTML = '';

  state.modeState[state.currentMode] = { fileMap: new Map(), animGroups: [], hasContent: false, activeFile: null };
  hideAllPreviews();
  if (state.currentMode === 'lottie') document.getElementById('drop-zone-lottie').classList.remove('hidden');
  else if (state.currentMode === 'image') document.getElementById('drop-zone-image').classList.remove('hidden');
  else if (state.currentMode === 'video') document.getElementById('drop-zone-video').classList.remove('hidden');
  else if (state.currentMode === 'audio') document.getElementById('drop-zone-audio').classList.remove('hidden');
  else if (state.currentMode === 'font') document.getElementById('drop-zone-font').classList.remove('hidden');
  else document.getElementById('drop-zone-file').classList.remove('hidden');
  controls.classList.add('hidden'); infoBadge.style.display = 'none'; progressFill.style.width = '0%'; progressTime.textContent = '0 / 0';
}

// --- Event binding ---

// Tab buttons
document.querySelectorAll('.tab-btn').forEach(function(btn, i) {
  btn.addEventListener('click', function() { switchMode(TAB_MODES[i]); });
});

// Reset button
document.querySelector('.btn-reset').addEventListener('click', resetAll);

// Drag and drop
document.body.addEventListener('dragover', function(e) { e.preventDefault(); e.stopPropagation(); getActiveDropZone().classList.add('dragging'); });
document.body.addEventListener('dragleave', function(e) { if (!e.relatedTarget || !document.body.contains(e.relatedTarget)) getActiveDropZone().classList.remove('dragging'); });
document.body.addEventListener('drop', async function(e) {
  e.preventDefault(); e.stopPropagation();
  getActiveDropZone().classList.remove('dragging');
  try {
    var items = e.dataTransfer.items;
    if (items && items.length > 0) {
      var entries = [];
      for (var i = 0; i < items.length; i++) {
        var entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : (items[i].getAsEntry ? items[i].getAsEntry() : null);
        if (entry) entries.push(entry);
      }
      if (entries.length > 0) { await processEntries(entries); return; }
    }
    if (e.dataTransfer.files.length > 0) await processFiles(e.dataTransfer.files);
  } catch(err) { console.error('Drop error:', err); }
});

// Clipboard paste — image mode: paste images directly
document.addEventListener('paste', async function(e) {
  if (state.currentMode !== 'image') return;
  var items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  var files = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') === 0) {
      var blob = items[i].getAsFile();
      if (blob) {
        var ext = blob.type.split('/')[1] || 'png';
        var file = new File([blob], 'clipboard-' + Date.now() + '.' + ext, { type: blob.type });
        files.push(file);
      }
    }
  }
  if (files.length > 0) processFiles(files);
});

// File input listeners
['lottie-folder','lottie-zip','lottie-json','lottie-folder2','lottie-zip2','lottie-json2'].forEach(function(id) {
  document.getElementById(id).addEventListener('change', function(e) { if (e.target.files.length > 0) processFiles(e.target.files); });
});
['img-folder','img-zip','img-file','img-folder2','img-zip2','img-file2'].forEach(function(id) {
  document.getElementById(id).addEventListener('change', function(e) { if (e.target.files.length > 0) processFiles(e.target.files); });
});
['video-folder','video-zip','video-file','video-folder2','video-zip2','video-file2'].forEach(function(id) {
  document.getElementById(id).addEventListener('change', function(e) { if (e.target.files.length > 0) processFiles(e.target.files); });
});
['audio-folder','audio-zip','audio-file','audio-folder2','audio-zip2','audio-file2'].forEach(function(id) {
  document.getElementById(id).addEventListener('change', function(e) { if (e.target.files.length > 0) processFiles(e.target.files); });
});

// Audio URL input — load direct audio from URL
function handleAudioUrlInput(inputId) {
  var input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { showAudioPreviewFromUrl(input.value); input.blur(); }
  });
}
['audio-url-input', 'audio-url-input-2'].forEach(function(id) { handleAudioUrlInput(id); });
document.getElementById('audio-url-load').addEventListener('click', function() {
  showAudioPreviewFromUrl(document.getElementById('audio-url-input').value);
});
document.getElementById('audio-url-load-2').addEventListener('click', function() {
  showAudioPreviewFromUrl(document.getElementById('audio-url-input-2').value);
});

['file-folder','file-zip','file-any','file-folder2','file-zip2','file-any2'].forEach(function(id) {
  document.getElementById(id).addEventListener('change', function(e) { if (e.target.files.length > 0) processFiles(e.target.files); });
});
['font-folder','font-zip','font-file','font-folder2','font-zip2','font-file2'].forEach(function(id) {
  document.getElementById(id).addEventListener('change', function(e) { if (e.target.files.length > 0) processFiles(e.target.files); });
});

// Menu close on outside click
document.addEventListener('click', function(e) { if (!e.target.closest('.drop-actions') && !e.target.closest('.float-browse')) closeMenu(); });

// Browse buttons (select-btn)
document.querySelectorAll('.select-btn').forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    var menu = btn.parentElement.querySelector('.select-menu');
    if (menu) menu.classList.toggle('show');
  });
});

// Float browse buttons
document.querySelectorAll('.float-browse').forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    var menu = btn.querySelector('.select-menu');
    if (menu) menu.classList.toggle('show');
  });
});

// Menu labels — close on selection
document.querySelectorAll('.select-menu label').forEach(function(label) {
  label.addEventListener('click', function() { closeMenu(); });
});

// Controls
document.getElementById('btn-play').addEventListener('click', togglePlay);
document.getElementById('btn-stop').addEventListener('click', stopAnim);
document.getElementById('btn-loop').addEventListener('click', toggleLoop);
document.getElementById('progress-bar').addEventListener('click', seekAnim);
document.querySelector('.speed-select').addEventListener('change', function(e) { changeSpeed(e.target.value); });

// Background dots
document.querySelectorAll('.bg-dot').forEach(function(dot) {
  dot.addEventListener('click', function() {
    var color;
    if (dot.classList.contains('dark')) color = '#0F172A';
    else if (dot.classList.contains('white')) color = '#F8FAFC';
    else if (dot.classList.contains('gray')) color = '#64748B';
    else color = 'checker';
    setBg(color, dot);
  });
});

// Sidebar resize
(function(){
  var resizer = document.getElementById('sidebar-resizer');
  var sidebar = resizer.parentElement;
  var startX, startW;
  resizer.addEventListener('mousedown', function(e){
    startX = e.clientX; startW = sidebar.offsetWidth;
    resizer.classList.add('active');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });
  function onMove(e){
    var w = startW + (e.clientX - startX);
    if(w < 140) w = 140;
    if(w > 450) w = 450;
    sidebar.style.width = w + 'px';
  }
  function onUp(){
    resizer.classList.remove('active');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
})();

// --- Mobile sidebar toggle ---
(function() {
  var sidebarToggle = document.getElementById('sidebar-toggle');
  var sidebar = document.getElementById('sidebar');
  var backdrop = document.getElementById('sidebar-backdrop');

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.classList.add('active');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('active');
  }

  sidebarToggle.addEventListener('click', function(e) {
    e.stopPropagation();
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  backdrop.addEventListener('click', function() {
    closeSidebar();
  });

  // Close sidebar when a file tree item is tapped on mobile
  document.getElementById('file-tree').addEventListener('click', function(e) {
    if (e.target.closest('.tree-item') && window.innerWidth <= 768) {
      closeSidebar();
    }
  });
})();

// PWA: Register service worker and handle share target
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
  navigator.serviceWorker.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'share-target-files' && e.data.files && e.data.files.length > 0) {
      // Determine mode from first file type
      var first = e.data.files[0];
      var name = (first.name || '').toLowerCase();
      var type = (first.type || '').toLowerCase();
      if (type.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif|svg|heic|heif|avif)$/.test(name)) {
        switchMode('image');
      } else if (type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/.test(name)) {
        switchMode('video');
      } else if (type.startsWith('audio/') || /\.(mp3|wav|flac|aac|m4a|ogg|wma)$/.test(name)) {
        switchMode('audio');
      } else if (/\.json$/.test(name) || type === 'application/json') {
        switchMode('lottie');
      } else {
        switchMode('file');
      }
      processFiles(e.data.files);
    }
  });
}

function shouldIgnoreSwipe(target) {
  // 1. Sidebar is open: don't swipe switch
  var sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('open')) {
    return true;
  }

  // 2. Zoomed image overlay is active: don't swipe switch
  var zoomOverlay = document.getElementById('img-zoom-overlay');
  if (zoomOverlay && zoomOverlay.classList.contains('active')) {
    return true;
  }

  // 3. Prevent conflict with interactive elements
  var current = target;
  while (current && current !== document.body) {
    if (current.classList) {
      if (current.classList.contains('controls') ||
          current.classList.contains('audio-waveform-wrap') ||
          current.classList.contains('sidebar') ||
          current.classList.contains('sidebar-toggle') ||
          current.classList.contains('sidebar-backdrop') ||
          current.classList.contains('img-zoom-controls') ||
          current.classList.contains('speed-select') ||
          current.classList.contains('bg-control') ||
          current.classList.contains('file-content') ||
          current.classList.contains('file-hex') ||
          current.classList.contains('sqlite-viewer') ||
          current.classList.contains('tree-item') ||
          current.tagName === 'AUDIO' ||
          current.tagName === 'VIDEO' ||
          current.tagName === 'CANVAS' ||
          current.tagName === 'IFRAME') {
        return true;
      }

      // Check if target is inside an element that has horizontal overflow scrolling
      if (current.scrollWidth > current.clientWidth &&
          (window.getComputedStyle(current).overflowX === 'auto' ||
           window.getComputedStyle(current).overflowX === 'scroll')) {
        return true;
      }
    }
    current = current.parentElement;
  }
  return false;
}

function initTouchSwiping() {
  var canvasArea = document.getElementById('canvas-area');
  if (!canvasArea) return;

  var startX = 0;
  var startY = 0;
  var startTime = 0;
  var isTouchSwiping = false;

  canvasArea.addEventListener('touchstart', function(e) {
    if (shouldIgnoreSwipe(e.target)) {
      isTouchSwiping = false;
      return;
    }
    if (e.touches.length !== 1) {
      isTouchSwiping = false;
      return;
    }
    var touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = Date.now();
    isTouchSwiping = true;
  }, { passive: true });

  canvasArea.addEventListener('touchmove', function(e) {
    if (!isTouchSwiping) return;
    if (e.touches.length !== 1) {
      isTouchSwiping = false;
      return;
    }
  }, { passive: true });

  canvasArea.addEventListener('touchend', function(e) {
    if (!isTouchSwiping) return;
    isTouchSwiping = false;

    if (e.changedTouches.length !== 1) return;

    var touch = e.changedTouches[0];
    var diffX = touch.clientX - startX;
    var diffY = touch.clientY - startY;
    var elapsed = Date.now() - startTime;

    var absDiffX = Math.abs(diffX);
    var absDiffY = Math.abs(diffY);

    // Swipe validation criteria:
    // - Horizontal displacement of at least 60px
    // - Horizontal displacement is 1.5x greater than vertical displacement (prevents scrolling conflict)
    // - Must be a quick swipe (< 400ms) OR large swipe (> 120px)
    if (absDiffX > 60 && absDiffX > absDiffY * 1.5 && (elapsed < 400 || absDiffX > 120)) {
      var currentIdx = TAB_MODES.indexOf(state.currentMode);
      if (currentIdx === -1) return;

      if (diffX < 0) {
        // Swipe left (finger right to left) -> Next tab
        if (currentIdx < TAB_MODES.length - 1) {
          switchMode(TAB_MODES[currentIdx + 1], 'next');
        }
      } else {
        // Swipe right (finger left to right) -> Previous tab
        if (currentIdx > 0) {
          switchMode(TAB_MODES[currentIdx - 1], 'prev');
        }
      }
    }
  }, { passive: true });

  // --- Trackpad Swipe Detection ---
  var accumulatedDeltaX = 0;
  var isSwipeLocked = false;
  var swipeLockTimeout = null;

  canvasArea.addEventListener('wheel', function(e) {
    if (shouldIgnoreSwipe(e.target)) {
      accumulatedDeltaX = 0;
      return;
    }

    var absX = Math.abs(e.deltaX);
    var absY = Math.abs(e.deltaY);

    // If horizontal scroll is dominant, immediately prevent browser history swipe gesture.
    // We must do this even for very small deltaX (like deltaX < 2) to stop the browser from initiating it.
    if (absX > absY) {
      e.preventDefault();
    }

    if (absX < 2) return; // Ignore micro-scrolls (noise)

    if (absX < absY * 1.5) {
      accumulatedDeltaX = 0;
      return;
    }

    if (isSwipeLocked) return;

    accumulatedDeltaX += e.deltaX;

    var threshold = 120; // Accumulation threshold (px)
    if (Math.abs(accumulatedDeltaX) >= threshold) {
      var currentIdx = TAB_MODES.indexOf(state.currentMode);
      if (currentIdx === -1) return;

      var didSwitch = false;

      if (accumulatedDeltaX > 0) {
        if (currentIdx < TAB_MODES.length - 1) {
          switchMode(TAB_MODES[currentIdx + 1], 'next');
          didSwitch = true;
        }
      } else {
        if (currentIdx > 0) {
          switchMode(TAB_MODES[currentIdx - 1], 'prev');
          didSwitch = true;
        }
      }

      if (didSwitch) {
        isSwipeLocked = true;
        accumulatedDeltaX = 0;
        if (swipeLockTimeout) clearTimeout(swipeLockTimeout);
        swipeLockTimeout = setTimeout(function() {
          isSwipeLocked = false;
        }, 500);
      } else {
        accumulatedDeltaX = 0;
      }
    }
  }, { passive: false });
}

// Initialize touch swipe switching
initTouchSwiping();

// Initialize sidebar search and filter
function initSidebarFilter() {
  var search = document.getElementById('sidebar-search');
  if (search) {
    search.addEventListener('input', function() {
      buildTree();
    });
  }

  document.querySelectorAll('.filter-pill').forEach(function(pill) {
    pill.addEventListener('click', function() {
      document.querySelectorAll('.filter-pill').forEach(function(p) { p.classList.remove('active'); });
      pill.classList.add('active');
      buildTree();
    });
  });
}

initSidebarFilter();

async function initHistoryRestoreBar() {
  var bar = document.getElementById('history-restore-bar');
  var nameEl = document.getElementById('history-project-name');
  var btnRestore = document.getElementById('btn-history-restore');
  var btnDismiss = document.getElementById('btn-history-dismiss');

  if (!bar || !nameEl || !btnRestore || !btnDismiss) return;

  var lastProj = await checkLastProjectHistory();
  if (lastProj) {
    nameEl.textContent = lastProj.name;
    var minutesAgo = Math.round((Date.now() - lastProj.timestamp) / 60000);
    var timeStr = minutesAgo < 1 ? '刚刚' : (minutesAgo < 60 ? minutesAgo + '分钟前' : Math.round(minutesAgo/60) + '小时前');
    nameEl.title = '保存于 ' + timeStr;
    bar.classList.remove('hidden');

    btnRestore.onclick = async function() {
      bar.classList.add('hidden');
      try {
        await restoreProjectFromHistory(lastProj.id);
      } catch(e) {
        alert('恢复失败: ' + e.message);
      }
    };

    btnDismiss.onclick = function() {
      bar.classList.add('hidden');
      deleteProjectHistory(lastProj.id);
    };
  }
}

export function dismissHistoryBar() {
  var bar = document.getElementById('history-restore-bar');
  if (bar) bar.classList.add('hidden');
}

initHistoryRestoreBar();
