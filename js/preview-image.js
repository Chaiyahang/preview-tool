// preview-image.js — Image preview functionality
import { parseExifData, parseEXIF, parseGIF, parseWebP, parsePNG, parsePAG, parsePAGAsync, parseHEIF } from './parsers.js';
import { state, hideAllPreviews } from './main.js';

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

export function reverseGeocode(lat, lng) {
  fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=16&accept-language=zh')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var el = document.getElementById('gps-location-text');
      if (el && d.display_name) { el.textContent = d.display_name; }
    }).catch(function() {});
}

export async function analyzeImage(file) {
  var info = { format: 'Unknown', width: 0, height: 0, animated: false, frames: 0, duration: 0,
    aspectRatio: '', megapixels: 0, compression: '', hasAlpha: false, colorType: '', bitDepth: 0, loopCount: -1, gifVersion: '',
    gps: null, camera: '', dateTime: '' };
  var name = file.name.toLowerCase(); var buffer = await file.arrayBuffer(); var bytes = new Uint8Array(buffer);
  if (name.endsWith('.gif') || (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)) { info.format = 'GIF'; parseGIF(bytes, info); }
  else if (name.endsWith('.webp') || (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)) { info.format = 'WebP'; parseWebP(bytes, info); }
  else if (name.endsWith('.png') || name.endsWith('.apng') || (bytes[0] === 0x89 && bytes[1] === 0x50)) { info.format = 'PNG'; parsePNG(bytes, info); }
  else if (name.endsWith('.jpg') || name.endsWith('.jpeg')) { info.format = 'JPEG'; parseEXIF(bytes, info); await getDimensions(file, info); }
  else if (name.endsWith('.tiff') || name.endsWith('.tif') || (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) || (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A)) { info.format = 'TIFF'; parseExifData(bytes, info); await getDimensions(file, info); }
  else if (name.endsWith('.heic') || name.endsWith('.heif') || name.endsWith('.avif')) { info.format = name.endsWith('.avif') ? 'AVIF' : 'HEIC'; parseHEIF(bytes, info); }
  else if (name.endsWith('.pag')) { info.format = 'PAG'; parsePAG(bytes, info); await parsePAGAsync(buffer, info); }
  if (info.width === 0) await getDimensions(file, info);
  if (info.width && info.height) { info.aspectRatio = formatAspectRatio(info.width, info.height); info.megapixels = parseFloat((info.width * info.height / 1000000).toFixed(2)); }
  return info;
}

export async function showImagePreview(filePath) {
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
    try { var blob = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 }); imgPreviewEl.src = URL.createObjectURL(blob); }
    catch(e) { imgPreviewEl.src = ''; }
  } else { imgPreviewEl.src = URL.createObjectURL(file); }
  var info = await analyzeImage(file);
  infoBadge.style.display = '';
  infoBadge.textContent = info.format + (info.animated ? ' (Animated)' : '') + '  ·  ' + info.width + 'x' + info.height;
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
  if (info.gps) {
    var amapUrl = 'https://uri.amap.com/marker?position=' + info.gps.lng + ',' + info.gps.lat + '&name=' + encodeURIComponent('拍摄位置');
    html += infoItem('Location', '<span id="gps-location-text">' + info.gps.lat.toFixed(6) + ', ' + info.gps.lng.toFixed(6) + '</span> <a href="' + amapUrl + '" target="_blank" style="color:var(--accent);text-decoration:none;margin-left:6px">高德地图 ↗</a>');
    reverseGeocode(info.gps.lat, info.gps.lng);
  }
  imgInfoPanel.innerHTML = html;
}

async function renderPAGPreview(file, imgEl) {
  if (!window.libpag) { imgEl.src = ''; return; }
  cleanupPAGView();
  var PAG = await window.libpag.PAGInit({
    locateFile: function(f) { return 'https://cdn.jsdelivr.net/npm/libpag@4.2.81/lib/' + f; }
  });
  var buffer = await file.arrayBuffer();
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
  if (activePAGView) { activePAGView.stop(); activePAGView.destroy(); activePAGView = null; }
  if (activePAGFile) { activePAGFile.destroy(); activePAGFile = null; }
  var oldCanvas = document.getElementById('pag-canvas');
  if (oldCanvas) oldCanvas.remove();
  var imgEl = document.getElementById('img-preview-el');
  if (imgEl) imgEl.style.display = '';
}
