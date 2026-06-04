/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Service Worker キャッシュ — 再発防止の不変条件
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 経緯: 再デプロイしても更新が反映されない (古いキャッシュが端末に残り続ける) 問題。
 *   原因は sw.js のバイト列が変わらないとブラウザが SW を更新せず、activate
 *   (旧キャッシュ削除) が再実行されないこと。
 *
 * 対策: SW のキャッシュ名 VERSION をビルド時にコミットハッシュへ自動置換する
 *   (vite.config.js の swVersionInjectPlugin が '__SW_VERSION__' を置換)。
 *   push のたびに VERSION が変わり、SW が更新され、旧キャッシュが破棄される。
 *
 * このテストは「キャッシュが古いまま残らない仕組み」と「登録スケールを消さない」を
 *   不変条件として固定する。ここが赤くなったら更新不達 or データ消失の恐れがある。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const SW = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');
const VITE = readFileSync(join(ROOT, 'vite.config.js'), 'utf8');

// コメントを除いた「実コード」だけを見るための簡易ストリップ
// (説明コメントが localStorage 等の語を含んでも、実際の参照と区別するため)。
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SW_CODE = stripComments(SW);

describe('SW ① キャッシュ名はビルド時にコミットハッシュへ自動採番 (手動 VERSION 上げは不要)', () => {
  it('public/sw.js は VERSION にプレースホルダ __SW_VERSION__ を使う', () => {
    expect(SW).toMatch(/const VERSION\s*=\s*['"]__SW_VERSION__['"]/);
  });
  it('public/sw.js に手動採番の固定バージョン (v1/v2 …) をハードコードしない', () => {
    // const VERSION = 'v1' のような手動採番が無いこと (再発防止: 上げ忘れ防止)
    expect(SW).not.toMatch(/const VERSION\s*=\s*['"]v\d+['"]/);
  });
  it('CACHE 名は VERSION から導出される (kst-<version>)', () => {
    expect(SW).toMatch(/const CACHE\s*=\s*`kst-\$\{VERSION\}`/);
  });
  it('vite.config.js が __SW_VERSION__ を置換する', () => {
    expect(VITE).toMatch(/__SW_VERSION__/);
    expect(VITE).toMatch(/swVersionInjectPlugin/);
  });
  it('vite.config.js の swVersion はコミットハッシュを含む (push ごとに変わる)', () => {
    expect(VITE).toMatch(/const swVersion\s*=.*commitHash/);
  });
  it('プラグインが plugins 配列に登録されている', () => {
    expect(VITE).toMatch(/plugins:\s*\[[^\]]*swVersionInjectPlugin\(\)/);
  });
});

describe('SW ② 古いキャッシュを残さない (activate で現行以外を全削除)', () => {
  it('activate で現行 CACHE 以外のキャッシュを削除する', () => {
    // keys.filter(k => k !== CACHE).map(k => caches.delete(k)) 相当
    expect(SW).toMatch(/activate/);
    expect(SW).toMatch(/caches\.keys\(\)/);
    expect(SW).toMatch(/!==\s*CACHE/);
    expect(SW).toMatch(/caches\.delete/);
  });
  it('install で skipWaiting し、activate で clients.claim する (即時反映)', () => {
    expect(SW).toMatch(/skipWaiting/);
    expect(SW).toMatch(/clients\.claim/);
  });
  it('HTML ナビゲーションはネットワーク優先 (古い HTML を返さない)', () => {
    // navigate 判定後、まず fetch(request) を試みる構造であること
    expect(SW).toMatch(/navigate/);
  });
});

describe('SW ③ ユーザーの登録スケールを消さない (localStorage は SW の管轄外)', () => {
  it('sw.js の実コードは localStorage を一切参照しない', () => {
    expect(SW_CODE).not.toMatch(/localStorage/);
  });
  it('sw.js の実コードは登録スケールの保存キー sg.v1.state を参照しない', () => {
    expect(SW_CODE).not.toContain('sg.v1.state');
  });
  it('キャッシュ削除対象は caches (Cache API) のみ — localStorage を削除しない', () => {
    // caches.delete はあるが localStorage.removeItem/clear は無いこと
    expect(SW_CODE).toMatch(/caches\.delete/);
    expect(SW_CODE).not.toMatch(/localStorage\.(removeItem|clear)/);
  });
});
