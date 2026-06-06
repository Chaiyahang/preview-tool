// preview-image.js — Image preview functionality
import { parseExifData, parseEXIF, parseGIF, parseWebP, parsePNG, parsePAG, parsePAGAsync, parseHEIF } from './parsers.js';
import { state, hideAllPreviews } from './main.js';

export var svgCodeText = "";

var previewCallId = 0;

export function infoItem(label, value) { return '<div class="img-info-item"><span class="label">' + label + '</span><span class="value">' + value + '</span></div>'; }
export function formatSize(bytes) { if (bytes < 1024) return bytes + ' B'; if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'; return (bytes / 1048576).toFixed(2) + ' MB'; }
export function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
export function formatAspectRatio(w, h) { if (!w || !h) return ''; var g = gcd(w, h); var rw = w / g, rh = h / g; if (rw > 100 || rh > 100) return (w / h).toFixed(2) + ':1'; return rw + ':' + rh; }

export function getDimensions(file, info) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() { info.width = img.naturalWidth; info.height = img.naturalHeight; resolve(); };
    img.onerror = function() { resolve(); };
    img.src = URL.createObjectURL(file);
  });
}

export function reverseGeocode(lat, lng, elementId) {
  var targetId = elementId || 'gps-location-text';
  var el = document.getElementById(targetId);
  if (!el) return;
  var originalText = el.textContent;
  el.textContent = '获取地址中...';
  el.style.opacity = '0.6';

  var controller = new AbortController();
  var timeout = setTimeout(function() { controller.abort(); }, 8000);

  // Try Nominatim first
  fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=16&accept-language=zh', {
    signal: controller.signal,
    headers: { 'User-Agent': 'PreviewTool/1.0' }
  })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      clearTimeout(timeout);
      if (d.display_name) {
        el.textContent = d.display_name;
        el.style.opacity = '1';
      } else {
        el.textContent = originalText;
        el.style.opacity = '1';
      }
    })
    .catch(function() {
      // Nominatim failed, try alternative (geocode.maps.co)
      clearTimeout(timeout);
      var c2 = new AbortController();
      var t2 = setTimeout(function() { c2.abort(); }, 8000);
      return fetch('https://geocode.maps.co/reverse?lat=' + lat + '&lon=' + lng, { signal: c2.signal })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          clearTimeout(t2);
          if (d.display_name) {
            el.textContent = d.display_name;
          } else if (d.address) {
            var addr = d.address;
            el.textContent = [addr.country, addr.state, addr.city, addr.district || addr.suburb, addr.road].filter(Boolean).join(', ');
          }
          el.style.opacity = '1';
        });
    })
    .catch(function() {
      el.textContent = originalText;
      el.style.opacity = '1';
    });
}

export async function analyzeImage(file) {
  var callId = previewCallId;
  var info = { format: 'Unknown', width: 0, height: 0, animated: false, frames: 0, duration: 0,
    aspectRatio: '', megapixels: 0, compression: '', hasAlpha: false, colorType: '', bitDepth: 0, loopCount: -1, gifVersion: '',
    gps: null, camera: '', dateTime: '' };
  var name = file.name.toLowerCase(); var buffer = await file.arrayBuffer(); var bytes = new Uint8Array(buffer);
  if (previewCallId !== callId) return info;
  if (name.endsWith('.gif') || (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)) { info.format = 'GIF'; parseGIF(bytes, info); }
  else if (name.endsWith('.webp') || (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)) { info.format = 'WebP'; parseWebP(bytes, info); }
  else if (name.endsWith('.png') || name.endsWith('.apng') || (bytes[0] === 0x89 && bytes[1] === 0x50)) { info.format = 'PNG'; parsePNG(bytes, info); }
  else if (name.endsWith('.jpg') || name.endsWith('.jpeg')) { info.format = 'JPEG'; parseEXIF(bytes, info); await getDimensions(file, info); }
  else if (name.endsWith('.tiff') || name.endsWith('.tif') || (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) || (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A)) { info.format = 'TIFF'; parseExifData(bytes, info); await getDimensions(file, info); }
  else if (name.endsWith('.heic') || name.endsWith('.heif') || name.endsWith('.avif')) { info.format = name.endsWith('.avif') ? 'AVIF' : 'HEIC'; parseHEIF(bytes, info); }
  else if (name.endsWith('.pag')) { info.format = 'PAG'; parsePAG(bytes, info); if (previewCallId === callId) await parsePAGAsync(buffer, info); }
  if (info.width === 0) await getDimensions(file, info);
  if (info.width && info.height) { info.aspectRatio = formatAspectRatio(info.width, info.height); info.megapixels = parseFloat((info.width * info.height / 1000000).toFixed(2)); }
  return info;
}

