// preview-lottie.js — Lottie animation preview
import { state, hideAllPreviews } from './main.js';

function fileToDataUrl(file) { return new Promise(function(r) { var rd = new FileReader(); rd.onload = function() { r(rd.result); }; rd.readAsDataURL(file); }); }

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
  updateProgress();
}

export function updateProgress() {
  var progressFill = document.getElementById('progress-fill');
  var progressTime = document.getElementById('progress-time');
  if (!state.anim) return;
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
  state.anim.goToAndPlay(Math.round((e.clientX - rect.left) / rect.width * state.anim.totalFrames), true);
  state.isPlaying = true; document.getElementById('btn-play').innerHTML = '&#9208;'; updateProgress();
}

export function setBg(color, el) {
  document.querySelectorAll('.bg-dot').forEach(function(d) { d.classList.remove('active'); }); el.classList.add('active');
  var lottiePlayer = document.getElementById('lottie-player');
  var target = state.currentMode === 'lottie' ? lottiePlayer : document.querySelector('.img-preview-wrap');
  target.style.background = color === 'checker' ? 'repeating-conic-gradient(#e7e5e4 0% 25%, #fff 0% 50%) 50% / 20px 20px' : color;
}
