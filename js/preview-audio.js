// preview-audio.js — Audio preview with waveform visualization
import { state, hideAllPreviews } from './main.js';
import { formatSize, infoItem } from './preview-image.js';

var audioCtx = null;
var waveformRAF = null;
var audioBuffer = null;

function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function drawWaveform(canvas, buffer) {
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  var data = buffer.getChannelData(0);
  var step = Math.ceil(data.length / w);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(34,197,94,0.25)';
  ctx.strokeStyle = 'rgba(34,197,94,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (var i = 0; i < w; i++) {
    var min = 1, max = -1;
    for (var j = 0; j < step; j++) {
      var val = data[i * step + j];
      if (val === undefined) break;
      if (val < min) min = val;
      if (val > max) max = val;
    }
    var yMin = (1 + min) * h / 2;
    var yMax = (1 + max) * h / 2;
    ctx.fillRect(i, yMax, 1, yMin - yMax);
    if (i === 0) ctx.moveTo(i, (yMin + yMax) / 2);
    else ctx.lineTo(i, (yMin + yMax) / 2);
  }
  ctx.stroke();
}

function drawPlayhead(canvas, ratio) {
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  var x = ratio * w;
  ctx.clearRect(0, 0, w, h);
  if (audioBuffer) drawWaveform(canvas, audioBuffer);
  ctx.strokeStyle = '#F8FAFC';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, h);
  ctx.stroke();
}

function updatePlayhead() {
  var audio = document.getElementById('audio-player');
  var canvas = document.getElementById('audio-waveform');
  if (!audio || !canvas || !audio.duration) return;
  drawPlayhead(canvas, audio.currentTime / audio.duration);
  if (!audio.paused) waveformRAF = requestAnimationFrame(updatePlayhead);
}

export async function showAudioPreview(filePath) {
  var fileMap = state.fileMap;
  var modeState = state.modeState;
  modeState[state.currentMode].activeFile = filePath;
  document.querySelectorAll('.tree-item').forEach(function(el) { el.classList.toggle('active', el.title === filePath); });
  var file = fileMap.get(filePath); if (!file) return;

  var previewAudio = document.getElementById('preview-audio');
  var audioPlayer = document.getElementById('audio-player');
  var canvas = document.getElementById('audio-waveform');
  var infoPanel = document.getElementById('audio-info-panel');
  var infoBadge = document.getElementById('info-badge');

  hideAllPreviews(); previewAudio.classList.remove('hidden');
  document.getElementById('controls').classList.add('hidden');

  cancelAnimationFrame(waveformRAF);
  audioPlayer.pause();
  var url = URL.createObjectURL(file);
  audioPlayer.src = url;
  audioPlayer.load();
  infoBadge.style.display = '';
  infoBadge.textContent = file.name;

  var rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = Math.floor(rect.width) || 800;
  canvas.height = 160;

  try {
    var ctx = getAudioContext();
    var arrayBuf = await file.arrayBuffer();
    audioBuffer = await ctx.decodeAudioData(arrayBuf);
    drawWaveform(canvas, audioBuffer);

    var ext = (file.name.split('.').pop() || '').toUpperCase();
    var html = '';
    html += infoItem('Filename', file.name);
    html += infoItem('Format', ext);
    html += infoItem('Duration', audioBuffer.duration.toFixed(1) + 's');
    html += infoItem('Sample Rate', (audioBuffer.sampleRate / 1000).toFixed(1) + ' kHz');
    html += infoItem('Channels', audioBuffer.numberOfChannels === 1 ? 'Mono' : (audioBuffer.numberOfChannels === 2 ? 'Stereo' : audioBuffer.numberOfChannels + 'ch'));
    html += infoItem('File Size', formatSize(file.size));
    infoPanel.innerHTML = html;
    infoBadge.textContent = ext + ' · ' + audioBuffer.duration.toFixed(1) + 's · ' + (audioBuffer.sampleRate / 1000).toFixed(1) + 'kHz · ' + (audioBuffer.numberOfChannels === 1 ? 'Mono' : 'Stereo');
  } catch(e) {
    infoPanel.innerHTML = infoItem('Filename', file.name) + infoItem('File Size', formatSize(file.size));
  }

  audioPlayer.onplay = function() { updatePlayhead(); };
  audioPlayer.onpause = function() { cancelAnimationFrame(waveformRAF); };
  audioPlayer.onseeked = function() { if (audioBuffer) drawPlayhead(canvas, audioPlayer.currentTime / audioPlayer.duration); };
  canvas.onclick = function(e) {
    if (!audioPlayer.duration) return;
    var r = canvas.getBoundingClientRect();
    audioPlayer.currentTime = ((e.clientX - r.left) / r.width) * audioPlayer.duration;
    if (audioBuffer) drawPlayhead(canvas, audioPlayer.currentTime / audioPlayer.duration);
  };
}

export function cleanupAudio() {
  cancelAnimationFrame(waveformRAF);
  audioBuffer = null;
  var audioPlayer = document.getElementById('audio-player');
  if (audioPlayer) { audioPlayer.pause(); audioPlayer.src = ''; }
}
