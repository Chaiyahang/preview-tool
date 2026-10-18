// sw.js — Service worker: app-shell precache + stale-while-revalidate, share target
var CACHE_NAME = 'preview-tool-v2';

var APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/js/main.js',
  '/js/utils.js',
  '/js/file-handler.js',
  '/js/parsers.js',
  '/js/preview-lottie.js',
  '/js/preview-image.js',
  '/js/preview-video.js',
  '/js/preview-audio.js',
  '/js/preview-font.js',
  '/js/preview-file.js',
  '/js/history-manager.js',
  '/js/qr-scanner.js'
];

// CDN origins whose responses are safe to cache and revalidate in background.
var CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.addAll(APP_SHELL); })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys()
      .then(function(names) {
        return Promise.all(names.map(function(n) {
          if (n !== CACHE_NAME) return caches.delete(n);
        }));
      })
      .then(function() { return self.clients.claim(); })
  );
});

function isCacheableGet(request) {
  if (request.method !== 'GET') return false;
  var url = new URL(request.url);
  if (url.origin === self.location.origin) return true;
  return CDN_HOSTS.indexOf(url.hostname) !== -1;
}

function staleWhileRevalidate(request) {
  return caches.open(CACHE_NAME).then(function(cache) {
    return cache.match(request).then(function(cached) {
      var network = fetch(request).then(function(response) {
        // opaque responses (no-cors CDN assets) have status 0 and are still cacheable
        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function() {
        return cached || Response.error();
      });
      return cached || network;
    });
  });
}

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // Handle share target POST
  if (url.pathname === '/share-target' && e.request.method === 'POST') {
    e.respondWith(Response.redirect('/?share=1', 303));
    e.waitUntil(
      e.request.formData().then(function(formData) {
        var files = formData.getAll('media');
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
          if (clients.length > 0) {
            clients[0].postMessage({ type: 'share-target-files', files: files });
            clients[0].focus();
          }
        });
      })
    );
    return;
  }

  // Navigations: network-first so updates arrive, cache fallback when offline
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(function(response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put('/index.html', copy); });
        return response;
      }).catch(function() {
        return caches.match('/index.html').then(function(cached) {
          return cached || Response.error();
        });
      })
    );
    return;
  }

  // App shell + pinned CDN assets: stale-while-revalidate
  if (isCacheableGet(e.request)) {
    e.respondWith(staleWhileRevalidate(e.request));
    return;
  }

  // Everything else (geocoding/weather APIs, arbitrary user URLs): pass through
});
