// preview-lottie.js — Lottie animation preview
import { state, hideAllPreviews } from './main.js';
import { infoItem } from './preview-image.js';

export var lottieABLoop = { a: null, b: null, active: false };
var isScrubbing = false;

function fileToDataUrl(file) { return new Promise(function(r) { var rd = new FileReader(); rd.onload = function() { r(rd.result); }; rd.readAsDataURL(file); }); }

function countLottieLayers(layers) {
  if (!layers) return 0;
  var count = layers.length;
  for (var i = 0; i < layers.length; i++) {
    if (layers[i].layers) {
      count += countLottieLayers(layers[i].layers);
    }
  }
  return count;
}

function checkLottieExpressions(animData) {
  var jsonStr = JSON.stringify(animData);
  var matches = jsonStr.match(/"x"\s*:\s*"(?:[^"\\]|\\.)*"/g) || [];
  return matches.length;
}

async function injectExternalImages(animData, imagesMap) {
  if (!animData.assets) return;
  for (var i = 0; i < animData.assets.length; i++) { var asset = animData.assets[i]; if (!asset.p) continue; var imgFile = imagesMap.get(asset.p); if (imgFile) { asset.p = await fileToDataUrl(imgFile); asset.u = ''; asset.e = 1; } }
}

export async function playJson(jsonPath) {
  var modeState = state.modeState;
  var fileMap = state.fileMap;
  var animGroups = state.animGroups;

  modeState['lottie'].activeFile = jsonPath;
  document.querySelectorAll('.tree-item').forEach(function(el) { el.classList.toggle('active', el.title === jsonPath); });
  var file = fileMap.get(jsonPath); if (!file) return;
  var animData; try { animData = JSON.parse(await file.text()); } catch (e) { alert('JSON error: ' + e.message); return; }
  var group = animGroups.find(function(g) { return g.jsonPath === jsonPath; });
  if (group && group.images.size > 0) await injectExternalImages(animData, group.images);

  var lottiePlayer = document.getElementById('lottie-player');
  var previewLottie = document.getElementById('preview-lottie');
  var controls = document.getElementById('controls');
  var infoBadge = document.getElementById('info-badge');
  var progressFill = document.getElementById('progress-fill');
  var progressTime = document.getElementById('progress-time');

  if (state.anim) { state.anim.destroy(); state.anim = null; }
  cancelAnimationFrame(state.progressRAF); lottiePlayer.innerHTML = '';
  hideAllPreviews(); previewLottie.classList.remove('hidden'); controls.classList.remove('hidden');
  state.anim = window.lottie.loadAnimation({ container: lottiePlayer, renderer: 'svg', loop: state.isLooping, autoplay: true, animationData: animData });
  state.isPlaying = true; document.getElementById('btn-play').innerHTML = '&#9208;';
  document.getElementById('btn-loop').classList.toggle('active', state.isLooping);
  var fps = animData.fr || 30;
  infoBadge.style.display = '';
  infoBadge.textContent = Math.round(state.anim.totalFrames) + ' frames  ·  ' + fps + ' fps  ·  ' + (state.anim.totalFrames / fps).toFixed(1) + 's';
  // Reset Lottie A-B loop
  lottieABLoop.a = null;
  lottieABLoop.b = null;
  lottieABLoop.active = false;
  updateLottieABUI();

  updateProgress();

  // Populate Lottie Diagnostics Panel
  var totalLayers = countLottieLayers(animData.layers);
  var expressionCount = checkLottieExpressions(animData);
  var imageAssets = animData.assets ? animData.assets.filter(function(a) { return !!a.p; }) : [];
  var lottieInfoPanel = document.getElementById('lottie-info-panel');
  if (lottieInfoPanel) {
    var html = '';
    html += infoItem('尺寸', (animData.w || 0) + ' × ' + (animData.h || 0) + ' px');
    html += infoItem('时长', (state.anim.totalFrames / fps).toFixed(2) + 's');
    html += infoItem('总帧数', Math.round(state.anim.totalFrames));
    html += infoItem('帧率', fps + ' fps');
    html += infoItem('Bodymovin版本', animData.v || '未知');
    html += infoItem('总图层数', totalLayers);
    if (imageAssets.length > 0) {
      var statusText = (group && group.images.size > 0) ? '已关联' : '未关联/缺失';
      var statusColor = (group && group.images.size > 0) ? 'var(--accent)' : 'var(--destructive)';
      html += infoItem('外部图片', imageAssets.length + ' 张 (<span style="color:' + statusColor + '">' + statusText + '</span>)');
    }
    if (expressionCount > 0) {
      html += infoItem('表达式', '<span style="color:var(--amber); font-weight:600;">有 (' + expressionCount + ' 处表达式，可能影响运行性能) ⚠️</span>');
    } else {
      html += infoItem('表达式', '无');
    }
    lottieInfoPanel.innerHTML = html;
  }
}

