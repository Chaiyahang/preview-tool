// history-manager.js — Projects history cache using IndexedDB
import { state, hideAllPreviews } from './main.js';
import { buildTree, autoStart } from './file-handler.js';
import { showImagePreview } from './preview-image.js';
import { playJson } from './preview-lottie.js';
import { showVideoPreview } from './preview-video.js';
import { showAudioPreview } from './preview-audio.js';
import { showFontPreview } from './preview-font.js';
import { showFilePreview } from './preview-file.js';

var DB_NAME = 'preview_tool_db';
var DB_VERSION = 1;
var STORE_NAME = 'projects';

function openDB() {
  return new Promise(function(resolve, reject) {
    var request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = function() { reject(request.error); };
    request.onsuccess = function() { resolve(request.result); };
    request.onupgradeneeded = function(e) {
      var db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function saveCurrentProjectToHistory(name, fileMap, mode, activeFile) {
  if (!fileMap || fileMap.size === 0) return;
  var db = await openDB().catch(function(e) { console.error(e); return null; });
  if (!db) return;

  var transaction = db.transaction([STORE_NAME], 'readwrite');
  var store = transaction.objectStore(STORE_NAME);

  // 1. Get all stored projects to manage LRU cache limit (max 3) and duplicate names
  var getAllRequest = store.getAll();
  getAllRequest.onsuccess = function() {
    var projects = getAllRequest.result || [];
    
    // Sort projects by timestamp
    projects.sort(function(a, b) { return a.timestamp - b.timestamp; });

    // Check if there is an existing project with the same name
    var existing = projects.find(function(p) { return p.name === name; });

    var filesObj = {};
    fileMap.forEach(function(file, key) {
      filesObj[key] = file;
    });

    var newProject = {
      id: existing ? existing.id : Date.now().toString(),
      name: name,
      files: filesObj,
      mode: mode,
      activeFile: activeFile,
      timestamp: Date.now()
    };

    if (existing) {
      store.put(newProject);
    } else {
      // LRU Eviction: Remove oldest project if limit (3) reached
      if (projects.length >= 3) {
        store.delete(projects[0].id);
      }
      store.add(newProject);
    }
  };
}

export async function updateActiveFileInHistory(activeFile) {
  var projectName = state.projectName;
  if (!projectName) return;
  
  var db = await openDB().catch(function() { return null; });
  if (!db) return;

  var transaction = db.transaction([STORE_NAME], 'readwrite');
  var store = transaction.objectStore(STORE_NAME);

  var getAllRequest = store.getAll();
  getAllRequest.onsuccess = function() {
    var projects = getAllRequest.result || [];
    var existing = projects.find(function(p) { return p.name === projectName; });
    if (existing) {
      existing.activeFile = activeFile;
      existing.timestamp = Date.now(); // update timestamp on access
      store.put(existing);
    }
  };
}

export async function checkLastProjectHistory() {
  var db = await openDB().catch(function() { return null; });
  if (!db) return null;

  return new Promise(function(resolve) {
    var transaction = db.transaction([STORE_NAME], 'readonly');
    var store = transaction.objectStore(STORE_NAME);
    var getAllRequest = store.getAll();
    getAllRequest.onsuccess = function() {
      var projects = getAllRequest.result || [];
      if (projects.length === 0) {
        resolve(null);
        return;
      }
      // Sort by timestamp desc, get newest
      projects.sort(function(a, b) { return b.timestamp - a.timestamp; });
      resolve(projects[0]);
    };
    getAllRequest.onerror = function() {
      resolve(null);
    };
  });
}

export async function deleteProjectHistory(id) {
  var db = await openDB().catch(function() { return null; });
  if (!db) return;

  var transaction = db.transaction([STORE_NAME], 'readwrite');
  var store = transaction.objectStore(STORE_NAME);
  store.delete(id);
}

export async function restoreProjectFromHistory(id) {
  var db = await openDB().catch(function() { return null; });
  if (!db) return;

  return new Promise(function(resolve, reject) {
    var transaction = db.transaction([STORE_NAME], 'readonly');
    var store = transaction.objectStore(STORE_NAME);
    var request = store.get(id);
    
    request.onsuccess = function() {
      var proj = request.result;
      if (!proj) {
        reject(new Error('Project not found'));
        return;
      }

      state.projectName = proj.name;
      state.fileMap.clear();
      
      var filesObj = proj.files || {};
      for (var path in filesObj) {
        // Reconstruct File object if needed, or put directly (IndexedDB stores File objects seamlessly)
        state.fileMap.set(path, filesObj[path]);
      }

      // Restore mode state
      state.currentMode = proj.mode || 'lottie';
      
      // Update each modeState
      var TAB_MODES = ['lottie', 'image', 'video', 'audio', 'font', 'file'];
      TAB_MODES.forEach(function(m) {
        state.modeState[m].fileMap = new Map(state.fileMap);
        state.modeState[m].hasContent = true;
        state.modeState[m].activeFile = (m === state.currentMode) ? proj.activeFile : null;
      });

      hideAllPreviews();
      document.getElementById('controls').classList.add('hidden');
      document.getElementById('info-badge').style.display = 'none';

      // Switch UI Tabs active class
      document.querySelectorAll('.tab-btn').forEach(function(btn, i) {
        btn.classList.toggle('active', TAB_MODES[i] === state.currentMode);
      });

      // Build Tree and Auto Load active file
      buildTree();
      
      var activeFile = proj.activeFile;
      if (activeFile && state.fileMap.has(activeFile)) {
        var mode = state.currentMode;
        if (mode === 'lottie') playJson(activeFile);
        else if (mode === 'image') showImagePreview(activeFile);
        else if (mode === 'video') showVideoPreview(activeFile);
        else if (mode === 'audio') showAudioPreview(activeFile);
        else if (mode === 'font') showFontPreview(state.fileMap.get(activeFile));
        else if (mode === 'file') showFilePreview(activeFile);
      } else {
        autoStart();
      }

      resolve(proj);
    };

    request.onerror = function() {
      reject(request.error);
    };
  });
}
