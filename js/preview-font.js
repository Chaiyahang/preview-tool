// preview-font.js — Font preview logic
import { state, hideAllPreviews } from './main.js';
import { formatSize } from './preview-image.js';

var activeFontUrl = null;
var activeStyleElement = null;

export function cleanupFontPreview() {
  var fontPreviewWrap = document.getElementById('font-preview-wrap');
  if (fontPreviewWrap) {
    fontPreviewWrap.classList.add('hidden');
  }
  if (activeFontUrl) {
    URL.revokeObjectURL(activeFontUrl);
    activeFontUrl = null;
  }
  if (activeStyleElement) {
    activeStyleElement.remove();
    activeStyleElement = null;
  }
}

function getFontFormat(name) {
  var lower = name.toLowerCase();
  if (lower.endsWith('.ttf')) return 'truetype';
  if (lower.endsWith('.otf')) return 'opentype';
  if (lower.endsWith('.woff')) return 'woff';
  if (lower.endsWith('.woff2')) return 'woff2';
  return '';
}

export async function showFontPreview(file) {
  var fileMap = state.fileMap;
  var modeState = state.modeState;
  var currentMode = state.currentMode;
  var filePath = Array.from(fileMap.keys()).find(function(k) { return fileMap.get(k) === file; }) || file.name;
  modeState[currentMode].activeFile = filePath;
  document.querySelectorAll('.tree-item').forEach(function(el) { el.classList.toggle('active', el.title === filePath); });

  var previewFont = document.getElementById('preview-font');
  var fontPreviewHeader = document.getElementById('font-preview-header');
  var fontPreviewWrap = document.querySelector('#preview-font .font-preview-wrap');
  var infoBadge = document.getElementById('info-badge');
  var controls = document.getElementById('controls');

  hideAllPreviews();
  previewFont.classList.remove('hidden');
  controls.classList.add('hidden');

  infoBadge.style.display = '';
  infoBadge.textContent = file.name + ' · ' + formatSize(file.size);

  if (fontPreviewWrap) fontPreviewWrap.classList.remove('hidden');

  // 1. clean up existing font URL and style element
  if (activeFontUrl) {
    URL.revokeObjectURL(activeFontUrl);
  }
  if (activeStyleElement) {
    activeStyleElement.remove();
  }

  // 2. Load font dynamically
  activeFontUrl = URL.createObjectURL(file);
  var fontId = 'font-' + Date.now();
  var format = getFontFormat(file.name);

  activeStyleElement = document.createElement('style');
  activeStyleElement.id = 'style-' + fontId;
  activeStyleElement.textContent = '\n' +
    '@font-face {\n' +
    '  font-family: "' + fontId + '";\n' +
    '  src: url("' + activeFontUrl + '") format("' + format + '");\n' +
    '}\n';
  document.head.appendChild(activeStyleElement);

  // 3. Render header information
  var headerHtml = '';
  headerHtml += '<span class="fph-item"><span class="fph-label">Name:</span><span class="fph-value">' + file.name + '</span></span>';
  headerHtml += '<span class="fph-item"><span class="fph-label">Size:</span><span class="fph-value">' + formatSize(file.size) + '</span></span>';
  headerHtml += '<span class="fph-item"><span class="fph-label">Format:</span><span class="fph-value" style="color:var(--accent)">' + format.toUpperCase() + '</span></span>';
  if (fontPreviewHeader) fontPreviewHeader.innerHTML = headerHtml;

  var fontTitleText = document.getElementById('font-title-text');
  if (fontTitleText) {
    fontTitleText.textContent = file.name;
  }

  // 4. Populate specimens
  var container = document.getElementById('font-specimens-container');
  var input = document.getElementById('font-specimen-input');
  var slider = document.getElementById('font-size-slider');
  var label = document.getElementById('font-size-label');

  var baseSizes = [12, 16, 20, 28, 36, 48, 72];
  var currentText = input.value || "The quick brown fox jumps over the lazy dog. 1234567890 汉字测试 零一二三四五六七八九十";
  var sliderVal = parseInt(slider.value, 10) || 36;
  label.textContent = sliderVal + 'px';
  var scale = sliderVal / 36;

  container.innerHTML = '';
  baseSizes.forEach(function(baseSize) {
    var actualSize = Math.round(baseSize * scale);

    var line = document.createElement('div');
    line.className = 'font-specimen-line';
    line.setAttribute('data-base-size', baseSize);

    var meta = document.createElement('div');
    meta.className = 'font-specimen-meta';
    meta.textContent = actualSize + 'px';

    var textEl = document.createElement('div');
    textEl.className = 'font-specimen-text';
    textEl.style.fontFamily = '"' + fontId + '", sans-serif';
    textEl.style.fontSize = actualSize + 'px';
    textEl.textContent = currentText;

    line.appendChild(meta);
    line.appendChild(textEl);
    container.appendChild(line);
  });

  // 5. Wire up interactive inputs
  slider.oninput = function() {
    var val = parseInt(slider.value, 10);
    label.textContent = val + 'px';
    var sc = val / 36;
    var lines = container.querySelectorAll('.font-specimen-line');
    lines.forEach(function(line) {
      var bs = parseInt(line.getAttribute('data-base-size'), 10);
      var actSize = Math.round(bs * sc);
      line.querySelector('.font-specimen-meta').textContent = actSize + 'px';
      line.querySelector('.font-specimen-text').style.fontSize = actSize + 'px';
    });
  };

  input.oninput = function() {
    var text = input.value || "The quick brown fox jumps over the lazy dog. 1234567890 汉字测试 零一二三四五六七八九十";
    var texts = container.querySelectorAll('.font-specimen-text');
    texts.forEach(function(tEl) {
      tEl.textContent = text;
    });
  };
}
