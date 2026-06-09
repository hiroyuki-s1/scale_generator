/**
 * チューナー E2E（オーディオシミュレータ）。
 *
 * 実マイクの代わりに、生成したトーン WAV を Chromium の fake audio device に流し込み、
 * チューナーが正しい音名を表示するか・モード/基準ピッチ/閉じ方の挙動をヘッドレスで検証する。
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

// 検出ケース: [周波数Hz, モード, 期待音名, (任意)基準A]
// ギター/ベースは「対応開放弦のみ」(string モード)、ノーマルは 12 音クロマチック。
const CASES = [
  { freq: 82.41,  instr: 'guitar', expect: 'E2', label: 'ギター6弦 E2' },
  { freq: 110.0,  instr: 'guitar', expect: 'A2', label: 'ギター5弦 A2(倍音付き)', harmonics: [1, 0.4, 0.3] },
  { freq: 329.63, instr: 'guitar', expect: 'E4', label: 'ギター1弦 E4' },
  { freq: 41.2,   instr: 'bass',   expect: 'E1', label: 'ベース4弦 E1(低音)' },
  { freq: 98.0,   instr: 'bass',   expect: 'G2', label: 'ベース1弦 G2' },
  { freq: 440.0,  instr: 'normal', expect: 'A4', label: 'ノーマル A4' },
  { freq: 174.61, instr: 'normal', expect: 'F3', label: 'ノーマル F3(Eの次はF)' },
  { freq: 442.0,  instr: 'normal', expect: 'A4', a4: 442, label: '基準A=442 で 442Hz→A4' },
];

let passed = 0, failed = 0;
const pass = m => { console.log(`  ✅ ${m}`); passed++; };
const fail = m => { console.log(`  ❌ ${m}`); failed++; };

const FAKE_ARGS = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
];

function launchWith(wav) {
  return chromium.launch({
    headless: true,
    args: [...FAKE_ARGS, `--use-file-for-fake-audio-capture=${wav}`],
  });
}

async function openTuner(page) {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.getElementById('alphaNotice')?.classList.add('hidden'));
  await page.click('#moreTrigger');
  await page.click('[data-act="tuner"]');
  await page.waitForSelector('#tunerOverlay:not(.hidden)', { timeout: 3000 });
}

async function runCase(tmpDir, c) {
  const wav = path.join(tmpDir, `tone-${c.freq}.wav`);
  writeToneWav(wav, c.freq, { seconds: 3, harmonics: c.harmonics || [1] });

  const browser = await launchWith(wav);
  try {
    const context = await browser.newContext();
    await context.grantPermissions(['microphone'], { origin: URL });
    const page = await context.newPage();
    await openTuner(page);

    await page.click(`.tuner-instr-btn[data-instr="${c.instr}"]`);

    // 基準ピッチ A を指定値へ（既定440から +/- ボタンで移動）
    if (c.a4) {
      const diff = c.a4 - 440;
      const btn = diff > 0 ? '#tunerA4Up' : '#tunerA4Down';
      for (let i = 0; i < Math.abs(diff); i++) await page.click(btn);
      const val = await page.$eval('#tunerA4Val', el => el.textContent.trim());
      val === `${c.a4} Hz` ? pass(`${c.label}: 基準ピッチ表示 ${val}`)
                           : fail(`${c.label}: 基準ピッチ表示が不正 "${val}"`);
    }

    // 検出が安定するまでポーリング
    let detected = '', cents = '';
    for (let i = 0; i < 40; i++) {
      detected = await page.$eval('#tunerNote', el => el.textContent.trim());
      cents = await page.$eval('#tunerCents', el => el.textContent.trim());
      if (detected === c.expect) break;
      await page.waitForTimeout(100);
    }
    detected === c.expect
      ? pass(`${c.label}: ${c.freq}Hz → ${detected} (${cents})`)
      : fail(`${c.label}: ${c.freq}Hz → 期待 ${c.expect} / 実際 "${detected}" (${cents})`);

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

    await context.close();
  } finally {
    await browser.close();
  }
}

// モード切替・開放弦表示・閉じ方（背景クリックでは閉じない／戻るボタンで閉じる）の構造検証
async function runStructural(tmpDir) {
  console.log('--- 構造: モード/開放弦/閉じ方 ---');
  const wav = path.join(tmpDir, 'tone-struct.wav');
  writeToneWav(wav, 220, { seconds: 2 });
  const browser = await launchWith(wav);
  try {
    const context = await browser.newContext();
    await context.grantPermissions(['microphone'], { origin: URL });
    const page = await context.newPage();
    await openTuner(page);

    // ギター: 開放弦ピルが6本表示
    await page.click('.tuner-instr-btn[data-instr="guitar"]');
    const gStrings = await page.$$eval('#tunerStrings .tuner-string', els => els.map(e => e.textContent.trim()));
    (gStrings.length === 6 && gStrings.includes('E2') && gStrings.includes('E4'))
      ? pass(`ギター: 開放弦6本表示 [${gStrings.join(' ')}]`)
      : fail(`ギター: 開放弦表示が不正 [${gStrings.join(' ')}]`);

    // ベース: 4本
    await page.click('.tuner-instr-btn[data-instr="bass"]');
    const bStrings = await page.$$eval('#tunerStrings .tuner-string', els => els.length);
    bStrings === 4 ? pass('ベース: 開放弦4本表示') : fail(`ベース: 開放弦本数が不正 ${bStrings}`);

    // ノーマル: 開放弦は非表示（12音クロマチック）
    await page.click('.tuner-instr-btn[data-instr="normal"]');
    const normalHidden = await page.$eval('#tunerStrings', el => el.style.display === 'none');
    normalHidden ? pass('ノーマル: 開放弦ピルは非表示') : fail('ノーマル: 開放弦ピルが表示されている');

    // 背景クリックでは閉じない
    await page.mouse.click(6, 300); // オーバーレイ左端（中身の外＝背景）
    await page.waitForTimeout(150);
    const stillOpen = await page.$eval('#tunerOverlay', el => !el.classList.contains('hidden'));
    stillOpen ? pass('背景クリックでは閉じない') : fail('背景クリックで閉じてしまった');

    // 戻るボタンで閉じる
    await page.click('#tunerBackBtn');
    await page.waitForSelector('#tunerOverlay.hidden', { state: 'attached', timeout: 2000 });
    const closed = await page.$eval('#tunerOverlay', el => el.classList.contains('hidden'));
    closed ? pass('戻るボタンで閉じる') : fail('戻るボタンで閉じない');

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
      try { await runCase(tmpDir, c); }
      catch (e) { fail(`${c.label}: 例外 ${e.message}`); }
    }
    try { await runStructural(tmpDir); }
    catch (e) { fail(`構造検証: 例外 ${e.message}`); }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log(`\n=== 結果: ${passed} passed / ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
