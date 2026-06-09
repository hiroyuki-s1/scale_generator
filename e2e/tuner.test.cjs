/**
 * チューナー E2E（オーディオシミュレータ）。
 *
 * 実マイクの代わりに、生成したトーン WAV を Chromium の fake audio device に流し込み、
 * チューナーが正しい音名を表示するかをヘッドレスで検証する。
 *
 *   --use-fake-device-for-media-stream      : 偽のマイク/カメラ
 *   --use-fake-ui-for-media-stream          : getUserMedia 許可を自動承認
 *   --use-file-for-fake-audio-capture=<wav> : WAV を入力音声として再生（既定ループ）
 *
 * 前提: dev server が http://localhost:5173/ で起動していること（npm run dev）。
 */
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { writeToneWav } = require('./gen-tone-wav.cjs');

const URL = 'http://localhost:5173/';

// 検証ケース: [周波数Hz, 楽器, 期待音名]
const CASES = [
  { freq: 440.0, instr: 'guitar', expect: 'A4', label: 'A4 基準音' },
  { freq: 82.41, instr: 'guitar', expect: 'E2', label: 'ギター6弦 E2' },
  { freq: 329.63, instr: 'guitar', expect: 'E4', label: 'ギター1弦 E4' },
  { freq: 110.0, instr: 'guitar', expect: 'A2', label: 'ギター5弦 A2(倍音付き)', harmonics: [1, 0.4, 0.3] },
  { freq: 41.2, instr: 'bass', expect: 'E1', label: 'ベース4弦 E1(低音)' },
  { freq: 98.0, instr: 'bass', expect: 'G2', label: 'ベース1弦 G2' },
];

let passed = 0;
let failed = 0;
const pass = m => { console.log(`  ✅ ${m}`); passed++; };
const fail = m => { console.log(`  ❌ ${m}`); failed++; };

const FAKE_ARGS = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  // ヘッドレスで AudioContext を確実に走らせる（出力デバイス無しでも resume 可能に）。
  '--autoplay-policy=no-user-gesture-required',
];

async function runCase(tmpDir, c) {
  const wav = path.join(tmpDir, `tone-${c.freq}.wav`);
  writeToneWav(wav, c.freq, { seconds: 3, harmonics: c.harmonics || [1] });

  const browser = await chromium.launch({
    headless: true,
    args: [...FAKE_ARGS, `--use-file-for-fake-audio-capture=${wav}`],
  });
  try {
    const context = await browser.newContext();
    await context.grantPermissions(['microphone'], { origin: URL });
    const page = await context.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });

    // アルファ告知を閉じる
    await page.evaluate(() => {
      document.getElementById('alphaNotice')?.classList.add('hidden');
    });

    // … メニュー → チューナー
    await page.click('#moreTrigger');
    await page.click('[data-act="tuner"]');
    await page.waitForSelector('#tunerOverlay:not(.hidden)', { timeout: 3000 });

    // 楽器選択
    await page.click(`.tuner-instr-btn[data-instr="${c.instr}"]`);

    // 検出が安定するまで待ち、音名を確認（最大 ~4 秒ポーリング）
    let detected = '';
    let cents = '';
    for (let i = 0; i < 40; i++) {
      detected = await page.$eval('#tunerNote', el => el.textContent.trim());
      cents = await page.$eval('#tunerCents', el => el.textContent.trim());
      if (detected === c.expect) break;
      await page.waitForTimeout(100);
    }

    if (detected === c.expect) {
      pass(`${c.label}: ${c.freq}Hz → ${detected} (${cents})`);
    } else {
      fail(`${c.label}: ${c.freq}Hz → 期待 ${c.expect} / 実際 "${detected}" (${cents})`);
    }

    // ピッチ推移グラフが描画されている（canvas に非透明ピクセルがある）こと
    await page.waitForTimeout(300);
    const graphDrawn = await page.evaluate(() => {
      const cv = document.getElementById('tunerGraph');
      if (!cv || !cv.width || !cv.height) return false;
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) { if (++n > 50) return true; }
      return false;
    });
    graphDrawn ? pass(`${c.label}: ピッチ推移グラフが描画されている`)
               : fail(`${c.label}: グラフが描画されていない`);

    // 閉じるボタン: オーバーレイに hidden クラスが付くこと（display:none なので
    // visible 待ちは不可。attached + クラス確認で判定）。
    await page.click('#tunerCloseBtn');
    await page.waitForSelector('#tunerOverlay.hidden', { state: 'attached', timeout: 2000 });
    const closed = await page.$eval('#tunerOverlay', el => el.classList.contains('hidden'));
    closed ? pass(`${c.label}: 閉じるボタンでオーバーレイ非表示`)
           : fail(`${c.label}: 閉じても hidden が付かない`);

    await context.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('チューナー E2E（fake audio capture シミュレータ）\n');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuner-wav-'));
  try {
    for (const c of CASES) {
      console.log(`--- ${c.label} ---`);
      try {
        await runCase(tmpDir, c);
      } catch (e) {
        fail(`${c.label}: 例外 ${e.message}`);
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log(`\n=== 結果: ${passed} passed / ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
