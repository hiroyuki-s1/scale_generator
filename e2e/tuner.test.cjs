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
const { writeToneWav, writeChordWav } = require('./gen-tone-wav.cjs');

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
  // 楽器/チューニング/モード/基準A は「設定」ドロワー内にあるので開く。
  await page.click('#tunerSettingsToggle');
  await page.waitForSelector('#tunerSettings:not(.hidden)', { timeout: 2000 });
}

// 検出された開放弦（target/in-tune ハイライト）のラベル一覧。
function highlightedStrings(page) {
  return page.$$eval('#tunerStrings .tuner-string.in-tune, #tunerStrings .tuner-string.target',
    els => els.map(e => e.textContent.trim()));
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

    // 音名（大表示）はピッチクラス（例 E2→"E"）。string 楽器は弦チップのハイライトで弦も検証。
    const expectPC = c.expect.replace(/[0-9]/g, '');
    let noteLetter = '', cents = '', ok = false;
    for (let i = 0; i < 40; i++) {
      noteLetter = await page.$eval('#tunerNote', el => el.textContent.trim());
      cents = await page.$eval('#tunerCents', el => el.textContent.trim());
      if (c.instr === 'normal') {
        if (noteLetter === expectPC) { ok = true; break; }
      } else if ((await highlightedStrings(page)).includes(c.expect)) {
        ok = true; break;
      }
      await page.waitForTimeout(100);
    }
    ok ? pass(`${c.label}: ${c.freq}Hz → ${c.instr === 'normal' ? noteLetter : c.expect} (${cents})`)
       : fail(`${c.label}: ${c.freq}Hz → 期待 ${c.expect} / 音名 "${noteLetter}" (${cents})`);

    // クロマチック・ルーラーが描画されている（セルがある）こと
    await page.waitForTimeout(200);
    const rulerOk = await page.$eval('#tunerRulerStrip', el => el.childElementCount >= 5);
    rulerOk ? pass(`${c.label}: クロマチックルーラー描画`)
            : fail(`${c.label}: ルーラー未描画`);

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

    // ノーマル: 開放弦ピルは無し（12音クロマチック）。ただし領域は予約され位置は固定。
    await page.click('.tuner-instr-btn[data-instr="normal"]');
    const normalPills = await page.$$eval('#tunerStrings .tuner-string', els => els.length);
    normalPills === 0 ? pass('ノーマル: 開放弦ピルは無し（領域は予約）')
                      : fail(`ノーマル: 開放弦ピルが残っている ${normalPills}`);

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

// オルタネートチューニング: Drop D を選ぶと 73.42Hz が D2（6弦）として合う。
async function runAlternateTuning(tmpDir) {
  console.log('--- オルタネート: Drop D で D2 ---');
  const wav = path.join(tmpDir, 'tone-d2.wav');
  writeToneWav(wav, 73.42, { seconds: 3 });
  const browser = await launchWith(wav);
  try {
    const context = await browser.newContext();
    await context.grantPermissions(['microphone'], { origin: URL });
    const page = await context.newPage();
    await openTuner(page);
    await page.click('.tuner-instr-btn[data-instr="guitar"]');
    await page.selectOption('#tunerTuning', 'drop-d');
    // 6弦ラベルが D2 になっている
    const sixth = await page.$$eval('#tunerStrings .tuner-string', els =>
      els.map(e => e.textContent.trim()));
    sixth.includes('D2') ? pass(`Drop D: 6弦ラベル D2 [${sixth.join(' ')}]`)
                         : fail(`Drop D: 6弦ラベルが D2 でない [${sixth.join(' ')}]`);
    let ok = false;
    for (let i = 0; i < 40; i++) {
      if ((await highlightedStrings(page)).includes('D2')) { ok = true; break; }
      await page.waitForTimeout(100);
    }
    ok ? pass('Drop D: 73.42Hz → D2（弦ハイライト）')
       : fail('Drop D: 73.42Hz → D2 が検出されない');
    await context.close();
  } finally { await browser.close(); }
}

// 甘い調弦(スウィートンド): B3 を有効化すると目標が下がり、同じ入力が +側にずれて見える。
async function runSweetened(tmpDir) {
  console.log('--- 甘い調弦: オフセットで cents が変わる ---');
  const wav = path.join(tmpDir, 'tone-b3.wav');
  writeToneWav(wav, 246.94, { seconds: 3 }); // 平均律 B3 ぴったり
  const browser = await launchWith(wav);
  try {
    const context = await browser.newContext();
    await context.grantPermissions(['microphone'], { origin: URL });
    const page = await context.newPage();
    await openTuner(page);
    await page.click('.tuner-instr-btn[data-instr="guitar"]');
    // 標準: B3 ≈ ±0¢（大表示はピッチクラス "B"）
    let centsStd = '';
    for (let i = 0; i < 40; i++) {
      const n = await page.$eval('#tunerNote', el => el.textContent.trim());
      centsStd = await page.$eval('#tunerCents', el => el.textContent.trim());
      if (n === 'B') break;
      await page.waitForTimeout(100);
    }
    // 甘い調弦 ON → B3 の目標が -4¢ 下がるので同じ音が +側に
    await page.click('#tunerSweeten');
    let centsSweet = '';
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(100);
      centsSweet = await page.$eval('#tunerCents', el => el.textContent.trim());
      if (/\+/.test(centsSweet)) break;
    }
    const num = s => parseInt(String(s).replace(/[^\-0-9]/g, ''), 10) || 0;
    (num(centsStd) <= 1 && num(centsSweet) >= 3)
      ? pass(`甘い調弦: 標準 ${centsStd} → 甘い ${centsSweet}（+側へ）`)
      : fail(`甘い調弦: 変化が不正 標準 ${centsStd} / 甘い ${centsSweet}`);
    await context.close();
  } finally { await browser.close(); }
}

