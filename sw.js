const V = 'fileshare-v4';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V && k !== 'fs-share').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Android "Share to FileShare" (Web Share Target)
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const fd = await req.formData();
      const cache = await caches.open('fs-share');
      for (const k of await cache.keys()) await cache.delete(k);
      let i = 0;
      for (const f of fd.getAll('files')) {
        if (!(f instanceof File)) continue;
        await cache.put('/shared/' + (i++), new Response(f, {
          headers: { 'x-name': encodeURIComponent(f.name), 'content-type': f.type || 'application/octet-stream' }
        }));
      }
      const text = [fd.get('title'), fd.get('text'), fd.get('url')].filter(Boolean).join('\n');
      if (text) await cache.put('/shared-text', new Response(text));
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }

  if (req.method !== 'GET') return;
  const sameOrigin = url.origin === self.location.origin;
  const cdn = /(^|\.)unpkg\.com$|(^|\.)cdnjs\.cloudflare\.com$/.test(url.hostname);
  if (!sameOrigin && !cdn) return; // never touch signaling traffic

  e.respondWith(
    fetch(req)
      .then(res => { const copy = res.clone(); caches.open(V).then(c => c.put(req, copy)).catch(() => {}); return res; })
      .catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