export async function showImagePreview(filePath) {
  offscreenCanvas = null;
  offscreenCtx = null;
  disableColorPicker();

  var thisCallId = ++previewCallId;
  var currentMode = state.currentMode;
  var fileMap = state.fileMap;
  var modeState = state.modeState;
  modeState[currentMode].activeFile = filePath;
  document.querySelectorAll('.tree-item').forEach(function(el) { el.classList.toggle('active', el.title === filePath); });
  var file = fileMap.get(filePath); if (!file) return;

  var previewImage = document.getElementById('preview-image');
  var imgPreviewEl = document.getElementById('img-preview-el');
  var imgInfoPanel = document.getElementById('img-info-panel');
  var infoBadge = document.getElementById('info-badge');
  var controls = document.getElementById('controls');

  var svgTabsContainer = document.getElementById('svg-tabs-container');
  var codeView = document.getElementById('svg-code-view');
  var actions = document.getElementById('svg-code-actions');
  var tabPreview = document.getElementById('svg-tab-preview');
  var tabCode = document.getElementById('svg-tab-code');

  if (svgTabsContainer) {
    svgTabsContainer.classList.add('hidden');
    imgPreviewEl.classList.remove('hidden');
    if (codeView) codeView.classList.add('hidden');
    if (actions) actions.classList.add('hidden');
    if (tabPreview) tabPreview.classList.add('active');
    if (tabCode) tabCode.classList.remove('active');
  }

  hideAllPreviews(); previewImage.classList.remove('hidden'); controls.classList.add('hidden');
  cleanupPAGView();
  var lower = filePath.toLowerCase();
  if (lower.endsWith('.pag')) {
    try { await renderPAGPreview(file, imgPreviewEl); }
    catch(e) { imgPreviewEl.src = ''; }
  } else if (lower.endsWith('.heic') || lower.endsWith('.heif')) {
    try { var blob = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 }); if (previewCallId !== thisCallId) return; imgPreviewEl.src = URL.createObjectURL(blob); }
    catch(e) { imgPreviewEl.src = ''; }
  } else { 
    imgPreviewEl.src = URL.createObjectURL(file); 
    if (lower.endsWith('.svg')) {
      try {
        svgCodeText = await file.text();
        if (codeView) {
          codeView.textContent = svgCodeText;
        }
        if (svgTabsContainer) {
          svgTabsContainer.classList.remove('hidden');
        }
      } catch (e) {
        console.error('Error loading SVG text:', e);
      }
    }
  }
  if (previewCallId !== thisCallId) return;
  var info = await analyzeImage(file);
  if (previewCallId !== thisCallId) return;
  infoBadge.style.display = '';
  infoBadge.textContent = info.format + (info.animated ? ' (Animated)' : '') + '  ·  ' + info.width + 'x' + info.height;
  updateDimensionLabels(info.width, info.height);
  var html = '';
  html += infoItem('Format', info.format);
  html += infoItem('Dimensions', info.width + ' × ' + info.height + ' px');
  if (info.aspectRatio) html += infoItem('Aspect Ratio', info.aspectRatio);
  if (info.megapixels > 0) html += infoItem('Megapixels', info.megapixels.toFixed(2) + ' MP');
  html += infoItem('File Size', formatSize(file.size));
  if (info.compression) html += infoItem('Compression', info.compression);
  if (info.colorType) html += infoItem('Color Type', info.colorType);
  if (info.bitDepth > 0) html += infoItem('Bit Depth', info.bitDepth + '-bit');
  if (info.hasAlpha) html += infoItem('Alpha', 'Yes');
  if (info.gifVersion) html += infoItem('GIF Version', info.gifVersion);
  if (info.animated) { html += infoItem('Animated', 'Yes'); if (info.frames > 0) html += infoItem('Frames', info.frames); if (info.duration > 0) html += infoItem('Duration', info.duration.toFixed(2) + 's'); if (info.frames > 0 && info.duration > 0) html += infoItem('FPS', (info.frames / info.duration).toFixed(1)); if (info.loopCount >= 0) html += infoItem('Loop Count', info.loopCount === 0 ? '∞ (Infinite)' : info.loopCount); }
  if (info.camera) html += infoItem('Camera', info.camera);
  if (info.dateTime) html += infoItem('Date Taken', info.dateTime);
  if (info.focalLength) { var fl = info.focalLength35 ? info.focalLength + ' mm (' + info.focalLength35 + ' mm eq)' : info.focalLength + ' mm'; html += infoItem('Focal Length', fl); }
  if (info.fNumber) html += infoItem('Aperture', 'f/' + info.fNumber);
  if (info.exposureTime) html += infoItem('Shutter', info.exposureTime + ' s');
  if (info.iso) html += infoItem('ISO', info.iso);
  if (info.gps) {
    var amapUrl = 'https://uri.amap.com/marker?position=' + info.gps.lng + ',' + info.gps.lat + '&name=' + encodeURIComponent('拍摄位置');
    html += infoItem('Location', '<span id="gps-location-text">' + info.gps.lat.toFixed(6) + ', ' + info.gps.lng.toFixed(6) + '</span> <a href="' + amapUrl + '" target="_blank" style="color:var(--accent);text-decoration:none;margin-left:6px">高德地图 ↗</a>');
    reverseGeocode(info.gps.lat, info.gps.lng);
  }
  imgInfoPanel.innerHTML = html;
}