export function updateProgress() {
  var progressFill = document.getElementById('progress-fill');
  var progressTime = document.getElementById('progress-time');
  if (!state.anim) return;

  // Lottie A-B loop enforcement
  if (lottieABLoop.active && lottieABLoop.a !== null && lottieABLoop.b !== null && !isScrubbing) {
    var currentFr = state.anim.currentFrame;
    if (currentFr >= lottieABLoop.b || currentFr < lottieABLoop.a) {
      state.anim.goToAndPlay(lottieABLoop.a, true);
    }
  }

  progressFill.style.width = (state.anim.totalFrames > 0 ? (state.anim.currentFrame / state.anim.totalFrames * 100) : 0) + '%';
  progressTime.textContent = Math.round(state.anim.currentFrame) + ' / ' + Math.round(state.anim.totalFrames);
  state.progressRAF = requestAnimationFrame(updateProgress);
}

export function togglePlay() {
  if (!state.anim) return;
  if (state.isPlaying) { state.anim.pause(); state.isPlaying = false; document.getElementById('btn-play').innerHTML = '&#9654;'; cancelAnimationFrame(state.progressRAF); }
  else { state.anim.play(); state.isPlaying = true; document.getElementById('btn-play').innerHTML = '&#9208;'; updateProgress(); }
}

export function stopAnim() {
  var progressFill = document.getElementById('progress-fill');
  var progressTime = document.getElementById('progress-time');
  if (!state.anim) return;
  state.anim.stop(); state.isPlaying = false; document.getElementById('btn-play').innerHTML = '&#9654;';
  progressFill.style.width = '0%'; progressTime.textContent = '0 / ' + Math.round(state.anim.totalFrames);
  cancelAnimationFrame(state.progressRAF);
}

export function toggleLoop() { state.isLooping = !state.isLooping; document.getElementById('btn-loop').classList.toggle('active', state.isLooping); if (state.anim) state.anim.loop = state.isLooping; }

export function changeSpeed(val) { if (state.anim) state.anim.setSpeed(parseFloat(val)); }

export function seekAnim(e) {
  if (!state.anim) return;
  var rect = e.currentTarget.getBoundingClientRect();
  var ratio = (e.clientX - rect.left) / rect.width;
  var frame = Math.round(ratio * state.anim.totalFrames);
  
  if (state.isPlaying) {
    state.anim.goToAndPlay(frame, true);
  } else {
    state.anim.goToAndStop(frame, true);
    var progressFill = document.getElementById('progress-fill');
    var progressTime = document.getElementById('progress-time');
    if (progressFill) progressFill.style.width = (ratio * 100) + '%';
    if (progressTime) progressTime.textContent = frame + ' / ' + Math.round(state.anim.totalFrames);
  }
}

export function setBg(color, el) {
  document.querySelectorAll('.bg-dot').forEach(function(d) { d.classList.remove('active'); }); el.classList.add('active');
  var lottiePlayer = document.getElementById('lottie-player');
  var target = state.currentMode === 'lottie' ? lottiePlayer : document.querySelector('.img-preview-wrap');
  target.style.background = color === 'checker' ? 'repeating-conic-gradient(#e7e5e4 0% 25%, #fff 0% 50%) 50% / 20px 20px' : color;
}

export function stepFrame(dir) {
  if (!state.anim) return;
  
  if (state.isPlaying) {
    state.anim.pause();
    state.isPlaying = false;
    var btnPlay = document.getElementById('btn-play');
    if (btnPlay) btnPlay.innerHTML = '&#9654;';
    cancelAnimationFrame(state.progressRAF);
  }
  
  var totalFr = state.anim.totalFrames;
  var currentFr = state.anim.currentFrame;
  var nextFr = currentFr + dir;
  if (nextFr < 0) nextFr = totalFr - 1;
  if (nextFr >= totalFr) nextFr = 0;
  
  state.anim.goToAndStop(nextFr, true);
  
  var progressFill = document.getElementById('progress-fill');
  var progressTime = document.getElementById('progress-time');
  if (progressFill) progressFill.style.width = (totalFr > 0 ? (nextFr / totalFr * 100) : 0) + '%';
  if (progressTime) progressTime.textContent = Math.round(nextFr) + ' / ' + Math.round(totalFr);
}

