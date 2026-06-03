// preview-file.js — File, PDF, EPUB preview
import { state, hideAllPreviews } from './main.js';
import { formatSize, infoItem } from './preview-image.js';

function isBinary(buffer) {
  var bytes = new Uint8Array(buffer).slice(0, 512);
  var nonPrintable = 0;
  for (var i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) return true;
    if (bytes[i] < 0x09 || (bytes[i] > 0x0D && bytes[i] < 0x20)) nonPrintable++;
  }
  return nonPrintable > bytes.length * 0.1;
}

function hexDump(buffer) {
  var bytes = new Uint8Array(buffer), lines = [], maxRows = 5000;
  var limit = Math.min(bytes.length, maxRows * 16);
  for (var offset = 0; offset < limit; offset += 16) {
    var hex = '', ascii = '';
    for (var j = 0; j < 16; j++) {
      if (offset + j < bytes.length) {
        var b = bytes[offset + j];
        hex += (b < 16 ? '0' : '') + b.toString(16) + ' ';
        ascii += (b >= 0x20 && b < 0x7F) ? String.fromCharCode(b) : '.';
      } else { hex += '   '; ascii += ' '; }
    }
    lines.push('<span class="hex-line"><span class="hex-offset">' + ('00000000' + offset.toString(16)).slice(-8) + '</span><span class="hex-bytes">' + hex + '</span><span class="hex-ascii">|' + ascii + '|</span></span>');
  }
  if (bytes.length > limit) lines.push('<span class="hex-line" style="color:var(--text-muted)">... ' + (bytes.length - limit).toLocaleString() + ' more bytes</span>');
  return lines.join('\n');
}

export async function showDocPreview(file, type) {
  var fileMap = state.fileMap;
  var modeState = state.modeState;
  var currentMode = state.currentMode;
  modeState[currentMode].activeFile = Array.from(fileMap.keys()).find(function(k) { return fileMap.get(k) === file; }) || file.name;
  document.querySelectorAll('.tree-item').forEach(function(el) { el.classList.toggle('active', el.title === modeState[currentMode].activeFile); });

  var previewDoc = document.getElementById('preview-doc');
  var docIframe = document.getElementById('doc-iframe');
  var docEmbed = document.getElementById('doc-embed');
  var docInfoHeader = document.getElementById('doc-info-header');
  var infoBadge = document.getElementById('info-badge');
  var controls = document.getElementById('controls');

  hideAllPreviews(); previewDoc.classList.remove('hidden'); controls.classList.add('hidden');
  infoBadge.style.display = '';
  infoBadge.textContent = file.name + ' · ' + formatSize(file.size);
  docIframe.style.display = 'none';
  docIframe.srcdoc = '';
  docEmbed.style.display = 'none';
  docEmbed.data = '';
  var container = document.getElementById('preview-doc');
  var oldIframe = container.querySelector('.pdf-iframe');
  if (oldIframe) oldIframe.remove();
  var pdfIframe = document.createElement('iframe');
  pdfIframe.className = 'pdf-iframe';
  pdfIframe.style.cssText = 'flex:1;width:100%;border:none;background:#fff';
  pdfIframe.src = URL.createObjectURL(file);
  container.appendChild(pdfIframe);
  var headerHtml = '';
  headerHtml += '<span class="fph-item"><span class="fph-label">Name:</span><span class="fph-value">' + file.name + '</span></span>';
  headerHtml += '<span class="fph-item"><span class="fph-label">Format:</span><span class="fph-value" style="color:var(--accent)">' + type.toUpperCase() + '</span></span>';
  headerHtml += '<span class="fph-item"><span class="fph-label">Size:</span><span class="fph-value">' + formatSize(file.size) + '</span></span>';
  docInfoHeader.innerHTML = headerHtml;
}