async function renderPAGPreview(file, imgEl) {
  if (!window.libpag) { imgEl.src = ''; return; }
  var thisCallId = previewCallId;
  cleanupPAGView();
  var PAG = await window.libpag.PAGInit({
    locateFile: function(f) { return 'https://cdn.jsdelivr.net/npm/libpag@4.2.81/lib/' + f; }
  });
  if (previewCallId !== thisCallId) return;
  var buffer = await file.arrayBuffer();
  if (previewCallId !== thisCallId) return;
  var pagFile = await PAG.PAGFile.load(buffer);
  var w = pagFile.width(), h = pagFile.height();
  var canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.id = 'pag-canvas';
  canvas.style.maxWidth = '100%';
  canvas.style.maxHeight = '100%';
  canvas.style.objectFit = 'contain';
  canvas.style.borderRadius = '12px';
  canvas.style.boxShadow = '0 12px 48px rgba(0,0,0,0.4)';
  imgEl.style.display = 'none';
  imgEl.parentElement.appendChild(canvas);
  var pagView = await PAG.PAGView.init(pagFile, canvas);
  pagView.setRepeatCount(0);
  await pagView.play();
  activePAGView = pagView;
  activePAGFile = pagFile;
}

var activePAGView = null;
var activePAGFile = null;

export function cleanupPAGView() {
  try { if (activePAGView) { activePAGView.stop(); activePAGView.destroy(); } } catch(e) {}
  activePAGView = null;
  try { if (activePAGFile) { activePAGFile.destroy(); } } catch(e) {}
  activePAGFile = null;
  var oldCanvas = document.getElementById('pag-canvas');
  if (oldCanvas) oldCanvas.remove();
  var imgEl = document.getElementById('img-preview-el');
  if (imgEl) imgEl.style.display = '';
}

function updateDimensionLabels(w, h) {
  var wrap = document.querySelector('.img-preview-wrap');
  wrap.querySelectorAll('.img-dimension-label').forEach(function(el) { el.remove(); });
  var oldGrid = wrap.querySelector('.img-grid-label'); if (oldGrid) oldGrid.remove();
  if (!w || !h) return;

  var gridLabel = document.createElement('span');
  gridLabel.className = 'img-grid-label';
  gridLabel.textContent = '20×20 px';
  wrap.appendChild(gridLabel);

  function positionLabels() {
    wrap.querySelectorAll('.img-dimension-label').forEach(function(el) { el.remove(); });
    var imgEl = document.getElementById('img-preview-el');
    var canvas = document.getElementById('pag-canvas');
    var target = canvas || imgEl;
    if (!target || (!target.offsetWidth && !target.naturalWidth)) return;

    var wrapRect = wrap.getBoundingClientRect();
    var imgRect = target.getBoundingClientRect();
    var imgLeft = imgRect.left - wrapRect.left;
    var imgTop = imgRect.top - wrapRect.top;
    var imgW = imgRect.width;
    var imgH = imgRect.height;

    wrap.style.setProperty('--grid-offset-x', (imgLeft % 20) + 'px');
    wrap.style.setProperty('--grid-offset-y', (imgTop % 20) + 'px');

    var wLabel = document.createElement('span');
    wLabel.className = 'img-dimension-label width-label';
    wLabel.textContent = w + ' px';
    wLabel.style.left = (imgLeft + imgW / 2) + 'px';
    wLabel.style.top = (imgTop + imgH + 4) + 'px';
    wrap.appendChild(wLabel);

    var hLabel = document.createElement('span');
    hLabel.className = 'img-dimension-label height-label';
    hLabel.textContent = h + ' px';
    hLabel.style.left = (imgLeft + imgW + 6) + 'px';
    hLabel.style.top = (imgTop + imgH / 2) + 'px';
    wrap.appendChild(hLabel);
  }

  var imgEl = document.getElementById('img-preview-el');
  if (imgEl && imgEl.complete && imgEl.naturalWidth) { positionLabels(); }
  else if (imgEl) { imgEl.addEventListener('load', positionLabels, { once: true }); }
  setTimeout(positionLabels, 200);
}