// ポリフォニック: 全弦ジャストの和音 → ポリ表示で全弦が ±0 付近・「—」でない。
async function runPolyphonic(tmpDir) {
  console.log('--- ポリフォニック: 和音で全弦同時 ---');
  const targets = [329.63, 246.94, 196.0, 146.83, 110.0, 82.41]; // E4 B3 G3 D3 A2 E2（全てジャスト）
  const wav = path.join(tmpDir, 'chord-std.wav');
  writeChordWav(wav, targets, { seconds: 3, harmonics: [1, 0.25] });
  const browser = await launchWith(wav);
  try {
    const context = await browser.newContext();
    await context.grantPermissions(['microphone'], { origin: URL });
    const page = await context.newPage();
    await openTuner(page);
    await page.click('.tuner-instr-btn[data-instr="guitar"]');
    await page.click('.tuner-view-btn[data-view="poly"]');
    // ポリ行が全弦で「—」でない値になるまで待つ
    let cents = [];
    for (let i = 0; i < 60; i++) {
      cents = await page.$$eval('#tunerPoly .tuner-poly-cents', els => els.map(e => e.textContent.trim()));
      if (cents.length === 6 && cents.every(c => c !== '—')) break;
      await page.waitForTimeout(100);
    }
    const allDetected = cents.length === 6 && cents.every(c => c !== '—');
    allDetected ? pass(`ポリ: 全6弦検出 [${cents.join(' ')}]`)
                : fail(`ポリ: 検出できない弦がある [${cents.join(' ')}]`);
    // 全弦ジャストなので各 |cents| は小さい（±15¢以内）。±0¢ を 0 として正しく扱う。
    const num = s => {
      const n = parseInt(String(s).replace(/[^\-0-9]/g, ''), 10);
      return Number.isNaN(n) ? 99 : Math.abs(n);
    };
    const allClose = allDetected && cents.every(c => num(c) <= 15);
    allClose ? pass('ポリ: 全弦が ±15¢ 以内（ジャスト和音）')
             : fail(`ポリ: ジャストのはずが外れている [${cents.join(' ')}]`);
    await context.close();
  } finally { await browser.close(); }
}

