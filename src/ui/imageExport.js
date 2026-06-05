import { SVG } from '../domain/constants.js';
import { localizeTitle } from '../domain/i18n.js';
import { sanitizeFilename } from '../domain/filename.js';
import { IMAGE_EXPORT_SCALE } from '../config.js';
import {
  maskViewBox, setMaskOverlayVisible, bakePrintTitle, removePrintTitle,
} from './fretboardSvg.js';

/**
 * 指板 SVG を PNG 画像として書き出す（ランタイム依存ゼロ）。
 * 仕様: docs/features/IMAGE_EXPORT.md。
 *
 * 方式（リサーチ反映）:
 *  - 印刷と同じ bakePrintTitle でスケール名を SVG 上端へ焼き込み（名前＋指板=1枚）。
 *  - ライブ SVG はクローンして書き出す（元を破壊しない）。クローンに明示的な
 *    width/height を付ける（iOS WebKit/Firefox は intrinsic サイズ無しだと空白になる）。
 *  - Blob URL + img.decode()（iOS の data-URL 長制限・tainting 回避、描画前デコード確定）。
 *  - canvas バッキングストア = 論理サイズ × スケール係数。白背景を先に塗る（透過回避）。
 */

const XMLNS = 'http://www.w3.org/2000/svg';

/**
 * ライブ SVG を「印刷相当の見た目」(タイトル焼き込み・マスククロップ・オーバーレイ非表示)
 * に一時変形してシリアライズし、必ず元に戻す。返り値は書き出し用 SVG 文字列と論理寸法。
 */
function serializeBoard(svg, snap) {
  const overlay = svg.querySelector('.title-overlay');
  const prevOverlayDisplay = overlay ? overlay.style.display : null;
  const originalViewBox = svg.getAttribute('viewBox');

  let xml = '';
  let w = SVG.W;
  let h = SVG.H;
  try {
    if (overlay) overlay.style.display = 'none';   // 画面用の中央タイトルは出さない
    setMaskOverlayVisible(svg, false);
    const base = maskViewBox(snap.mask) || `0 0 ${SVG.W} ${SVG.H}`;
    const viewBox = bakePrintTitle(svg, localizeTitle(snap.title), base);
    svg.setAttribute('viewBox', viewBox);

    const parts = viewBox.split(/\s+/).map(Number);
    w = parts[2];
    h = parts[3];

    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', XMLNS);
    clone.setAttribute('viewBox', viewBox);
    clone.setAttribute('width', String(w));   // intrinsic サイズ必須（iOS/Firefox 空白対策）
    clone.setAttribute('height', String(h));
    // 非表示ポジションは印刷同様に画像からも除外（画面の薄表示は持ち込まない）
    clone.querySelectorAll('.fb-dot-hidden').forEach(n => n.remove());
    xml = new XMLSerializer().serializeToString(clone);
  } finally {
    // 必ず元に戻す（画面表示を壊さない）。個々を try で隔離し、途中の例外でも
    // オーバーレイ復帰まで到達させる。
    try { removePrintTitle(svg); } catch (e) { console.error('removePrintTitle failed', e); }
    if (originalViewBox) svg.setAttribute('viewBox', originalViewBox);
    try { setMaskOverlayVisible(svg, true); } catch (e) { console.error('restore mask failed', e); }
    if (overlay) overlay.style.display = prevOverlayDisplay ?? '';
  }
  return { xml, w, h };
}

/** SVG 文字列 → 白背景・高解像度の PNG Blob。 */
async function rasterizeToPng(xml, w, h, scale) {
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // iOS は click 直後の revoke でダウンロードが途切れることがあるので遅延 revoke
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * 1スケール分の指板 SVG を PNG 出力する。
 * @param {SVGElement} svg  対象スケールのライブ指板 SVG
 * @param {object} snap     スケールスナップショット（title/mask 等）
 * @param {number} [scale]  解像度係数
 * @returns {Promise<void>}
 */
export async function exportScalePng(svg, snap, scale = IMAGE_EXPORT_SCALE) {
  const { xml, w, h } = serializeBoard(svg, snap);
  if (!xml) throw new Error('SVG のシリアライズに失敗しました');
  const png = await rasterizeToPng(xml, w, h, scale);
  // ファイル名は画面/画像に出る表示名（ローカライズ後）に合わせる。個別・一括とも同じ。
  downloadBlob(png, `${sanitizeFilename(localizeTitle(snap.title))}.png`);
}

/**
 * 登録スケールを id から探して PNG 出力する（カードの「画像」ボタン用）。
 * @returns {Promise<void>}
 */
export function exportSavedScalePng(snap, scale = IMAGE_EXPORT_SCALE) {
  const svg = document.getElementById('sv' + snap.id);
  if (!svg) return Promise.reject(new Error('svg not found for snap ' + snap.id));
  return exportScalePng(svg, snap, scale);
}

/**
 * 全登録スケールを順次 PNG 出力する（一括出力）。失敗分はスキップして継続。
 * @param {Array} savedList  store.get().saved
 * @param {(done:number,total:number)=>void} [onProgress] 進捗コールバック
 * @returns {Promise<{ok:number, fail:number}>}
 */
export async function exportAllScalesPng(savedList, onProgress, scale = IMAGE_EXPORT_SCALE) {
  let ok = 0;
  let fail = 0;
  const total = savedList.length;
  for (let i = 0; i < total; i++) {
    try {
      await exportSavedScalePng(savedList[i], scale);
      ok++;
    } catch (e) {
      fail++;
      console.error('画像の一括出力に失敗（スキップ）:', savedList[i]?.title, e);
    }
    onProgress?.(i + 1, total);
    // ブラウザの連続ダウンロード抑制を避けるため少し間隔をあける
    await new Promise(r => setTimeout(r, 250));
  }
  return { ok, fail };
}
