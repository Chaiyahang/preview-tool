// preview-audio.js — Audio preview with waveform visualization
import { state, hideAllPreviews } from './main.js';
import { formatSize, infoItem } from './preview-image.js';

var audioCtx = null;
var waveformRAF = null;
var audioBuffer = null;
var abLoop = { a: null, b: null, active: false };

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

  // Draw A-B loop region
  if (abLoop.a !== null && abLoop.b !== null) {
    var duration = buffer.duration;
    var xA = (abLoop.a / duration) * w;
    var xB = (abLoop.b / duration) * w;
    ctx.fillStyle = 'rgba(251,191,36,0.1)';
    ctx.fillRect(xA, 0, xB - xA, h);
    ctx.strokeStyle = 'rgba(251,191,36,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(xA, 0); ctx.lineTo(xA, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xB, 0); ctx.lineTo(xB, h); ctx.stroke();
    ctx.setLineDash([]);
  }

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

  // A-B loop enforcement
  if (abLoop.active && abLoop.a !== null && abLoop.b !== null) {
    if (audio.currentTime >= abLoop.b) {
      audio.currentTime = abLoop.a;
    }
  }

  drawPlayhead(canvas, audio.currentTime / audio.duration);
  if (!audio.paused) waveformRAF = requestAnimationFrame(updatePlayhead);
}

function estimateBitrate(file, duration) {
  if (!duration || duration <= 0) return null;
  return Math.round((file.size * 8) / duration / 1000);
}

function buildControls() {
  var wrap = document.getElementById('audio-controls');
  if (wrap) return;
  var container = document.getElementById('preview-audio');
  wrap = document.createElement('div');
  wrap.id = 'audio-controls';
  wrap.className = 'audio-controls-bar';
  wrap.innerHTML =
    '<div class="audio-ctrl-group">' +
      '<label class="audio-ctrl-label">Speed</label>' +
      '<select id="audio-speed" class="audio-ctrl-select">' +
        '<option value="0.5">0.5x</option>' +
        '<option value="0.75">0.75x</option>' +
        '<option value="1" selected>1x</option>' +
        '<option value="1.25">1.25x</option>' +
        '<option value="1.5">1.5x</option>' +
        '<option value="2">2x</option>' +
      '</select>' +
    '</div>' +
    '<div class="audio-ctrl-group">' +
      '<label class="audio-ctrl-label">Loop</label>' +
      '<button id="audio-ab-a" class="audio-ctrl-btn" title="Set A point">A</button>' +
      '<button id="audio-ab-b" class="audio-ctrl-btn" title="Set B point">B</button>' +
      '<button id="audio-ab-clear" class="audio-ctrl-btn audio-ctrl-btn-dim" title="Clear A-B loop">✕</button>' +
    '</div>';
  var player = document.getElementById('audio-player');
  container.insertBefore(wrap, player.nextSibling);

  document.getElementById('audio-speed').addEventListener('change', function(e) {
    var audio = document.getElementById('audio-player');
    audio.playbackRate = parseFloat(e.target.value);
  });
  document.getElementById('audio-ab-a').addEventListener('click', function() {
    var audio = document.getElementById('audio-player');
    abLoop.a = audio.currentTime;
    abLoop.active = (abLoop.a !== null && abLoop.b !== null);
    updateABButtons();
    if (audioBuffer) drawPlayhead(document.getElementById('audio-waveform'), audio.currentTime / audio.duration);
  });
  document.getElementById('audio-ab-b').addEventListener('click', function() {
    var audio = document.getElementById('audio-player');
    abLoop.b = audio.currentTime;
    if (abLoop.a !== null && abLoop.b < abLoop.a) { var tmp = abLoop.a; abLoop.a = abLoop.b; abLoop.b = tmp; }
    abLoop.active = (abLoop.a !== null && abLoop.b !== null);
    updateABButtons();
    if (audioBuffer) drawPlayhead(document.getElementById('audio-waveform'), audio.currentTime / audio.duration);
  });
  document.getElementById('audio-ab-clear').addEventListener('click', function() {
    abLoop.a = null; abLoop.b = null; abLoop.active = false;
    updateABButtons();
    var audio = document.getElementById('audio-player');
    if (audioBuffer && audio.duration) drawPlayhead(document.getElementById('audio-waveform'), audio.currentTime / audio.duration);
  });
}

function updateABButtons() {
  var btnA = document.getElementById('audio-ab-a');
  var btnB = document.getElementById('audio-ab-b');
  if (!btnA || !btnB) return;
  btnA.classList.toggle('audio-ctrl-btn-active', abLoop.a !== null);
  btnB.classList.toggle('audio-ctrl-btn-active', abLoop.b !== null);
  btnA.textContent = abLoop.a !== null ? 'A ' + fmtTime(abLoop.a) : 'A';
  btnB.textContent = abLoop.b !== null ? 'B ' + fmtTime(abLoop.b) : 'B';
}

function fmtTime(sec) {
  var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
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
  audioPlayer.playbackRate = 1;
  infoBadge.style.display = '';
  infoBadge.textContent = file.name;

  // Reset A-B loop
  abLoop.a = null; abLoop.b = null; abLoop.active = false;

  buildControls();
  var speedSelect = document.getElementById('audio-speed');
  if (speedSelect) speedSelect.value = '1';
  updateABButtons();

  var rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = Math.floor(rect.width) || 800;
  canvas.height = 160;

  try {
    var ctx = getAudioContext();
    var arrayBuf = await file.arrayBuffer();
    audioBuffer = await ctx.decodeAudioData(arrayBuf);
    drawWaveform(canvas, audioBuffer);

    var ext = (file.name.split('.').pop() || '').toUpperCase();
    var bitrate = estimateBitrate(file, audioBuffer.duration);
    var html = '';
    html += infoItem('Filename', file.name);
    html += infoItem('Format', ext);
    html += infoItem('Duration', audioBuffer.duration.toFixed(1) + 's');
    html += infoItem('Sample Rate', (audioBuffer.sampleRate / 1000).toFixed(1) + ' kHz');
    html += infoItem('Channels', audioBuffer.numberOfChannels === 1 ? 'Mono' : (audioBuffer.numberOfChannels === 2 ? 'Stereo' : audioBuffer.numberOfChannels + 'ch'));
    if (bitrate) html += infoItem('Bitrate', bitrate + ' kbps');
    html += infoItem('File Size', formatSize(file.size));
    infoPanel.innerHTML = html;
    infoBadge.textContent = ext + ' · ' + audioBuffer.duration.toFixed(1) + 's · ' + (bitrate ? bitrate + 'kbps · ' : '') + (audioBuffer.sampleRate / 1000).toFixed(1) + 'kHz · ' + (audioBuffer.numberOfChannels === 1 ? 'Mono' : 'Stereo');
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
  abLoop.a = null; abLoop.b = null; abLoop.active = false;
  var audioPlayer = document.getElementById('audio-player');
  if (audioPlayer) { audioPlayer.pause(); audioPlayer.src = ''; }
  var ctrl = document.getElementById('audio-controls');
  if (ctrl) ctrl.remove();
}