// Image zoom viewer
var zoomScale = 1, zoomX = 0, zoomY = 0, isDragging = false, dragStartX = 0, dragStartY = 0, startZoomX = 0, startZoomY = 0;

function initZoom() {
  var overlay = document.getElementById('img-zoom-overlay');
  var zoomEl = document.getElementById('img-zoom-el');
  var zoomLevel = document.getElementById('zoom-level');

  document.getElementById('img-preview-el').addEventListener('click', openZoom);
  document.getElementById('img-zoom-close').addEventListener('click', closeZoom);
  document.getElementById('zoom-in').addEventListener('click', function() { setZoom(zoomScale * 1.5); });
  document.getElementById('zoom-out').addEventListener('click', function() { setZoom(zoomScale / 1.5); });
  document.getElementById('zoom-fit').addEventListener('click', function() { zoomX = 0; zoomY = 0; setZoom(1); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeZoom(); });
  overlay.addEventListener('wheel', function(e) { e.preventDefault(); setZoom(zoomScale * (e.deltaY < 0 ? 1.2 : 1/1.2)); }, { passive: false });

  zoomEl.addEventListener('mousedown', function(e) { e.preventDefault(); isDragging = true; dragStartX = e.clientX; dragStartY = e.clientY; startZoomX = zoomX; startZoomY = zoomY; zoomEl.classList.add('dragging'); });
  document.addEventListener('mousemove', function(e) { if (!isDragging) return; zoomX = startZoomX + (e.clientX - dragStartX); zoomY = startZoomY + (e.clientY - dragStartY); applyTransform(); });
  document.addEventListener('mouseup', function() { isDragging = false; zoomEl.classList.remove('dragging'); });
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && overlay.classList.contains('active')) closeZoom(); });

  function openZoom() {
    var src = document.getElementById('img-preview-el').src;
    if (!src) return;
    zoomEl.src = src;
    zoomScale = 0.5; zoomX = 0; zoomY = 0;
    overlay.classList.add('active');
    zoomLevel.textContent = '50%';
    
    var grid = document.getElementById('img-zoom-grid-overlay');
    if (grid) {
      grid.classList.remove('active');
      setTimeout(function() {
        grid.style.width = zoomEl.naturalWidth + 'px';
        grid.style.height = zoomEl.naturalHeight + 'px';
      }, 50);
    }
    applyTransform();
  }

  function closeZoom() { overlay.classList.remove('active'); zoomEl.src = ''; }

  function setZoom(s) {
    zoomScale = Math.max(0.1, Math.min(20, s));
    zoomLevel.textContent = Math.round(zoomScale * 100) + '%';
    
    var grid = document.getElementById('img-zoom-grid-overlay');
    if (grid) {
      if (zoomScale >= 5) {
        grid.classList.add('active');
        grid.style.backgroundSize = zoomScale + 'px ' + zoomScale + 'px';
        grid.style.width = zoomEl.naturalWidth + 'px';
        grid.style.height = zoomEl.naturalHeight + 'px';
      } else {
        grid.classList.remove('active');
      }
    }
    applyTransform();
  }

  function applyTransform() {
    var transformStr = 'translate(' + zoomX + 'px,' + zoomY + 'px) scale(' + zoomScale + ')';
    zoomEl.style.transform = transformStr;
    var grid = document.getElementById('img-zoom-grid-overlay');
    if (grid) {
      grid.style.transform = transformStr;
    }
  }

  // Zoom color picker — uses the same magnifier as the preview picker
  var zoomPickerActive = false;
  var zoomOffscreenCanvas = null;
  var zoomOffscreenCtx = null;
  var zoomPickerBtn = document.getElementById('zoom-picker');
  var zoomPickerSwatch = document.getElementById('zoom-picker-swatch');
  var zoomPickerHex = document.getElementById('zoom-picker-hex');

  function ensureZoomBuffer() {
    if (zoomOffscreenCanvas) return;
    if (!zoomEl.naturalWidth) return;
    zoomOffscreenCanvas = document.createElement('canvas');
    zoomOffscreenCanvas.width = zoomEl.naturalWidth;
    zoomOffscreenCanvas.height = zoomEl.naturalHeight;
    zoomOffscreenCtx = zoomOffscreenCanvas.getContext('2d');
    zoomOffscreenCtx.drawImage(zoomEl, 0, 0);
  }

  zoomPickerBtn.addEventListener('click', function() {
    zoomPickerActive = !zoomPickerActive;
    zoomPickerBtn.classList.toggle('active', zoomPickerActive);
    if (!zoomPickerActive) {
      zoomPickerSwatch.classList.remove('visible');
      zoomPickerHex.classList.remove('visible');
      if (magnifier) magnifier.classList.remove('visible');
      zoomOffscreenCanvas = null;
      zoomOffscreenCtx = null;
    } else {
      ensureZoomBuffer();
    }
  });

  document.addEventListener('keydown', function(e) {
    if ((e.key === 'p' || e.key === 'P') && overlay.classList.contains('active') && document.activeElement.tagName !== 'INPUT') {
      zoomPickerActive = !zoomPickerActive;
      zoomPickerBtn.classList.toggle('active', zoomPickerActive);
      if (!zoomPickerActive) {
        zoomPickerSwatch.classList.remove('visible');
        zoomPickerHex.classList.remove('visible');
        if (magnifier) magnifier.classList.remove('visible');
        zoomOffscreenCanvas = null;
        zoomOffscreenCtx = null;
      } else {
        ensureZoomBuffer();
      }
    }
  });

  overlay.addEventListener('mousemove', function(e) {
    if (!zoomPickerActive || !zoomEl.naturalWidth) return;
    ensureZoomBuffer();
    if (!zoomOffscreenCanvas) return;
    var rect = zoomEl.getBoundingClientRect();
    var imgX = (e.clientX - rect.left - zoomX) / zoomScale;
    var imgY = (e.clientY - rect.top - zoomY) / zoomScale;
    if (imgX < 0 || imgY < 0 || imgX >= zoomEl.naturalWidth || imgY >= zoomEl.naturalHeight) {
      if (magnifier) magnifier.classList.remove('visible');
      return;
    }
    var pixelX = Math.floor(imgX);
    var pixelY = Math.floor(imgY);
    var rgba = zoomOffscreenCtx.getImageData(pixelX, pixelY, 1, 1).data;
    var hex = '#' + [rgba[0], rgba[1], rgba[2]].map(function(c) { return ('0' + c.toString(16)).slice(-2); }).join('').toUpperCase();

    // Draw magnifier
    if (magnifierCtx) {
      magnifierCtx.fillStyle = '#0f172a';
      magnifierCtx.fillRect(0, 0, 132, 132);
      magnifierCtx.imageSmoothingEnabled = false;
      var srcX = pixelX - 5, srcY = pixelY - 5;
      var sX = Math.max(0, srcX), sY = Math.max(0, srcY);
      var sW = 11 - (sX - srcX), sH = 11 - (sY - srcY);
      var dX = (sX - srcX) * 12, dY = (sY - srcY) * 12;
      var dW = sW * 12, dH = sH * 12;
      if (sX + sW > zoomOffscreenCanvas.width) { var diffW = (sX + sW) - zoomOffscreenCanvas.width; sW -= diffW; dW -= diffW * 12; }
      if (sY + sH > zoomOffscreenCanvas.height) { var diffH = (sY + sH) - zoomOffscreenCanvas.height; sH -= diffH; dH -= diffH * 12; }
      if (sW > 0 && sH > 0) magnifierCtx.drawImage(zoomOffscreenCanvas, sX, sY, sW, sH, dX, dY, dW, dH);
      magnifierCtx.strokeStyle = 'rgba(255,255,255,0.8)'; magnifierCtx.lineWidth = 1.5;
      magnifierCtx.strokeRect(60, 60, 12, 12);
      magnifierCtx.strokeStyle = 'rgba(0,0,0,0.8)'; magnifierCtx.lineWidth = 0.8;
      magnifierCtx.strokeRect(61, 61, 10, 10);
    }
    if (magnifier) {
      magnifier.classList.add('visible');
      var magX = e.clientX + 16, magY = e.clientY + 16;
      if (magX + 150 > window.innerWidth) magX = e.clientX - 156;
      if (magY + 180 > window.innerHeight) magY = e.clientY - 186;
      magnifier.style.left = magX + 'px';
      magnifier.style.top = magY + 'px';
      if (magnifierText) magnifierText.textContent = hex;
    }
    zoomPickerSwatch.style.background = hex;
    zoomPickerSwatch.classList.add('visible');
    zoomPickerHex.textContent = hex;
    zoomPickerHex.classList.add('visible');
  });

  overlay.addEventListener('click', function(e) {
    if (!zoomPickerActive || !zoomEl.naturalWidth || e.target === zoomPickerBtn) return;
    ensureZoomBuffer();
    if (!zoomOffscreenCanvas) return;
    var rect = zoomEl.getBoundingClientRect();
    var imgX = (e.clientX - rect.left - zoomX) / zoomScale;
    var imgY = (e.clientY - rect.top - zoomY) / zoomScale;
    if (imgX < 0 || imgY < 0 || imgX >= zoomEl.naturalWidth || imgY >= zoomEl.naturalHeight) return;
    var rgba = zoomOffscreenCtx.getImageData(Math.floor(imgX), Math.floor(imgY), 1, 1).data;
    var hex = '#' + [rgba[0], rgba[1], rgba[2]].map(function(c) { return ('0' + c.toString(16)).slice(-2); }).join('').toUpperCase();
    navigator.clipboard.writeText(hex).then(function() {
      var toast = document.createElement('div');
      toast.className = 'color-toast';
      toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:8px 16px;border-radius:8px;font-size:12px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-family:monospace;pointer-events:none;transition:opacity 0.2s;';
      toast.textContent = '已复制颜色: ' + hex;
      document.body.appendChild(toast);
      setTimeout(function() { toast.style.opacity = '0'; }, 1200);
      setTimeout(function() { if (toast.parentNode) toast.remove(); }, 1600);
    });
  });
}

