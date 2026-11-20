const root = new URL('./', self.location.href);
const cacheName = 'surveybridge-v2:' + root.pathname;
const shell = ['./', './index.html', './manifest.webmanifest', './style.css', './icon192.png', './icon512.png', ...['app', 'catalog', 'manual', 'cover', 'drawing', 'exports', 'geometry3d', 'interact', 'model', 'portable', 'scan', 'scene'].map(n => './js/' + n + '.js')];
const localPaths = new Set(shell.map(path => new URL(path,root).pathname));
self.addEventListener('install', event => event.waitUntil(caches.open(cacheName).then(c => c.addAll(shell)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil((async()=>{for(const key of await caches.keys())if(key!==cacheName && /^surveybridge-v[0-9]+:/.test(key) && key.endsWith(':'+root.pathname))await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch', event => {
  const req = event.request,
    url = new URL(req.url);
  if (req.method !== 'GET') return;
  const cdn = url.origin === 'https://cdn.jsdelivr.net' && url.pathname.startsWith('/npm/three@0.169.0/');
  if (!cdn && (url.origin !== root.origin || !localPaths.has(url.pathname))) return;
  event.respondWith((async () => {
    const c = await caches.open(cacheName);
    if (cdn) {
      const hit = await c.match(req);
      if (hit) return hit;
    }
    try {
      const r = await fetch(req);
      if (r.ok) await c.put(req, r.clone());
      return r;
    } catch {
      const hit = (await c.match(req)) || req.mode === 'navigate' && (await c.match(new URL('index.html', root)));
      return hit || Response.error();
    }
  })());
});
