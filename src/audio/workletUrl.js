/**
 * AudioWorklet モジュールの URL を base 対応で解決する。
 *
 * worklet は `addModule(url)` で classic/module スコープに読まれ、実行時 import が
 * 不安定（ブラウザ差・相対パス 404）。そこで vite.config.js の `pitchWorkletPlugin`
 * が esbuild で `pitchProcessor.worklet.js` を **依存込みの自己完結 1 ファイル**に
 * バンドルし、`public/` 経由で安定 URL（`${BASE_URL}pitchProcessor.worklet.js`）に置く。
 * BASE_URL は本番 `/`・GHミラー `/scale_generator/`（sw.js 登録と同じ仕組み）。
 */
export const pitchWorkletUrl = `${import.meta.env.BASE_URL}pitchProcessor.worklet.js`;