function svgToJsx(svg) {
  var clean = svg.replace(/<\?xml[\s\S]*?\?>/g, '').trim();
  var replacements = {
    'class=': 'className=',
    'for=': 'htmlFor=',
    'stroke-width=': 'strokeWidth=',
    'stroke-linecap=': 'strokeLinecap=',
    'stroke-linejoin=': 'strokeLinejoin=',
    'stroke-miterlimit=': 'strokeMiterlimit=',
    'stroke-dasharray=': 'strokeDasharray=',
    'stroke-dashoffset=': 'strokeDashoffset=',
    'fill-rule=': 'fillRule=',
    'clip-rule=': 'clipRule=',
    'stop-color=': 'stopColor=',
    'stop-opacity=': 'stopOpacity=',
    'font-family=': 'fontFamily=',
    'font-size=': 'fontSize=',
    'font-weight=': 'fontWeight=',
    'letter-spacing=': 'letterSpacing=',
    'xmlns:xlink=': 'xmlnsXlink=',
    'xlink:href=': 'xlinkHref=',
    'xml:space=': 'xmlSpace='
  };
  
  for (var key in replacements) {
    var regex = new RegExp(key, 'g');
    clean = clean.replace(regex, replacements[key]);
  }
  return clean;
}

function initSvgInspector() {
  var tabPreview = document.getElementById('svg-tab-preview');
  var tabCode = document.getElementById('svg-tab-code');
  var btnCopyRaw = document.getElementById('svg-copy-raw');
  var btnCopyJsx = document.getElementById('svg-copy-jsx');
  var imgEl = document.getElementById('img-preview-el');
  var codeView = document.getElementById('svg-code-view');
  var actions = document.getElementById('svg-code-actions');

  if (!tabPreview) return;

  tabPreview.addEventListener('click', function() {
    tabPreview.classList.add('active');
    tabCode.classList.remove('active');
    imgEl.classList.remove('hidden');
    codeView.classList.add('hidden');
    actions.classList.add('hidden');
  });

  tabCode.addEventListener('click', function() {
    tabCode.classList.add('active');
    tabPreview.classList.remove('active');
    imgEl.classList.add('hidden');
    codeView.classList.remove('hidden');
    actions.classList.remove('hidden');
  });

  btnCopyRaw.addEventListener('click', function() {
    navigator.clipboard.writeText(svgCodeText).then(function() {
      var original = btnCopyRaw.textContent;
      btnCopyRaw.textContent = '已复制！';
      setTimeout(function() { btnCopyRaw.textContent = original; }, 1500);
    });
  });

  btnCopyJsx.addEventListener('click', function() {
    var jsx = svgToJsx(svgCodeText);
    navigator.clipboard.writeText(jsx).then(function() {
      var original = btnCopyJsx.textContent;
      btnCopyJsx.textContent = '已复制 JSX！';
      setTimeout(function() { btnCopyJsx.textContent = original; }, 1500);
    });
  });
}

