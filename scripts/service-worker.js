const CACHE = 'calvario-shell-__VERSION__'
const SHELL = __PRECACHE__
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('calvario-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  // Sessions, records, exports and mutations always go directly to the API.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.open(CACHE)).match('/offline.html')))
  } else if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(request)) || fetch(request)))
  }
})
