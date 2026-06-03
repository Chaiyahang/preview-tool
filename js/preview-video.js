// preview-video.js — Video preview functionality
import { state, hideAllPreviews } from './main.js';
import { formatSize, infoItem, reverseGeocode } from './preview-image.js';
import { parseMP4Location } from './parsers.js';

function formatDuration(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '—';
  var h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
  if (h > 0) return h + ':' + ('0' + m).slice(-2) + ':' + ('0' + s).slice(-2);
  return m + ':' + ('0' + s).slice(-2);
}

export async function showVideoPreview(filePath) {
  var currentMode = state.currentMode;
  var fileMap = state.fileMap;
  var modeState = state.modeState;
  modeState[currentMode].activeFile = filePath;
  document.querySelectorAll('.tree-item').forEach(function(el) { el.classList.toggle('active', el.title === filePath); });
  var file = fileMap.get(filePath); if (!file) return;

  var previewVideo = document.getElementById('preview-video');
  var videoPlayer = document.getElementById('video-player');
  var videoInfoPanel = document.getElementById('video-info-panel');
  var infoBadge = document.getElementById('info-badge');
  var controls = document.getElementById('controls');

  hideAllPreviews(); previewVideo.classList.remove('hidden'); controls.classList.add('hidden');
  var url = URL.createObjectURL(file);
  videoPlayer.src = url;
  videoPlayer.style.display = '';
  infoBadge.style.display = '';
  infoBadge.textContent = file.name + ' · ' + formatSize(file.size);

  var videoMeta = null;
  try {
    var buffer = await file.arrayBuffer();
    var bytes = new Uint8Array(buffer);
    videoMeta = parseMP4Location(bytes);
  } catch(e) {}

  videoPlayer.onloadedmetadata = function() {
    var html = '';
    html += infoItem('Filename', file.name);
    html += infoItem('Format', (file.name.split('.').pop() || '').toUpperCase());
    html += infoItem('Resolution', videoPlayer.videoWidth + ' × ' + videoPlayer.videoHeight + ' px');
    html += infoItem('Duration', formatDuration(videoPlayer.duration));
    html += infoItem('File Size', formatSize(file.size));
    if (videoMeta && videoMeta.creationDate) {
      html += infoItem('Creation Date', videoMeta.creationDate);
    }
    if (videoMeta && videoMeta.gps) {
      var amapUrl = 'https://uri.amap.com/marker?position=' + videoMeta.gps.lng + ',' + videoMeta.gps.lat + '&name=' + encodeURIComponent('拍摄位置');
      html += infoItem('Location', '<span id="video-gps-location-text">' + videoMeta.gps.lat.toFixed(6) + ', ' + videoMeta.gps.lng.toFixed(6) + '</span> <a href="' + amapUrl + '" target="_blank" style="color:var(--accent);text-decoration:none;margin-left:6px">高德地图 ↗</a>');
    }
    videoInfoPanel.innerHTML = html;
    infoBadge.textContent = (file.name.split('.').pop() || '').toUpperCase() + ' · ' + videoPlayer.videoWidth + 'x' + videoPlayer.videoHeight + ' · ' + formatDuration(videoPlayer.duration);
    if (videoMeta && videoMeta.gps) {
      reverseGeocode(videoMeta.gps.lat, videoMeta.gps.lng, 'video-gps-location-text');
    }
  };
}
