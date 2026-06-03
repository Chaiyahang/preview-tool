// file-handler.js — Drag-drop, file inputs, ZIP, processEntries, buildTree, autoStart, menus
import { state, hideAllPreviews } from './main.js';
import { showImagePreview } from './preview-image.js';
import { playJson } from './preview-lottie.js';
import { showVideoPreview } from './preview-video.js';
import { showFilePreview } from './preview-file.js';

var HIDDEN_FILES = ['.DS_Store', 'Thumbs.db', '.gitkeep', '__MACOSX'];
var IMG_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.apng', '.pag', '.svg', '.heic', '.heif', '.avif', '.tiff', '.tif'];
var VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.mkv', '.ogg', '.avi'];

export function isHiddenFile(name) { if (name.startsWith('.')) return true; return HIDDEN_FILES.some(function(h) { return name === h || name.startsWith(h); }); }
export function isImageFile(name) { var lower = name.toLowerCase(); return IMG_EXTS.some(function(ext) { return lower.endsWith(ext); }); }
export function isVideoFile(name) { var lower = name.toLowerCase(); return VIDEO_EXTS.some(function(ext) { return lower.endsWith(ext); }); }

function guessType(name) {
  var n = name.toLowerCase();
  if (n.endsWith('.json')) return 'application/json';
  if (n.endsWith('.png') || n.endsWith('.apng')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

export function getActiveDropZone() {
  if (state.currentMode === 'lottie') return document.getElementById('drop-zone-lottie');
  if (state.currentMode === 'image') return document.getElementById('drop-zone-image');
  if (state.currentMode === 'video') return document.getElementById('drop-zone-video');
  return document.getElementById('drop-zone-file');
}

export function toggleMenu(type) { document.getElementById('menu-' + type).classList.toggle('show'); }
export function closeMenu() { setTimeout(function() { document.querySelectorAll('.select-menu').forEach(function(m) { m.classList.remove('show'); }); }, 100); }

async function readEntry(entry, basePath) {
  var fileMap = state.fileMap;
  if (isHiddenFile(entry.name)) return;
  var path = basePath ? basePath + '/' + entry.name : entry.name;
  if (entry.isFile) {
    var file = await new Promise(function(r, j) { entry.file(r, j); }).catch(function() { return null; });
    if (file) fileMap.set(path, file);
  } else if (entry.isDirectory) {
    var reader = entry.createReader(), allEntries = [], keepReading = true;
    while (keepReading) {
      var batch = await new Promise(function(r, j) { reader.readEntries(r, j); }).catch(function() { return []; });
      if (batch.length > 0) allEntries = allEntries.concat(Array.from(batch)); else keepReading = false;
    }
    for (var i = 0; i < allEntries.length; i++) await readEntry(allEntries[i], path);
  }
}

async function processZip(zipFile) {
  var fileMap = state.fileMap;
  fileMap.clear();
  var zip = await JSZip.loadAsync(zipFile);
  for (var p of Object.keys(zip.files)) {
    var ze = zip.files[p]; if (ze.dir) continue;
    var name = p.split('/').pop();
    if (isHiddenFile(name) || p.indexOf('__MACOSX') >= 0) continue;
    var blob = await ze.async('blob');
    fileMap.set(p, new File([blob], name, { type: guessType(name) }));
  }
}

export async function processEntries(entries) {
  var fileMap = state.fileMap;
  fileMap.clear();
  for (var i = 0; i < entries.length; i++) await readEntry(entries[i], '');
  var paths = Array.from(fileMap.keys());
  if (paths.length === 1 && paths[0].endsWith('.zip')) { await processZip(fileMap.get(paths[0])); fileMap.delete(paths[0]); }
  buildTree(); autoStart();
}

export async function processFiles(files) {
  var fileMap = state.fileMap;
  fileMap.clear();
  if (files.length === 1 && files[0].name.endsWith('.zip')) { await processZip(files[0]); }
  else { for (var i = 0; i < files.length; i++) { if (isHiddenFile(files[i].name)) continue; fileMap.set(files[i].webkitRelativePath || files[i].name, files[i]); } }
  buildTree(); autoStart();
}

export function findAnimGroups() {
  state.animGroups = [];
  var fileMap = state.fileMap;
  var allPaths = Array.from(fileMap.keys());
  allPaths.filter(function(p) { return p.endsWith('.json'); }).forEach(function(jsonPath) {
    var dir = jsonPath.substring(0, jsonPath.lastIndexOf('/'));
    var imagesDir = dir ? dir + '/images' : 'images';
    var images = new Map();
    fileMap.forEach(function(file, path) { if (path.startsWith(imagesDir + '/')) images.set(path.split('/').pop(), file); });
    state.animGroups.push({ jsonPath: jsonPath, images: images });
  });
}

export function buildTree() {
  var fileMap = state.fileMap;
  var fileTree = document.getElementById('file-tree');
  var paths = Array.from(fileMap.keys()).sort();
  var tree = {};
  paths.forEach(function(p) { var parts = p.split('/'), node = tree; parts.forEach(function(part, i) { if (i === parts.length - 1) node[part] = null; else { if (!node[part]) node[part] = {}; node = node[part]; } }); });
  fileTree.innerHTML = '';
  renderTreeNode(tree, 0, '', fileTree);
  findAnimGroups();
}

function renderTreeNode(node, depth, prefix, fileTree) {
  var currentMode = state.currentMode;
  Object.keys(node).sort(function(a, b) { var ad = node[a] !== null, bd = node[b] !== null; if (ad && !bd) return -1; if (!ad && bd) return 1; return a.localeCompare(b); }).forEach(function(key) {
    var fullPath = prefix ? prefix + '/' + key : key;
    var isDir = node[key] !== null, isJson = key.endsWith('.json'), isImg = isImageFile(key), isVid = isVideoFile(key);
    var div = document.createElement('div');
    div.className = 'tree-item';
    var indent = ''; for (var i = 0; i < depth; i++) indent += '<span class="tree-indent"></span>';
    var iconClass = isDir ? 'folder' : (isJson ? 'json' : (isImg ? 'img' : (isVid ? 'folder' : 'json')));
    var iconText = isDir ? '&#128193;' : (isJson ? '{ }' : (isImg ? '&#9632;' : (isVid ? '&#9654;' : '&#128196;')));
    if (!isDir) { div.style.color = isVid ? 'var(--pink)' : (!isJson && !isImg ? 'var(--amber)' : ''); }
    div.innerHTML = indent + '<span class="tree-icon ' + iconClass + '">' + iconText + '</span><span class="tree-name">' + key + '</span>';
    div.title = fullPath;
    if (!isDir && isJson) { div.addEventListener('click', currentMode === 'lottie' ? (function(fp) { return function() { playJson(fp); }; })(fullPath) : (function(fp) { return function() { showFilePreview(fp); }; })(fullPath)); }
    else if (!isDir && isImg) div.addEventListener('click', (function(fp) { return function() { showImagePreview(fp); }; })(fullPath));
    else if (!isDir && isVid) div.addEventListener('click', (function(fp) { return function() { showVideoPreview(fp); }; })(fullPath));
    else if (!isDir && !isJson) div.addEventListener('click', (function(fp) { return function() { showFilePreview(fp); }; })(fullPath));
    fileTree.appendChild(div);
    if (isDir) renderTreeNode(node[key], depth + 1, fullPath, fileTree);
  });
}

export function autoStart() {
  var fileMap = state.fileMap;
  var modeState = state.modeState;
  var currentMode = state.currentMode;
  modeState[currentMode].fileMap = new Map(fileMap);
  modeState[currentMode].hasContent = true;
  if (currentMode === 'lottie') { modeState[currentMode].animGroups = state.animGroups.slice(); if (state.animGroups.length > 0) playJson(state.animGroups[0].jsonPath); }
  else if (currentMode === 'image') { var firstImg = Array.from(fileMap.keys()).find(function(p) { return isImageFile(p); }); if (firstImg) showImagePreview(firstImg); }
  else if (currentMode === 'video') { var firstVid = Array.from(fileMap.keys()).find(function(p) { return isVideoFile(p); }); if (firstVid) showVideoPreview(firstVid); }
  else { var firstFile = Array.from(fileMap.keys()).find(function(p) { return true; }); if (firstFile) showFilePreview(firstFile); }
}
