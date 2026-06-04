var CACHE_NAME = 'preview-tool-v1';

self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(self.clients.claim()); });

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

  // Pass through all other requests
  e.respondWith(fetch(e.request));
});
