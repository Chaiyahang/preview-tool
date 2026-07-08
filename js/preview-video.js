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

function renderVideoInfo(videoPlayer, file, videoMeta, videoInfoPanel, infoBadge) {
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

  var metaReady = false;
  var playerReady = false;
  var videoMeta = null;

  function tryRender() {
    if (metaReady && playerReady) {
      renderVideoInfo(videoPlayer, file, videoMeta, videoInfoPanel, infoBadge);
    }
  }

  videoPlayer.onloadedmetadata = function() {
    playerReady = true;
    tryRender();
  };

  if (file.name.toLowerCase().endsWith('.ts')) {
    var mediaSource = new MediaSource();
    videoPlayer.src = URL.createObjectURL(mediaSource);
    
    mediaSource.addEventListener('sourceopen', async function() {
      var sourceBuffer;
      try {
        sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.42E01E,mp4a.40.2"');
      } catch (err) {
        console.warn("MSE initialization failed with full codecs, trying video-only codecs...", err);
        try {
          sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.42E01E"');
        } catch (err2) {
          console.warn("MSE initialization failed with video-only codecs, trying basic video/mp4...", err2);
          try {
            sourceBuffer = mediaSource.addSourceBuffer('video/mp4');
          } catch(err3) {
            console.error("MSE initialization failed completely", err3);
            return;
          }
        }
      }

      var queue = [];
      var transmuxer = new muxjs.mp4.Transmuxer();
      
      transmuxer.on('data', function(segment) {
        if (segment.initSegment && segment.initSegment.byteLength > 0) {
          queue.push(segment.initSegment);
        }
        if (segment.data && segment.data.byteLength > 0) {
          queue.push(segment.data);
        }
      });
      
      function appendNext() {
        if (queue.length === 0) {
          if (!sourceBuffer.updating && mediaSource.readyState === 'open') {
            mediaSource.endOfStream();
          }
          return;
        }
        if (sourceBuffer.updating) {
          return;
        }
        try {
          sourceBuffer.appendBuffer(queue.shift());
        } catch (appendErr) {
          console.error("Error appending buffer to SourceBuffer", appendErr);
        }
      }
      
      sourceBuffer.addEventListener('updateend', appendNext);
      
      try {
        var buffer = await file.arrayBuffer();
        transmuxer.push(new Uint8Array(buffer));
        transmuxer.flush();
        appendNext();
      } catch(e) {
        console.error('Transmux read file error:', e);
      }
    });
    
    metaReady = true;
  } else {
    var url = URL.createObjectURL(file);
    videoPlayer.src = url;
    
    try {
      var buffer = await file.arrayBuffer();
      var bytes = new Uint8Array(buffer);
      videoMeta = parseMP4Location(bytes);
    } catch(e) {}
    metaReady = true;
  }

  videoPlayer.preload = 'metadata';
  videoPlayer.load();
  videoPlayer.style.display = '';
  infoBadge.style.display = '';
  infoBadge.textContent = file.name + ' · ' + formatSize(file.size);

  if (videoPlayer.readyState >= 1) { playerReady = true; }
  tryRender();
}