initZoom();
initSvgInspector();

var isColorPickerActive = false;
var offscreenCanvas = null;
var offscreenCtx = null;

var magnifier = null;
var magnifierCanvas = null;
var magnifierCtx = null;
var magnifierText = null;

export function disableColorPicker() {
  isColorPickerActive = false;
  var btn = document.getElementById('btn-color-picker');
  if (btn) btn.classList.remove('active');
  var container = document.getElementById('preview-image');
  if (container) container.classList.remove('eye-dropper-active');
  if (magnifier) magnifier.classList.remove('visible');
}

export function enableColorPicker() {
  isColorPickerActive = true;
  var btn = document.getElementById('btn-color-picker');
  if (btn) btn.classList.add('active');
  var container = document.getElementById('preview-image');
  if (container) container.classList.add('eye-dropper-active');
  ensureOffscreenBuffer();
}

function toggleColorPicker() {
  if (isColorPickerActive) {
    disableColorPicker();
  } else {
    enableColorPicker();
  }
}

function ensureOffscreenBuffer() {
  if (offscreenCanvas) return;
  var activeEl = document.getElementById('pag-canvas') || document.getElementById('img-preview-el');
  if (!activeEl) return;

  offscreenCanvas = document.createElement('canvas');
  offscreenCtx = offscreenCanvas.getContext('2d');

  if (activeEl.tagName.toLowerCase() === 'canvas') {
    offscreenCanvas.width = activeEl.width;
    offscreenCanvas.height = activeEl.height;
    offscreenCtx.drawImage(activeEl, 0, 0);
  } else {
    offscreenCanvas.width = activeEl.naturalWidth || activeEl.width || 1;
    offscreenCanvas.height = activeEl.naturalHeight || activeEl.height || 1;
    offscreenCtx.drawImage(activeEl, 0, 0);
  }
}

