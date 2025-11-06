diff --git a/pwa/service-worker.js b/pwa/service-worker.js
new file mode 100644
index 0000000000000000000000000000000000000000..0053e29bb16c1750d836388f7d818e4b931b5dc5
--- /dev/null
+++ b/pwa/service-worker.js
@@ -0,0 +1,53 @@
+const CACHE_NAME = 'eisenhower-cache-v1';
+const STATIC_ASSETS = [
+  './',
+  './index.html',
+  './styles.css',
+  './app.js',
+  './i18n/fr.json',
+  './i18n/es.json',
+  './pwa/manifest.webmanifest',
+  './assets/icons/icon-192.png',
+  './assets/icons/icon-512.png'
+];
+
+self.addEventListener('install', (event) => {
+  event.waitUntil(
+    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
+  );
+});
+
+self.addEventListener('activate', (event) => {
+  event.waitUntil(
+    caches.keys().then((keys) =>
+      Promise.all(
+        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
+      )
+    ).then(() => self.clients.claim())
+  );
+});
+
+self.addEventListener('fetch', (event) => {
+  const { request } = event;
+  if (request.method !== 'GET') {
+    return;
+  }
+
+  event.respondWith(
+    caches.match(request).then((cached) => {
+      if (cached) {
+        return cached;
+      }
+      return fetch(request)
+        .then((response) => {
+          if (!response || response.status !== 200 || response.type === 'opaque') {
+            return response;
+          }
+          const responseClone = response.clone();
+          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
+          return response;
+        })
+        .catch(() => caches.match('./index.html'));
+    })
+  );
+});
