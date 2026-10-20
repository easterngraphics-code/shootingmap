// 撮影ツール service worker（メニューと全アプリ共通）
// アプリを追加したら SHELL にそのフォルダのファイルを足し、VERSION を上げる
const VERSION = 'v5';
const APP = `app-${VERSION}`;
const TILES = 'tiles';
const MAX_TILES = 1500;
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon-64.png',
  // 撮影方位レポート
  './photo-bearing/', './photo-bearing/index.html', './photo-bearing/manifest.webmanifest',
  './photo-bearing/icons/icon-180.png', './photo-bearing/icons/icon-192.png', './photo-bearing/icons/favicon-64.png',
  // 共通ライブラリ
  'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdn.jsdelivr.net/npm/piexifjs@1.0.6/piexif.min.js'
];
const TILE_HOSTS = ['cyberjapandata.gsi.go.jp', 'server.arcgisonline.com'];
const STATIC_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    await Promise.all(SHELL.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== APP && k !== TILES) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trimTiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 画面：オンラインなら最新、オフラインなら保存版
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(APP);
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch {
        const u = new URL(req.url); u.search = ''; u.hash = '';
        const alt = u.pathname.endsWith('/') ? u.href + 'index.html' : u.href;
        return (await c.match(req, { ignoreSearch: true })) || (await c.match(alt)) || (await c.match('./'));
      }
    })());
    return;
  }

  // 地図タイル：一度見た場所はオフラインでも表示
  if (TILE_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(TILES);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trimTiles(); }
        return res;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // ライブラリ・フォント・アイコン：保存版を即表示し、裏で更新
  if (url.origin === location.origin || STATIC_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(APP);
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || new Response('', { status: 504 });
    })());
  }
});
