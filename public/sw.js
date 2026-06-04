/* 神スケールトレーナー — Service Worker (オフライン対応)
 *
 * 方針:
 *   - HTML (ナビゲーション): ネットワーク優先 → 失敗時のみキャッシュ。
 *     これにより「古いHTMLが消えたCSSを指す」事故を防ぐ。
 *   - ハッシュ付きアセット (/assets/*) や画像: キャッシュ優先 +
 *     裏で更新 (stale-while-revalidate)。ファイル名にハッシュが付くため安全。
 *   - 同一オリジンの GET のみ対象。失敗してもアプリは通常どおり動く。
 *
 * キャッシュ名の VERSION を上げると旧キャッシュは activate 時に破棄される。
 */
const VERSION = 'v2';
const CACHE = `kst-${VERSION}`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 外部 (フォント/GA) は素通し

  const isNavigation =
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    // ネットワーク優先
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(request);
          return cached || caches.match(new URL('./', self.location).href);
        }
      })(),
    );
    return;
  }

  // アセット: キャッシュ優先 + 裏で更新
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then((resp) => {
          if (resp && resp.status === 200) {
            caches.open(CACHE).then((c) => c.put(request, resp.clone()));
          }
          return resp;
        })
        .catch(() => null);
      return cached || network || fetch(request);
    })(),
  );
});