export function updateLottieABUI() {
  var btnA = document.getElementById('btn-ab-a');
  var btnB = document.getElementById('btn-ab-b');
  var loopRange = document.getElementById('progress-loop-range');
  
  if (!btnA || !btnB || !loopRange) return;
  
  btnA.classList.toggle('active', lottieABLoop.a !== null);
  btnB.classList.toggle('active', lottieABLoop.b !== null);
  
  btnA.textContent = lottieABLoop.a !== null ? 'A: ' + Math.round(lottieABLoop.a) : 'A';
  btnB.textContent = lottieABLoop.b !== null ? 'B: ' + Math.round(lottieABLoop.b) : 'B';
  
  if (lottieABLoop.a !== null && lottieABLoop.b !== null && state.anim && state.anim.totalFrames) {
    var left = (lottieABLoop.a / state.anim.totalFrames) * 100;
    var width = ((lottieABLoop.b - lottieABLoop.a) / state.anim.totalFrames) * 100;
    loopRange.style.left = left + '%';
    loopRange.style.width = width + '%';
    loopRange.classList.remove('hidden');
  } else {
    loopRange.classList.add('hidden');
    loopRange.style.left = '0%';
    loopRange.style.width = '0%';
  }
}

function handleScrub(e) {
  if (!state.anim || state.currentMode !== 'lottie') return;
  var progressBar = document.getElementById('progress-bar');
  if (!progressBar) return;
  var rect = progressBar.getBoundingClientRect();
  var ratio = (e.clientX - rect.left) / rect.width;
  ratio = Math.max(0, Math.min(1, ratio));
  var frame = Math.round(ratio * state.anim.totalFrames);

  state.anim.goToAndStop(frame, true);
  
  if (state.isPlaying) {
    state.isPlaying = false;
    var btnPlay = document.getElementById('btn-play');
    if (btnPlay) btnPlay.innerHTML = '&#9654;';
  }

  var progressFill = document.getElementById('progress-fill');
  var progressTime = document.getElementById('progress-time');
  if (progressFill) progressFill.style.width = (ratio * 100) + '%';
  if (progressTime) progressTime.textContent = frame + ' / ' + Math.round(state.anim.totalFrames);
}

// Global window event listeners for scrubbing
window.addEventListener('mousemove', function(e) {
  if (isScrubbing) {
    handleScrub(e);
  }
});

window.addEventListener('mouseup', function() {
  isScrubbing = false;
});

function initLottieControls() {
  var progressBar = document.getElementById('progress-bar');
  if (progressBar) {
    progressBar.addEventListener('mousedown', function(e) {
      if (state.currentMode !== 'lottie') return;
      isScrubbing = true;
      handleScrub(e);
    });
  }

  var btnPrev = document.getElementById('btn-prev-frame');
  var btnNext = document.getElementById('btn-next-frame');
  if (btnPrev) btnPrev.addEventListener('click', function() { stepFrame(-1); });
  if (btnNext) btnNext.addEventListener('click', function() { stepFrame(1); });

  var btnAbA = document.getElementById('btn-ab-a');
  var btnAbB = document.getElementById('btn-ab-b');
  var btnAbClear = document.getElementById('btn-ab-clear');

  if (btnAbA) {
    btnAbA.addEventListener('click', function() {
      if (!state.anim) return;
      lottieABLoop.a = state.anim.currentFrame;
      if (lottieABLoop.b !== null && lottieABLoop.a >= lottieABLoop.b) {
        lottieABLoop.b = null;
      }
      lottieABLoop.active = (lottieABLoop.a !== null && lottieABLoop.b !== null);
      updateLottieABUI();
    });
  }

  if (btnAbB) {
    btnAbB.addEventListener('click', function() {
      if (!state.anim) return;
      lottieABLoop.b = state.anim.currentFrame;
      if (lottieABLoop.a !== null && lottieABLoop.b <= lottieABLoop.a) {
        var tmp = lottieABLoop.a;
        lottieABLoop.a = lottieABLoop.b;
        lottieABLoop.b = tmp;
      }
      lottieABLoop.active = (lottieABLoop.a !== null && lottieABLoop.b !== null);
      updateLottieABUI();
    });
  }

  if (btnAbClear) {
    btnAbClear.addEventListener('click', function() {
      lottieABLoop.a = null;
      lottieABLoop.b = null;
      lottieABLoop.active = false;
      updateLottieABUI();
    });
  }

  window.addEventListener('keydown', function(e) {
    if (state.currentMode !== 'lottie' || !state.anim) return;
    var tag = document.activeElement.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || document.activeElement.isContentEditable) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepFrame(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepFrame(1);
    } else if (e.key === ' ') {
      e.preventDefault();
      togglePlay();
    }
  });
}

initLottieControls();