function handleMouseMove(e) {
  if (!isColorPickerActive) return;
  var activeEl = document.getElementById('pag-canvas') || document.getElementById('img-preview-el');
  if (!activeEl) return;

  ensureOffscreenBuffer();
  if (!offscreenCanvas || offscreenCanvas.width === 0) return;

  var rect = activeEl.getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
    if (magnifier) magnifier.classList.remove('visible');
    return;
  }

  var x = e.clientX - rect.left;
  var y = e.clientY - rect.top;

  var pixelX = Math.floor((x / rect.width) * offscreenCanvas.width);
  var pixelY = Math.floor((y / rect.height) * offscreenCanvas.height);

  pixelX = Math.max(0, Math.min(offscreenCanvas.width - 1, pixelX));
  pixelY = Math.max(0, Math.min(offscreenCanvas.height - 1, pixelY));

  var rgba = offscreenCtx.getImageData(pixelX, pixelY, 1, 1).data;
  var hex = rgbToHex(rgba[0], rgba[1], rgba[2]);

  if (magnifierCtx) {
    magnifierCtx.fillStyle = '#0f172a';
    magnifierCtx.fillRect(0, 0, 132, 132);
    magnifierCtx.imageSmoothingEnabled = false;

    var srcX = pixelX - 5;
    var srcY = pixelY - 5;

    var sX = Math.max(0, srcX);
    var sY = Math.max(0, srcY);
    var sW = 11 - (sX - srcX);
    var sH = 11 - (sY - srcY);

    var dX = (sX - srcX) * 12;
    var dY = (sY - srcY) * 12;
    var dW = sW * 12;
    var dH = sH * 12;

    if (sX + sW > offscreenCanvas.width) {
      var diffW = (sX + sW) - offscreenCanvas.width;
      sW -= diffW;
      dW -= diffW * 12;
    }
    if (sY + sH > offscreenCanvas.height) {
      var diffH = (sY + sH) - offscreenCanvas.height;
      sH -= diffH;
      dH -= diffH * 12;
    }

    if (sW > 0 && sH > 0) {
      magnifierCtx.drawImage(offscreenCanvas, sX, sY, sW, sH, dX, dY, dW, dH);
    }

    magnifierCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    magnifierCtx.lineWidth = 1.5;
    magnifierCtx.strokeRect(60, 60, 12, 12);

    magnifierCtx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    magnifierCtx.lineWidth = 0.8;
    magnifierCtx.strokeRect(61, 61, 10, 10);
  }

  if (magnifier) {
    magnifier.classList.add('visible');
    var magX = e.clientX + 16;
    var magY = e.clientY + 16;
    if (magX + 150 > window.innerWidth) magX = e.clientX - 156;
    if (magY + 180 > window.innerHeight) magY = e.clientY - 186;

    magnifier.style.left = magX + 'px';
    magnifier.style.top = magY + 'px';

    if (magnifierText) magnifierText.textContent = hex.toUpperCase();
    magnifier.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px ' + hex + '66';
    magnifier.style.borderColor = hex;
  }
}