export async function showEpubPreview(file) {
  var fileMap = state.fileMap;
  var modeState = state.modeState;
  var currentMode = state.currentMode;
  modeState[currentMode].activeFile = Array.from(fileMap.keys()).find(function(k) { return fileMap.get(k) === file; }) || file.name;
  document.querySelectorAll('.tree-item').forEach(function(el) { el.classList.toggle('active', el.title === modeState[currentMode].activeFile); });

  var previewDoc = document.getElementById('preview-doc');
  var docIframe = document.getElementById('doc-iframe');
  var docEmbed = document.getElementById('doc-embed');
  var docInfoHeader = document.getElementById('doc-info-header');
  var infoBadge = document.getElementById('info-badge');
  var controls = document.getElementById('controls');

  hideAllPreviews(); previewDoc.classList.remove('hidden'); controls.classList.add('hidden');
  infoBadge.style.display = '';
  infoBadge.textContent = file.name + ' · ' + formatSize(file.size);
  try {
    var zip = await JSZip.loadAsync(file);
    var containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) throw new Error('Invalid EPUB: missing container.xml');
    var containerXml = new DOMParser().parseFromString(await containerFile.async('text'), 'text/xml');
    var rootfileEl = containerXml.querySelector('rootfile');
    if (!rootfileEl) throw new Error('Invalid EPUB: missing rootfile');
    var opfPath = rootfileEl.getAttribute('full-path');
    var opfFile = zip.file(opfPath);
    if (!opfFile) throw new Error('Invalid EPUB: OPF not found at ' + opfPath);
    var opfText = await opfFile.async('text');
    var opfDoc = new DOMParser().parseFromString(opfText, 'text/xml');
    var title = (opfDoc.querySelector('dc\\:title, title') || {}).textContent || file.name.replace(/\.epub$/i, '');
    var creator = (opfDoc.querySelector('dc\\:creator, creator') || {}).textContent || '—';
    var baseDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
    var manifestMap = {};
    opfDoc.querySelectorAll('manifest > item').forEach(function(item) {
      manifestMap[item.getAttribute('id')] = { href: item.getAttribute('href'), mediaType: item.getAttribute('media-type') };
    });
    var spineIds = [];
    opfDoc.querySelectorAll('spine > itemref').forEach(function(ref) { spineIds.push(ref.getAttribute('idref')); });
    var cssText = '';
    for (var id in manifestMap) {
      var m = manifestMap[id];
      if (m.mediaType === 'text/css') {
        var cssFile = zip.file(baseDir + m.href);
        if (cssFile) { cssText += '/* ' + m.href + ' */\n' + (await cssFile.async('text')) + '\n'; }
      }
    }
    var bodyHtml = '';
    for (var i = 0; i < spineIds.length; i++) {
      var spineId = spineIds[i];
      var contentHref = manifestMap[spineId] ? manifestMap[spineId].href : null;
      if (!contentHref) continue;
      var contentFile = zip.file(baseDir + contentHref);
      if (!contentFile) continue;
      var contentText = await contentFile.async('text');
      var bodyMatch = contentText.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) { bodyHtml += '<section id="epub-chapter-' + i + '">' + bodyMatch[1] + '</section>\n'; }
      else { bodyHtml += contentText; }
    }
    var fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + cssText + ' body{font-family:Georgia,serif;font-size:16px;line-height:1.8;color:#333;padding:24px;max-width:720px;margin:0 auto} img{max-width:100%;height:auto} ' + '</style></head><body>' + bodyHtml + '</body></html>';
    docIframe.style.display = '';
    docEmbed.style.display = 'none';
    docEmbed.data = '';
    docIframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    docIframe.srcdoc = fullHtml;
    docIframe.src = '';
    var headerHtml = '';
    headerHtml += '<span class="fph-item"><span class="fph-label">Title:</span><span class="fph-value">' + title + '</span></span>';
    headerHtml += '<span class="fph-item"><span class="fph-label">Author:</span><span class="fph-value">' + creator + '</span></span>';
    headerHtml += '<span class="fph-item"><span class="fph-label">Format:</span><span class="fph-value" style="color:var(--amber)">EPUB</span></span>';
    headerHtml += '<span class="fph-item"><span class="fph-label">Size:</span><span class="fph-value">' + formatSize(file.size) + '</span></span>';
    headerHtml += '<span class="fph-item"><span class="fph-label">Chapters:</span><span class="fph-value">' + spineIds.length + '</span></span>';
    docInfoHeader.innerHTML = headerHtml;
    infoBadge.textContent = 'EPUB · ' + title + ' · ' + spineIds.length + ' chapters';
  } catch(e) {
    docInfoHeader.innerHTML = '<span class="fph-item"><span class="fph-label">Error:</span><span class="fph-value" style="color:var(--destructive)">' + e.message + '</span></span>';
    infoBadge.textContent = 'EPUB · Error';
  }
}

