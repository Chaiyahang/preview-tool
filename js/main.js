// main.js — Entry point: state, mode switching, event binding, sidebar resizer
import { playJson, togglePlay, stopAnim, toggleLoop, changeSpeed, seekAnim, setBg, updateProgress } from './preview-lottie.js';
import { showImagePreview, formatSize, cleanupPAGView } from './preview-image.js';
import { showVideoPreview } from './preview-video.js';
import { showFilePreview } from './preview-file.js';
import { processEntries, processFiles, buildTree, getActiveDropZone, toggleMenu, closeMenu, isImageFile, isVideoFile } from './file-handler.js';

// Shared state — exported for other modules to import
export var state = {
  currentMode: 'lottie',
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
    file: { fileMap: new Map(), hasContent: false, activeFile: null }
  }
};

export function hideAllPreviews() {
  document.getElementById('drop-zone-lottie').classList.add('hidden');
  document.getElementById('drop-zone-image').classList.add('hidden');
  document.getElementById('drop-zone-video').classList.add('hidden');
  document.getElementById('drop-zone-file').classList.add('hidden');
  document.getElementById('preview-lottie').classList.add('hidden');
  document.getElementById('preview-image').classList.add('hidden');
  document.getElementById('preview-video').classList.add('hidden');
  document.getElementById('preview-file').classList.add('hidden');
  document.getElementById('preview-doc').classList.add('hidden');
}

var TAB_MODES = ['lottie', 'image', 'video', 'file'];

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
    else if (mode === 'file' && s.activeFile) showFilePreview(s.activeFile);
  } else {
    document.getElementById('file-tree').innerHTML = '';
    if (mode === 'lottie') document.getElementById('drop-zone-lottie').classList.remove('hidden');
    else if (mode === 'image') document.getElementById('drop-zone-image').classList.remove('hidden');
    else if (mode === 'video') document.getElementById('drop-zone-video').classList.remove('hidden');
    else document.getElementById('drop-zone-file').classList.remove('hidden');
  }
}

function switchMode(mode) {
  saveCurrentState();
  state.currentMode = mode;
  document.querySelectorAll('.tab-btn').forEach(function(btn, i) {
    btn.classList.toggle('active', TAB_MODES[i] === mode);
  });
  restoreModeState(mode);
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
  fileContent.innerHTML = ''; fileHex.innerHTML = ''; fileHex.classList.add('hidden'); filePreviewHeader.innerHTML = '';
  docIframe.src = ''; docIframe.srcdoc = ''; docEmbed.data = ''; docInfoHeader.innerHTML = '';
  var oldPdfIframe = document.querySelector('.pdf-iframe'); if (oldPdfIframe) oldPdfIframe.remove();
  state.modeState[state.currentMode] = { fileMap: new Map(), animGroups: [], hasContent: false, activeFile: null };
  hideAllPreviews();
  if (state.currentMode === 'lottie') document.getElementById('drop-zone-lottie').classList.remove('hidden');
  else if (state.currentMode === 'image') document.getElementById('drop-zone-image').classList.remove('hidden');
  else if (state.currentMode === 'video') document.getElementById('drop-zone-video').classList.remove('hidden');
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
['file-folder','file-zip','file-any','file-folder2','file-zip2','file-any2'].forEach(function(id) {
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