// 弦ごとオフセット編集: B3 を −で下げると、同じ B3 入力の cents が +側へ動く。永続も確認。
async function runOffsetEditor(tmpDir) {
  console.log('--- オフセット編集: 弦ごと ±¢ ---');
  const wav = path.join(tmpDir, 'tone-b3o.wav');
  writeToneWav(wav, 246.94, { seconds: 3 }); // 平均律 B3
  const browser = await launchWith(wav);
  try {
    const context = await browser.newContext();
    await context.grantPermissions(['microphone'], { origin: URL });
    const page = await context.newPage();
    await openTuner(page);
    await page.click('.tuner-instr-btn[data-instr="guitar"]');
    await page.click('#tunerSweeten'); // 甘い調弦 ON → エディタ出現
    await page.waitForSelector('#tunerOffsetEditor:not(.hidden)', { timeout: 2000 });

    // B3 (data-index=1) を 3 回下げる（−3¢）。値表示が更新されること。
    const before = await page.$eval('.tuner-offset-val[data-vi="1"]', el => el.textContent.trim());
    for (let i = 0; i < 3; i++) await page.click('.tuner-offset-btn[data-i="1"][data-off="-1"]');
    const after = await page.$eval('.tuner-offset-val[data-vi="1"]', el => el.textContent.trim());
    (before !== after) ? pass(`オフセット: B3 値が変化 ${before} → ${after}`)
                       : fail(`オフセット: B3 値が変わらない ${before}`);

    // localStorage に保存されている
    const saved = await page.evaluate(() => localStorage.getItem('sg.v1.tunerOffsets'));
    (saved && JSON.parse(saved).guitar[1] <= -3)
      ? pass('オフセット: localStorage に保存')
      : fail(`オフセット: localStorage 未保存 ${saved}`);

    // 同じ B3 入力の cents がより + 側へ（目標が下がったぶん高く見える）
    let cents = '';
    const num = s => { const n = parseInt(String(s).replace(/[^\-0-9]/g, ''), 10); return Number.isNaN(n) ? -99 : n; };
    for (let i = 0; i < 40; i++) {
      const n = await page.$eval('#tunerNote', el => el.textContent.trim());
      cents = await page.$eval('#tunerCents', el => el.textContent.trim());
      if (n === 'B' && num(cents) >= 2) break;
      await page.waitForTimeout(100);
    }
    num(cents) >= 2 ? pass(`オフセット: B3 補正で cents が +側 ${cents}`)
                    : fail(`オフセット: cents が +側に動かない ${cents}`);
    await context.close();
  } finally { await browser.close(); }
}

// テーマ切替: ライト/ダークでクラス付与＆localStorage永続。
async function runTheme(tmpDir) {
  console.log('--- テーマ: ライト/ダーク切替 ---');
  const wav = path.join(tmpDir, 'tone-th.wav');
  writeToneWav(wav, 110, { seconds: 2 });
  const browser = await launchWith(wav);
  try {
    const context = await browser.newContext();
    await context.grantPermissions(['microphone'], { origin: URL });
    const page = await context.newPage();
    await openTuner(page); // 設定ドロワーを開く
    // 既定はライト（theme-light クラスあり）
    let isLight = await page.$eval('#tunerOverlay', el => el.classList.contains('theme-light'));
    isLight ? pass('テーマ: 既定はライト') : fail('テーマ: 既定がライトでない');
    // ダークへ
    await page.click('.tuner-theme-btn[data-theme="dark"]');
    await page.waitForTimeout(150);
    isLight = await page.$eval('#tunerOverlay', el => el.classList.contains('theme-light'));
    const saved = await page.evaluate(() => localStorage.getItem('sg.v1.tunerTheme'));
    (!isLight && saved === 'dark') ? pass('テーマ: ダーク適用＋localStorage保存')
                                   : fail(`テーマ: ダーク不正 class=${isLight} ls=${saved}`);
    // ライトへ戻す
    await page.click('.tuner-theme-btn[data-theme="light"]');
    await page.waitForTimeout(150);
    isLight = await page.$eval('#tunerOverlay', el => el.classList.contains('theme-light'));
    const saved2 = await page.evaluate(() => localStorage.getItem('sg.v1.tunerTheme'));
    (isLight && saved2 === 'light') ? pass('テーマ: ライトに戻る＋保存')
                                    : fail(`テーマ: ライト不正 class=${isLight} ls=${saved2}`);
    await context.close();
  } finally { await browser.close(); }
}

// スケール練習: C メジャーを inject → 練習ボタン → E(M3)=○ / F#(外)=✕。
const SCALE_STATE = JSON.stringify({
  edit: { rootIndex: 0, activeDegrees: [0, 2, 4, 5, 7, 9, 11], presetName: 'Ionian', mode: 'scale', mask: { enabled: false, min: 0, max: 24 }, degreeColors: {}, instrument: 'guitar', visiblePositions: null },
  saved: [{ id: 1, title: 'C メジャー', rootIndex: 0, activeDegrees: [0, 2, 4, 5, 7, 9, 11], presetName: 'Ionian', mode: 'scale', mask: { enabled: false, min: 0, max: 24 }, degreeColors: {}, instrument: 'guitar', visiblePositions: null }],
  layout: { orientation: 'landscape', cols: 2, rows: 3 }, activeTab: 'saved', nextId: 2, songfileTitle: '', songfileSource: null,
});

