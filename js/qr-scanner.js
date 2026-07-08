// qr-scanner.js — QR Code scanning functionality using html5-qrcode
import { state, switchMode } from './main.js';
import { processFiles, isImageFile, isVideoFile, isAudioFile, isFontFile } from './file-handler.js';

var html5QrCode = null;

export function initQrScanner() {
  var btnScan = document.getElementById('btn-scan');
  var btnScanClose = document.getElementById('btn-scan-close');
  var scanModal = document.getElementById('scan-modal');

  if (!btnScan || !scanModal) return;

  btnScan.addEventListener('click', function() {
    scanModal.classList.remove('hidden');
    void scanModal.offsetWidth; // Force layout reflow
    scanModal.classList.add('active');
    startScanner();
  });

  btnScanClose.addEventListener('click', closeScanner);
  scanModal.addEventListener('click', function(e) {
    if (e.target === scanModal) {
      closeScanner();
    }
  });
}

function closeScanner() {
  var scanModal = document.getElementById('scan-modal');
  if (scanModal) {
    scanModal.classList.remove('active');
    setTimeout(function() {
      scanModal.classList.add('hidden');
    }, 300);
  }
  if (html5QrCode) {
    html5QrCode.stop().then(function() {
      html5QrCode = null;
    }).catch(function(err) {
      console.error('Failed to stop scanner:', err);
      html5QrCode = null;
    });
  }
}

function startScanner() {
  if (html5QrCode) return;

  // html5-qrcode creates a new scanner on the element with id "reader"
  html5QrCode = new Html5Qrcode("reader");
  const config = { 
    fps: 10, 
    qrbox: function(width, height) {
      // Keep qrbox relative to scanner view size
      var size = Math.min(width, height) * 0.65;
      return { width: size, height: size };
    }
  };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    onScanSuccess,
    onScanFailure
  ).catch(err => {
    console.error("Unable to start scanner:", err);
    alert("无法启动摄像头，请确保已授予摄像头访问权限。");
    closeScanner();
  });
}

function onScanFailure(error) {
  // Silent frame scan failure to avoid console flooding
}

async function onScanSuccess(decodedText, decodedResult) {
  // Try to vibrate phone as scan feedback
  if (navigator.vibrate) {
    navigator.vibrate(100);
  }

  closeScanner();
  console.log(`Scan result: ${decodedText}`);

  await handleScannedContent(decodedText);
}

function guessType(name) {
  var n = name.toLowerCase();
  if (n.endsWith('.json')) return 'application/json';
  if (n.endsWith('.png') || n.endsWith('.apng')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.svg')) return 'image/svg+xml';
  if (n.endsWith('.ttf')) return 'font/ttf';
  if (n.endsWith('.otf')) return 'font/otf';
  if (n.endsWith('.woff')) return 'font/woff';
  if (n.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

async function handleScannedContent(text) {
  text = text.trim();
  var badge = document.getElementById('info-badge');
  if (badge) {
    badge.textContent = "正在处理扫码内容...";
    badge.style.display = "block";
  }

  try {
    if (text.startsWith('http://') || text.startsWith('https://')) {
      // Fetch URL file content
      var urlObj = new URL(text);
      var pathname = urlObj.pathname;
      var filename = pathname.substring(pathname.lastIndexOf('/') + 1);
      
      // Clean query params or hashes from filename
      filename = filename.split(/[?#]/)[0] || "downloaded_file";

      // If filename doesn't have an extension, try to determine from headers
      var response = await fetch(text);
      if (!response.ok) throw new Error("获取文件失败，请检查网络或直链地址");
      
      var blob = await response.blob();
      var mimeType = response.headers.get("content-type") || guessType(filename);
      
      // If filename doesn't have a dot/extension, guess one from MIME type
      if (!filename.includes('.')) {
        if (mimeType.includes('json')) filename += '.json';
        else if (mimeType.includes('png')) filename += '.png';
        else if (mimeType.includes('jpeg')) filename += '.jpg';
        else if (mimeType.includes('webp')) filename += '.webp';
        else if (mimeType.includes('gif')) filename += '.gif';
        else if (mimeType.includes('svg')) filename += '.svg';
        else if (mimeType.includes('video/mp4')) filename += '.mp4';
        else if (mimeType.includes('audio/mpeg')) filename += '.mp3';
      }

      var file = new File([blob], filename, { type: mimeType });

      // Automatically switch to the correct tab mode
      var nextMode = 'file'; // Default fallback
      var lowerName = filename.toLowerCase();
      if (lowerName.endsWith('.json')) {
        nextMode = 'lottie';
      } else if (isImageFile(filename)) {
        nextMode = 'image';
      } else if (isVideoFile(filename) || lowerName.endsWith('.ts')) {
        nextMode = 'video';
      } else if (isAudioFile(filename)) {
        nextMode = 'audio';
      } else if (isFontFile(filename)) {
        nextMode = 'font';
      }

      switchMode(nextMode);
      await processFiles([file]);

      if (badge) {
        badge.textContent = `已成功扫码导入: ${filename}`;
        setTimeout(function() { badge.style.display = "none"; }, 3000);
      }
    } else {
      // Scanned plain text or json config — render in File preview tab
      var filename = "scanned_text.txt";
      var mimeType = "text/plain";
      
      // Check if it's a valid JSON block, if so save as .json
      try {
        JSON.parse(text);
        filename = "scanned_config.json";
        mimeType = "application/json";
      } catch(e) {}

      var file = new File([new Blob([text], { type: mimeType })], filename, { type: mimeType });

      switchMode('file');
      await processFiles([file]);

      if (badge) {
        badge.textContent = `已扫码导入文本内容`;
        setTimeout(function() { badge.style.display = "none"; }, 3000);
      }
    }
  } catch (e) {
    console.error("Failed to load scanned content:", e);
    alert("导入失败: " + e.message);
    if (badge) badge.style.display = "none";
  }
}
