/* 神スケールトレーナー — Service Worker (オフライン対応)
 *
 * 方針:
 *   - HTML (ナビゲーション): ネットワーク優先 → 失敗時のみキャッシュ。
 *     これにより「古いHTMLが消えたCSSを指す」事故を防ぐ。
 *   - ハッシュ付きアセット (/assets/*) や画像: キャッシュ優先 +
 *     裏で更新 (stale-while-revalidate)。ファイル名にハッシュが付くため安全。
 *   - 同一オリジンの GET のみ対象。失敗してもアプリは通常どおり動く。
 *
 * ── キャッシュを古いまま残さないための仕組み (再発防止) ──────────────────
 *   VERSION は **ビルド時にコミットハッシュへ自動置換**される
 *   (vite.config.js の swVersionInjectPlugin が '__SW_VERSION__' を置換)。
 *   push → デプロイのたびに VERSION が変わる → sw.js のバイト列が変わる →
 *   ブラウザが SW を更新 → activate で「現行 CACHE 以外」を全削除する。
 *   よって古いキャッシュが端末に残り続けることはない。手動で番号を上げる必要もない。
 *
 *   ※ ここで消えるのは Cache API (アセットの一時キャッシュ) だけ。ユーザーが登録した
 *     スケール情報は localStorage('sg.v1.state') に保存されており Cache API とは
 *     完全に別物なので、キャッシュ破棄で**登録スケールが消えることはない**。
 *     (そもそも Service Worker から localStorage へはアクセスできない。)
 */
const VERSION = '__SW_VERSION__'; // ← ビルド時にコミットハッシュへ置換される
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