async function onePractice(tmpDir, freq, expectNote, expectVerdict, label) {
  const wav = path.join(tmpDir, `tr-${freq}.wav`);
  writeToneWav(wav, freq, { seconds: 4 });
  const browser = await launchWith(wav);
  try {
    const context = await browser.newContext();
    await context.grantPermissions(['microphone'], { origin: URL });
    await context.addInitScript((s) => { try { localStorage.setItem('sg.v1.state', s); } catch { /* noop */ } }, SCALE_STATE);
    const page = await context.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.getElementById('alphaNotice')?.classList.add('hidden'));
    await page.click('[data-tab="saved"]').catch(() => {});
    await page.waitForSelector('.btn-practice-saved', { timeout: 4000 });
    await page.click('.btn-practice-saved');
    await page.waitForSelector('#strainerOverlay:not(.hidden)', { timeout: 3000 });
    let note = '', verdict = '';
    for (let i = 0; i < 50; i++) {
      note = await page.$eval('#strainerNote', e => e.textContent.trim());
      verdict = await page.$eval('#strainerVerdict', e => e.textContent.trim());
      if (note === expectNote && verdict === expectVerdict) break;
      await page.waitForTimeout(100);
    }
    (note === expectNote && verdict === expectVerdict)
      ? pass(`スケール練習 ${label}: ${note} ${verdict}`)
      : fail(`スケール練習 ${label}: 期待 ${expectNote}${expectVerdict} / 実際 "${note}""${verdict}"`);
    await context.close();
  } finally { await browser.close(); }
}

async function runScaleTrainer(tmpDir) {
  console.log('--- スケール練習: 正解/バツ ---');
  await onePractice(tmpDir, 329.63, 'E', '○', 'E=M3→正解');   // E は C メジャー内
  await onePractice(tmpDir, 369.99, 'F#', '✕', 'F#=外→バツ'); // F# は C メジャー外
}

// スケールトレーニング（ゲーム）: …メニュー→START→プレイ→リザルト。
async function runScaleTrainGame(tmpDir) {
  console.log('--- スケールトレーニング: 起動→プレイ→リザルト ---');
  const wav = path.join(tmpDir, 'stg-e.wav');
  writeToneWav(wav, 329.63, { seconds: 8 }); // E（C メジャー内）を継続
  const browser = await launchWith(wav);
  try {
    const context = await browser.newContext();
    await context.grantPermissions(['microphone'], { origin: URL });
    await context.addInitScript((s) => {
      try {
        localStorage.setItem('sg.v1.state', s);
        localStorage.setItem('sg.v1.stgTempo', '240'); // 速くして短時間で終わらせる
        localStorage.setItem('sg.v1.stgLoops', '1');
      } catch { /* noop */ }
    }, SCALE_STATE);
    const page = await context.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.getElementById('alphaNotice')?.classList.add('hidden'));
    await page.click('#moreTrigger');
    await page.click('[data-act="scaletrain"]');
    await page.waitForSelector('#stgOverlay:not(.hidden)', { timeout: 3000 });
    const hasProg = await page.$eval('#stgProgression', e => e.textContent.includes('C メジャー'));
    hasProg ? pass('STG: 進行にスケール表示') : fail('STG: 進行が空');

    await page.click('#stgStartBtn');
    await page.waitForSelector('#stgPlay:not(.hidden)', { timeout: 3000 });
    pass('STG: プレイ画面へ遷移');

    await page.waitForSelector('#stgResult:not(.hidden)', { timeout: 20000 });
    const rank = await page.$eval('#stgRank', e => e.textContent.trim());
    const acc = await page.$eval('#stgAccuracy', e => e.textContent.trim());
    /^[SABCD]$/.test(rank) ? pass(`STG: リザルト表示 rank=${rank} acc=${acc}`)
                           : fail(`STG: リザルトのランク異常 "${rank}"`);
    const stats = await page.$eval('#stgResultStats', e => e.textContent);
    /正解/.test(stats) ? pass('STG: スコア集計表示') : fail('STG: スコア未表示');
    await context.close();
  } finally { await browser.close(); }
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
    try { await runAlternateTuning(tmpDir); }
    catch (e) { fail(`オルタネート: 例外 ${e.message}`); }
    try { await runSweetened(tmpDir); }
    catch (e) { fail(`甘い調弦: 例外 ${e.message}`); }
    try { await runOffsetEditor(tmpDir); }
    catch (e) { fail(`オフセット編集: 例外 ${e.message}`); }
    try { await runTheme(tmpDir); }
    catch (e) { fail(`テーマ: 例外 ${e.message}`); }
    try { await runScaleTrainer(tmpDir); }
    catch (e) { fail(`スケール練習: 例外 ${e.message}`); }
    try { await runScaleTrainGame(tmpDir); }
    catch (e) { fail(`スケールトレーニング: 例外 ${e.message}`); }
    try { await runPolyphonic(tmpDir); }
    catch (e) { fail(`ポリフォニック: 例外 ${e.message}`); }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log(`\n=== 結果: ${passed} passed / ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