function handleMouseLeave() {
  if (magnifier) magnifier.classList.remove('visible');
}

function handleImageClick(e) {
  if (!isColorPickerActive) return;
  var activeEl = document.getElementById('pag-canvas') || document.getElementById('img-preview-el');
  if (!activeEl) return;

  var rect = activeEl.getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  ensureOffscreenBuffer();
  if (!offscreenCanvas || offscreenCanvas.width === 0) return;

  var x = e.clientX - rect.left;
  var y = e.clientY - rect.top;
  var pixelX = Math.floor((x / rect.width) * offscreenCanvas.width);
  var pixelY = Math.floor((y / rect.height) * offscreenCanvas.height);

  pixelX = Math.max(0, Math.min(offscreenCanvas.width - 1, pixelX));
  pixelY = Math.max(0, Math.min(offscreenCanvas.height - 1, pixelY));

  var rgba = offscreenCtx.getImageData(pixelX, pixelY, 1, 1).data;
  var hex = rgbToHex(rgba[0], rgba[1], rgba[2]).toUpperCase();

  navigator.clipboard.writeText(hex).then(function() {
    var toast = document.createElement('div');
    toast.className = 'color-toast';
    toast.style.cssText = 'position:fixed; bottom:80px; left:50%; transform:translateX(-50%); background:var(--accent); color:#fff; padding:8px 16px; border-radius:8px; font-size:12px; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,0.3); font-family:monospace; pointer-events:none; transition:opacity 0.2s;';
    toast.textContent = '已复制颜色: ' + hex;
    document.body.appendChild(toast);
    setTimeout(function() {
      toast.style.opacity = '0';
      setTimeout(function() { toast.remove(); }, 200);
    }, 1500);
  });
}

function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function initColorPicker() {
  var wrap = document.querySelector('.img-preview-wrap');
  var btn = document.getElementById('btn-color-picker');
  magnifier = document.getElementById('image-magnifier');
  if (magnifier) {
    magnifierCanvas = document.getElementById('magnifier-canvas');
    magnifierCtx = magnifierCanvas.getContext('2d');
    magnifierText = document.getElementById('magnifier-color-text');
  }

  if (btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleColorPicker();
    });
  }

  window.addEventListener('keydown', function(e) {
    if (state.currentMode === 'image' && (e.key === 'p' || e.key === 'P')) {
      if (document.activeElement.tagName.toLowerCase() !== 'textarea' && document.activeElement.tagName.toLowerCase() !== 'input') {
        toggleColorPicker();
      }
    }
  });

  if (wrap) {
    wrap.addEventListener('mousemove', handleMouseMove);
    wrap.addEventListener('mouseleave', handleMouseLeave);
    wrap.addEventListener('click', handleImageClick, true);
  }
}

initColorPicker();
