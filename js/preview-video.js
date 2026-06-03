// preview-video.js — Video preview functionality
import { state, hideAllPreviews } from './main.js';
import { formatSize, infoItem } from './preview-image.js';

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
  videoPlayer.onloadedmetadata = function() {
    var html = '';
    html += infoItem('Filename', file.name);
    html += infoItem('Format', (file.name.split('.').pop() || '').toUpperCase());
    html += infoItem('Resolution', videoPlayer.videoWidth + ' × ' + videoPlayer.videoHeight + ' px');
    html += infoItem('Duration', formatDuration(videoPlayer.duration));
    html += infoItem('File Size', formatSize(file.size));
    videoInfoPanel.innerHTML = html;
    infoBadge.textContent = (file.name.split('.').pop() || '').toUpperCase() + ' · ' + videoPlayer.videoWidth + 'x' + videoPlayer.videoHeight + ' · ' + formatDuration(videoPlayer.duration);
  };
}