export async function showFilePreview(filePath) {
  var modeState = state.modeState;
  var currentMode = state.currentMode;
  var fileMap = state.fileMap;
  modeState[currentMode].activeFile = filePath;
  document.querySelectorAll('.tree-item').forEach(function(el) { el.classList.toggle('active', el.title === filePath); });
  var file = fileMap.get(filePath); if (!file) return;
  var name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) { showDocPreview(file, 'PDF'); return; }
  if (name.endsWith('.epub')) { showEpubPreview(file); return; }
  if (name.endsWith('.sqlite') || name.endsWith('.db') || name.endsWith('.sqlite3')) { showSqlitePreview(file); return; }

  var previewFile = document.getElementById('preview-file');
  var filePreviewHeader = document.getElementById('file-preview-header');
  var fileContent = document.getElementById('file-content');
  var fileHex = document.getElementById('file-hex');
  var infoBadge = document.getElementById('info-badge');
  var controls = document.getElementById('controls');

  hideAllPreviews(); previewFile.classList.remove('hidden'); controls.classList.add('hidden');
  var oldViewer = previewFile.querySelector('.sqlite-viewer'); if (oldViewer) oldViewer.remove();
  infoBadge.style.display = '';
  infoBadge.textContent = file.name + ' · ' + formatSize(file.size);
  var buffer = await file.arrayBuffer();
  var headerHtml = '';
  headerHtml += '<span class="fph-item"><span class="fph-label">Name:</span><span class="fph-value">' + file.name + '</span></span>';
  headerHtml += '<span class="fph-item"><span class="fph-label">Size:</span><span class="fph-value">' + formatSize(file.size) + '</span></span>';
  if (isBinary(buffer)) {
    headerHtml += '<span class="fph-item"><span class="fph-label">Type:</span><span class="fph-value" style="color:var(--amber)">Binary</span></span>';
    filePreviewHeader.innerHTML = headerHtml;
    fileContent.innerHTML = '';
    fileContent.style.display = 'none';
    fileHex.innerHTML = hexDump(buffer);
    fileHex.classList.remove('hidden');
  } else {
    var decoder = new TextDecoder('utf-8', { fatal: false });
    var text = decoder.decode(buffer);
    var isJson = false;
    try { var parsed = JSON.parse(text); text = JSON.stringify(parsed, null, 2); isJson = true; } catch(e) {}
    var lines = text.split('\n');
    headerHtml += '<span class="fph-item"><span class="fph-label">Lines:</span><span class="fph-value">' + lines.length.toLocaleString() + '</span></span>';
    if (isJson) headerHtml += '<span class="fph-item"><span class="fph-label">Type:</span><span class="fph-value" style="color:var(--green)">JSON</span></span>';
    else headerHtml += '<span class="fph-item"><span class="fph-label">Type:</span><span class="fph-value">Text</span></span>';
    filePreviewHeader.innerHTML = headerHtml;
    fileHex.classList.add('hidden');
    fileHex.innerHTML = '';
    fileContent.style.display = '';
    var escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    fileContent.innerHTML = '<span class="line">' + escaped.split('\n').join('</span>\n<span class="line">') + '</span>';
  }
}

