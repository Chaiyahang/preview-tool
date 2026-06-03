// preview-image.js — Image preview functionality
import { parseExifData, parseEXIF, parseGIF, parseWebP, parsePNG, parsePAG, parsePAGAsync, parseHEIF } from './parsers.js';
import { state, hideAllPreviews } from './main.js';

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

  hideAllPreviews(); previewImage.classList.remove('hidden'); controls.classList.add('hidden');
  cleanupPAGView();
  var lower = filePath.toLowerCase();
  if (lower.endsWith('.pag')) {
    try { await renderPAGPreview(file, imgPreviewEl); }
    catch(e) { imgPreviewEl.src = ''; }
  } else if (lower.endsWith('.heic') || lower.endsWith('.heif')) {
    try { var blob = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 }); if (previewCallId !== thisCallId) return; imgPreviewEl.src = URL.createObjectURL(blob); }
    catch(e) { imgPreviewEl.src = ''; }
  } else { imgPreviewEl.src = URL.createObjectURL(file); }
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
    zoomScale = 1; zoomX = 0; zoomY = 0;
    overlay.classList.add('active');
    zoomLevel.textContent = '100%';
    applyTransform();
  }

  function closeZoom() { overlay.classList.remove('active'); zoomEl.src = ''; }

  function setZoom(s) {
    zoomScale = Math.max(0.1, Math.min(20, s));
    zoomLevel.textContent = Math.round(zoomScale * 100) + '%';
    applyTransform();
  }

  function applyTransform() { zoomEl.style.transform = 'translate(' + zoomX + 'px,' + zoomY + 'px) scale(' + zoomScale + ')'; }
}

initZoom();