async function showSqlitePreview(file) {
  var modeState = state.modeState;
  var currentMode = state.currentMode;
  var fileMap = state.fileMap;
  var filePath = Array.from(fileMap.keys()).find(function(k) { return fileMap.get(k) === file; }) || file.name;
  modeState[currentMode].activeFile = filePath;
  document.querySelectorAll('.tree-item').forEach(function(el) { el.classList.toggle('active', el.title === filePath); });

  var previewFile = document.getElementById('preview-file');
  var filePreviewHeader = document.getElementById('file-preview-header');
  var fileContent = document.getElementById('file-content');
  var fileHex = document.getElementById('file-hex');
  var infoBadge = document.getElementById('info-badge');
  var controls = document.getElementById('controls');

  hideAllPreviews(); previewFile.classList.remove('hidden'); controls.classList.add('hidden');
  infoBadge.style.display = '';
  infoBadge.textContent = 'SQLite · ' + file.name + ' · ' + formatSize(file.size);
  fileHex.classList.add('hidden'); fileHex.innerHTML = '';
  fileContent.style.display = 'none'; fileContent.innerHTML = '';

  var headerHtml = '';
  headerHtml += '<span class="fph-item"><span class="fph-label">Name:</span><span class="fph-value">' + file.name + '</span></span>';
  headerHtml += '<span class="fph-item"><span class="fph-label">Size:</span><span class="fph-value">' + formatSize(file.size) + '</span></span>';
  headerHtml += '<span class="fph-item"><span class="fph-label">Type:</span><span class="fph-value" style="color:var(--accent)">SQLite Database</span></span>';

  try {
    var SQL = await window.initSqlJs({ locateFile: function(f) { return 'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/' + f; } });
    var buffer = await file.arrayBuffer();
    var db = new SQL.Database(new Uint8Array(buffer));
    var tables = db.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name");
    var tableNames = tables.length > 0 ? tables[0].values : [];
    headerHtml += '<span class="fph-item"><span class="fph-label">Tables:</span><span class="fph-value">' + tableNames.length + '</span></span>';
    filePreviewHeader.innerHTML = headerHtml;

    var viewer = document.createElement('div');
    viewer.className = 'sqlite-viewer';
    var maxRows = 200;

    for (var t = 0; t < tableNames.length; t++) {
      var tName = tableNames[t][0], tType = tableNames[t][1];
      var countResult = db.exec("SELECT COUNT(*) FROM \"" + tName.replace(/"/g, '""') + "\"");
      var totalRows = countResult.length > 0 ? countResult[0].values[0][0] : 0;
      var result = db.exec("SELECT * FROM \"" + tName.replace(/"/g, '""') + "\" LIMIT " + maxRows);

      var h3 = document.createElement('h3');
      h3.innerHTML = (tType === 'view' ? '📋 ' : '📄 ') + escapeHtml(tName) + '<span class="row-count">(' + totalRows.toLocaleString() + ' rows)</span>';
      viewer.appendChild(h3);

      if (result.length > 0) {
        var cols = result[0].columns;
        var rows = result[0].values;
        var table = '<table><thead><tr>';
        for (var c = 0; c < cols.length; c++) table += '<th>' + escapeHtml(cols[c]) + '</th>';
        table += '</tr></thead><tbody>';
        for (var r = 0; r < rows.length; r++) {
          table += '<tr>';
          for (var c = 0; c < cols.length; c++) {
            var val = rows[r][c];
            var display = val === null ? '<span style="color:var(--text-muted)">NULL</span>' : escapeHtml(String(val));
            table += '<td title="' + escapeHtml(String(val || '')) + '">' + display + '</td>';
          }
          table += '</tr>';
        }
        table += '</tbody></table>';
        if (totalRows > maxRows) table += '<div style="color:var(--text-muted);font-size:11px;margin-top:-16px;margin-bottom:20px">Showing ' + maxRows + ' of ' + totalRows.toLocaleString() + ' rows</div>';
        viewer.innerHTML += h3.outerHTML + table;
      } else {
        viewer.appendChild(h3);
        viewer.innerHTML += '<div style="color:var(--text-muted);font-size:12px;margin-bottom:20px">Empty table</div>';
      }
    }

    db.close();
    var container = document.getElementById('preview-file');
    var existingViewer = container.querySelector('.sqlite-viewer');
    if (existingViewer) existingViewer.remove();
    container.appendChild(viewer);

    viewer.addEventListener('click', function(e) {
      var td = e.target.closest('td');
      if (!td) return;
      var existing = viewer.querySelector('.cell-expanded');
      if (existing) { existing.classList.remove('cell-expanded'); }
      if (existing === td) return;
      td.classList.add('cell-expanded');
    });
    document.addEventListener('click', function handler(e) {
      if (!viewer.contains(e.target)) {
        var exp = viewer.querySelector('.cell-expanded');
        if (exp) exp.classList.remove('cell-expanded');
      }
    });

  } catch(e) {
    headerHtml += '<span class="fph-item"><span class="fph-label">Error:</span><span class="fph-value" style="color:var(--destructive)">' + e.message + '</span></span>';
    filePreviewHeader.innerHTML = headerHtml;
  }
}

function escapeHtml(str) { return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
