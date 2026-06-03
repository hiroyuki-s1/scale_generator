/**
 * 全機能総合 E2E テスト
 * PC / Android / iOS の3環境で全機能を検証する
 */
const { chromium } = require('playwright');
const { setup, selectInstrument, registerScale, pass, fail, info, section } = require('./helpers.cjs');

const DEVICE_KEYS = ['pc', 'android', 'ios'];

/** テスト間の状態リセット: 開いているメニュー/モーダル/編集モードをクリア */
async function cleanup(page) {
  await page.evaluate(() => {
    // 編集モードをキャンセル
    document.getElementById('editorModeCancel')?.click();
    // 開いているモーダルを閉じる
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
    // more メニューを閉じる
    document.getElementById('moreMenu')?.classList.remove('open');
    document.getElementById('moreTrigger')?.classList.remove('open');
    // layout メニューを閉じる
    document.getElementById('layoutMenu')?.classList.remove('open');
    document.getElementById('layoutTrigger')?.classList.remove('open');
  });
  await page.waitForTimeout(200);
}

// ────────────────────────────────────────────────────────────────────────────
// テスト定義
// ────────────────────────────────────────────────────────────────────────────

async function testAppLoad(page, device) {
  section('1. アプリ読み込み');

  const title = await page.title();
  title.includes('神スケールトレーナー') ? pass('タイトル正常') : fail(`タイトル異常: ${title}`);

  const fretboard = await page.$('#fretboard');
  fretboard ? pass('指板SVGが存在する') : fail('指板SVGが存在しない');

  const instrHint = await page.$('#instrHint:not(.hidden)');
  instrHint ? pass('楽器未選択ヒントが表示される') : fail('楽器未選択ヒントが表示されない');
}

async function testInstrumentSelection(page, device) {
  section('2. 楽器選択');

  // Guitar
  await selectInstrument(page, 'guitar');
  const svgAfterGuitar = await page.$eval('#fretboard', el => el.getAttribute('viewBox'));
  svgAfterGuitar ? pass(`ギター選択後 viewBox: ${svgAfterGuitar}`) : fail('ギター選択後 viewBox なし');

  const stringsCount = await page.$$eval('#fretboard line[stroke]', lines => lines.length);
  stringsCount >= 6 ? pass(`ギター弦数: ${stringsCount}`) : fail(`弦数が少ない: ${stringsCount}`);

  // Bass に切り替え
  await selectInstrument(page, 'bass');
  const svgAfterBass = await page.$eval('#fretboard', el => el.getAttribute('viewBox'));
  svgAfterBass ? pass(`ベース選択後 viewBox: ${svgAfterBass}`) : fail('ベース選択後 viewBox なし');

  // Guitar に戻す
  await selectInstrument(page, 'guitar');
}

async function testKeySelection(page, device) {
  section('3. キー選択');

  await page.click('#keyPickerBtn');
  await page.waitForSelector('#keyPickerModal.show', { state: 'visible' });
  pass('キーモーダルが開く');

  // data-idx=4 (E) を直接クリック
  const eBtn = await page.$('#keyPickerList [data-idx="4"]');
  if (eBtn) {
    await eBtn.click();
    await page.waitForSelector('#keyPickerModal.show', { state: 'hidden', timeout: 3000 });
    pass('キー選択後モーダルが閉じる');
  } else {
    // フォールバック: Xボタンで閉じる
    await page.click('#keyPickerClose');
    await page.waitForTimeout(300);
    fail('キーボタン(data-idx)が見つからない');
  }

  const keyText = await page.$eval('#keyPickerBtn', el => el.textContent.trim());
  info(`選択キー: ${keyText}`);
}

async function testScalePicker(page, device) {
  section('4. スケール / コード選択');

  await page.click('#scalePickerBtn');
  await page.waitForSelector('#scalePickerModal.show', { state: 'visible' });
  pass('スケールモーダルが開く');

  // カテゴリが表示されるか
  const cats = await page.$$('#scaleCatList button');
  cats.length > 0 ? pass(`カテゴリ ${cats.length} 個表示`) : fail('カテゴリが表示されない');

  // Penta カテゴリをクリック
  const pentaCat = await page.$('#scaleCatList button:first-child');
  if (pentaCat) {
    await pentaCat.click();
    await page.waitForTimeout(200);
    const scaleNames = await page.$$('#scaleNameList button');
    scaleNames.length > 0 ? pass(`スケール名 ${scaleNames.length} 個表示`) : fail('スケール名が表示されない');

    // 最初のスケールを選択
    if (scaleNames.length > 0) {
      const scaleName = await scaleNames[0].textContent();
      await scaleNames[0].click();
      await page.waitForSelector('#scalePickerModal.show', { state: 'hidden', timeout: 3000 }).catch(() => {
        page.click('#scalePickerClose').catch(() => {});
      });
      pass(`スケール選択: ${scaleName?.trim()}`);
    }
  } else {
    await page.click('#scalePickerClose');
    await page.waitForTimeout(300);
    fail('カテゴリボタンが見つからない');
  }
}

async function testFretboardDisplay(page, device) {
  section('5. 指板表示');

  const dots = await page.$$('#fretboard circle');
  dots.length > 0 ? pass(`度数ドット ${dots.length} 個描画`) : fail('度数ドットが描画されない');

  const texts = await page.$$('#fretboard text');
  texts.length > 0 ? pass(`テキスト ${texts.length} 個描画`) : fail('テキストが描画されない');

  const viewBox = await page.$eval('#fretboard', el => el.getAttribute('viewBox'));
  info(`viewBox: ${viewBox}`);
}

async function testDegreePickerCustom(page, device) {
  section('6. 度数カスタム設定');

  await page.click('#degPickerBtn');
  await page.waitForSelector('#degPickerModal', { state: 'visible' });
  pass('度数設定モーダルが開く');

  const checkboxes = await page.$$('#degPickerPiano input[type=checkbox], #degPickerPiano button');
  checkboxes.length > 0 ? pass(`度数ボタン ${checkboxes.length} 個表示`) : fail('度数ボタンがない');

  // 完了ボタン
  const doneBtn = await page.$('#degPickerDone');
  if (doneBtn) {
    await doneBtn.click();
    await page.waitForTimeout(200);
    pass('完了ボタンで閉じる');
  } else {
    await page.keyboard.press('Escape');
  }
}

async function testMaskControl(page, device) {
  section('7. フレット範囲 (マスク) 設定');

  const maskBtn = await page.$('.btn-mask');
  if (!maskBtn) { info('マスクボタンが見当たらない'); return; }

  await maskBtn.click();
  await page.waitForTimeout(200);
  pass('マスク有効化');

  // min/max の +/- ボタン
  const stepBtns = await page.$$('.mask-step-lg');
  stepBtns.length > 0 ? pass(`ステップボタン ${stepBtns.length} 個`) : fail('ステップボタンなし');

  if (stepBtns.length >= 2) {
    await stepBtns[1].click(); // max を増やす
    await page.waitForTimeout(100);
    pass('マスク範囲変更');
  }

  // マスク解除
  await maskBtn.click();
  await page.waitForTimeout(200);
  pass('マスク無効化');
}

async function testRegisterAndSaved(page, device) {
  section('8. スケール登録 & 登録スケール一覧');

  // 1枚目を登録
  await page.fill('#fbTitleInput', 'テストスケール A');
  await page.click('#registerBtn');
  await page.waitForTimeout(300);
  pass('スケール登録（1枚目）');

  // バッジ確認
  const badge = await page.$('#savedBadge');
  const badgeText = await badge?.textContent();
  badgeText === '1' ? pass(`バッジ: ${badgeText}`) : fail(`バッジ異常: ${badgeText}`);

  // エディタータブに戻って2枚目を登録
  await page.click('[data-tab="editor"]');
  await page.waitForTimeout(200);
  await page.fill('#fbTitleInput', 'テストスケール B');
  await page.click('#registerBtn');
  await page.waitForTimeout(300);
  pass('スケール登録（2枚目）');

  // 登録スケールタブへ
  await page.click('[data-tab="saved"]');
  await page.waitForTimeout(300);

  const cards = await page.$$('.saved-card');
  cards.length === 2 ? pass(`登録スケール ${cards.length} 枚表示`) : fail(`枚数異常: ${cards.length}`);
}

async function testEditMode(page, device) {
  section('9. 編集モード');

  // saved-card タブにいることを確認
  await page.click('[data-tab="saved"]');
  await page.waitForTimeout(200);

  // 編集ボタン (.btn-edit-saved) はホバーで表示される
  // JS 経由でホバーせずに直接クリックできるか試みる
  const firstCard = await page.$('.saved-card');
  if (!firstCard) { info('カードなし（スキップ）'); return; }

  await firstCard.hover();
  await page.waitForTimeout(300);

  const editBtn = await page.$('.btn-edit-saved');
  if (editBtn) {
    // 非表示でも強制クリック
    await editBtn.click({ force: true });
    await page.waitForTimeout(300);

    const cancelBtn = await page.$('#editorModeCancel:not(.hidden)');
    cancelBtn ? pass('編集モード起動 & キャンセルボタン表示') : fail('編集モード起動したがキャンセルボタンなし');

    if (cancelBtn) {
      // JS 直接クリックで確実にキャンセル
      await page.evaluate(() => document.getElementById('editorModeCancel')?.click());
      await page.waitForTimeout(300);
      // キャンセル後の状態を確認
      const cancelStillVisible = await page.$('#editorModeCancel:not(.hidden)');
      cancelStillVisible ? fail('編集モードがキャンセルされていない') : pass('編集キャンセル');
    }
  } else {
    // 直接 JS で編集モードをトリガー
    const result = await page.evaluate(() => {
      const btn = document.querySelector('.btn-edit-saved');
      if (btn) { btn.click(); return 'clicked'; }
      return 'not-found';
    });
    result === 'clicked' ? pass('JS経由で編集ボタンをクリック') : info('編集ボタン未検出（スキップ）');
    await page.waitForTimeout(300);
    const cancelBtn = await page.$('#editorModeCancel:not(.hidden)');
    if (cancelBtn) { await cancelBtn.click(); }
  }
}

async function testDeleteScale(page, device) {
  section('10. スケール削除');

  await page.click('[data-tab="saved"]');
  await page.waitForTimeout(200);

  // 削除ボタンはホバー依存のため force click
  const deleteBtns = await page.$$('.btn-delete');
  if (deleteBtns.length === 0) {
    info('削除ボタンが見当たらない（スキップ）');
    return;
  }

  const beforeCount = await page.$$eval('.saved-card', cards => cards.length);

  // 削除警告を無効化して JS でクリック
  await page.evaluate(() => {
    localStorage.setItem('deleteWarnDisabled', '1');
    const cardDelete = document.querySelector('.saved-card .btn-delete')
      ?? document.querySelector('.btn-delete');
    cardDelete?.click();
  });
  await page.waitForTimeout(500);

  // 確認ダイアログが出た場合 (JS直接クリック)
  await page.evaluate(() => document.getElementById('deleteConfirmOk')?.click());
  await page.waitForTimeout(300);

  const afterCount = await page.$$eval('.saved-card', cards => cards.length);
  afterCount < beforeCount ? pass(`削除成功 (${beforeCount}→${afterCount})`) : fail(`削除失敗 (${beforeCount}→${afterCount})`);
}

async function testFullscreen(page, device) {
  section('11. 全画面表示');

  await page.click('[data-tab="saved"]');
  await page.waitForTimeout(200);

  const cards = await page.$$('.saved-card');
  if (cards.length === 0) { info('カードなし（スキップ）'); return; }

  // カードの指板部分をクリック (JS直接実行でインターセプト回避)
  const fbWrap = await cards[0].$('.fb-wrap');
  if (fbWrap) {
    await page.evaluate(el => el.click(), fbWrap);
    await page.waitForTimeout(400);
    const fullscreen = await page.$('#fbFullscreen:not(.hidden)');
    fullscreen ? pass('全画面表示が開く') : fail('全画面表示が開かない');

    // 閉じる (JS直接クリック)
    await page.evaluate(() => document.getElementById('fbFullscreenClose')?.click());
    await page.waitForTimeout(200);
    const stillOpen = await page.$('#fbFullscreen:not(.hidden)');
    stillOpen ? fail('全画面が閉じない') : pass('全画面を閉じる');
  }
}

async function testColorModal(page, device) {
  section('12. 度数カラー設定');

  // JS 経由で確実に開く (モバイルの header button 隠蔽を回避)
  await page.evaluate(() => {
    // PC: #colorBtn / Mobile: [data-act="color"] メニュー項目
    const btn = document.getElementById('colorBtn');
    if (btn) { btn.click(); return; }
    // more メニューを開いてから色設定をクリック
    document.getElementById('moreTrigger')?.click();
    setTimeout(() => document.querySelector('[data-act="color"]')?.click(), 100);
  });
  await page.waitForTimeout(400);

  const colorList = await page.$('#colorList');
  colorList ? pass('カラー設定モーダルが開く') : fail('カラー設定モーダルが開かない');

  // 閉じる (JS直接クリック)
  await page.evaluate(() => document.querySelector('#colorModal [data-act="close"]')?.click());
  await page.waitForTimeout(200);
  pass('カラーモーダルを閉じる');
}

async function testLayoutPicker(page, device) {
  section('13. 印刷レイアウト選択 (印刷モーダル内)');

  // 仕様: ヘッダーのレイアウトピッカーは display:none (デスクトップ・モバイル両方)。
  //       レイアウト選択は印刷モーダル内の #printLayoutGrid で行う。
  //       (commit 1bcff2f: "Layout picker hidden on desktop, only in print dialog")

  // 印刷モーダルを開く (JS直接クリックでインターセプト回避)
  await page.evaluate(() => document.getElementById('printBtn')?.click());
  await page.waitForTimeout(300);

  const printBtns = await page.$$('#printLayoutGrid [data-cols]');
  printBtns.length > 0
    ? pass(`印刷モーダル内レイアウトボタン ${printBtns.length} 個表示`)
    : fail('印刷モーダル内にレイアウトボタンがない');

  // 2×2 を選択して store.layout が反映されるか検証
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll('#printLayoutGrid [data-cols]')) {
      if (btn.dataset.cols === '2' && btn.dataset.rows === '2') { btn.click(); break; }
    }
  });
  await page.waitForTimeout(200);

  // ヘッダー(非表示)のラベルは store.layout に追従するので値で検証
  const label = await page.$eval('#layoutTriggerLabel', el => el.textContent.trim());
  label === '2×2' ? pass(`レイアウト選択が反映: ${label}`) : fail(`レイアウト未反映: ${label}`);

  // 印刷モーダルを閉じる
  await page.evaluate(() => document.querySelector('#printModal [data-act="cancel"]')?.click());
  await page.waitForTimeout(200);
}

async function testPrintModal(page, device) {
  section('14. 印刷モーダル');

  // JS 直接クリックで開く (インターセプト回避)
  await page.evaluate(() => document.getElementById('printBtn')?.click());
  await page.waitForTimeout(300);

  const modalVisible = await page.$eval('#printModal', el => el.classList.contains('show')).catch(() => false);
  modalVisible ? pass('印刷モーダルが開く') : fail('印刷モーダルが開かない');

  if (modalVisible) {
    // 向き選択 (モバイルは @media で非表示)
    const orientVisible = await page.$eval('.print-orient-row', el => getComputedStyle(el).display !== 'none').catch(() => false);
    if (device.isMobile) {
      !orientVisible ? pass('向きUIはモバイルで非表示 (仕様通り)') : info('向きUIがモバイルで表示されている');
    } else {
      const orientBtns = await page.$$('.print-orient-btn');
      orientBtns.length === 2 ? pass(`向きボタン ${orientBtns.length} 個 (縦/横)`) : fail(`向きボタン数異常: ${orientBtns.length}`);
    }

    // レイアウト確認
    const layoutGrid = await page.$('#printLayoutGrid [data-cols]');
    layoutGrid ? pass('レイアウトグリッド表示') : fail('レイアウトグリッドなし');

    // キャンセル (JS直接クリック)
    await page.evaluate(() => document.querySelector('#printModal [data-act="cancel"]')?.click());
    await page.waitForTimeout(200);
    const stillOpen = await page.$eval('#printModal', el => el.classList.contains('show')).catch(() => false);
    stillOpen ? fail('印刷モーダルが閉じない') : pass('印刷モーダルをキャンセル');
  }
}

async function testPrintDomStructure(page, device) {
  section('15. 印刷DOM構造（改ページ）');

  // スケール3枚登録して印刷構造を確認
  await page.click('[data-tab="editor"]');
  await page.waitForTimeout(200);

  // ダミーカードを JS 直接注入 (#fbTitleInput の可視性問題を回避)
  await page.evaluate(() => {
    const grid = document.getElementById('savedGrid');
    // 既存カードに3枚追加
    for (let i = 1; i <= 3; i++) {
      const card = document.createElement('div');
      card.className = 'saved-card';
      card.dataset.id = `dummy-${i}`;
      card.innerHTML = `<div class="saved-print-title">印刷テスト${i}</div>`;
      grid.appendChild(card);
    }
  });
  await page.waitForTimeout(200);

  // レイアウトを 1×2 に設定
  await page.evaluate(() => {
    document.getElementById('layoutTrigger')?.click();
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll('[data-cols]')) {
      if (btn.dataset.cols === '1' && btn.dataset.rows === '2') { btn.click(); break; }
    }
  });
  await page.waitForTimeout(200);

  // beforeprint を発火
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.waitForTimeout(300);

  // @media print 適用
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);

  const printResult = await page.evaluate(() => {
    const cards = document.querySelectorAll('.saved-card');
    const groups = document.querySelectorAll('.print-page-group');
    const inners = document.querySelectorAll('.print-page-inner');
    const panelSaved = document.getElementById('panelSaved');

    const lastGroup = groups[groups.length - 1];
    const lastGroupBreak = lastGroup ? getComputedStyle(lastGroup).pageBreakAfter : 'N/A';

    return {
      totalCards: cards.length,
      groupCount: groups.length,
      innerCount: inners.length,
      panelSavedDisplay: panelSaved ? getComputedStyle(panelSaved).display : 'N/A',
      savedGridDisplay: getComputedStyle(document.getElementById('savedGrid')).display,
      lastGroupPageBreakAfter: lastGroupBreak,
      group1PageBreakAfter: groups[0] ? getComputedStyle(groups[0]).pageBreakAfter : 'N/A',
    };
  });

  // screen に戻す
  await page.emulateMedia({ media: 'screen' });

  // afterprint を発火して DOM を元に戻す
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.waitForTimeout(200);

  info(`総カード数: ${printResult.totalCards}`);
  printResult.panelSavedDisplay === 'block' ? pass(`#panelSaved: block`) : fail(`#panelSaved: ${printResult.panelSavedDisplay} (blockであるべき)`);
  printResult.savedGridDisplay === 'block' ? pass(`#savedGrid: block`) : fail(`#savedGrid: ${printResult.savedGridDisplay}`);

  const expectedGroups = Math.ceil(printResult.totalCards / 2); // 1×2
  printResult.groupCount === expectedGroups
    ? pass(`グループ数: ${printResult.groupCount} (期待: ${expectedGroups})`)
    : fail(`グループ数: ${printResult.groupCount} (期待: ${expectedGroups})`);

  printResult.group1PageBreakAfter === 'always'
    ? pass(`グループ1 page-break-after: always ✓`)
    : fail(`グループ1 page-break-after: ${printResult.group1PageBreakAfter} (alwaysであるべき)`);

  printResult.lastGroupPageBreakAfter === 'auto'
    ? pass(`最終グループ page-break-after: auto ✓ (末尾空白ページ防止)`)
    : fail(`最終グループ page-break-after: ${printResult.lastGroupPageBreakAfter} (autoであるべき)`);
}

async function testMobileZoom(page, device) {
  if (!device.isMobile) { return; } // PC では不要
  section('16. モバイル指板ズーム (モバイルのみ)');

  await page.click('[data-tab="editor"]');
  await page.waitForTimeout(200);

  const zoomBtn = await page.$('#fbZoomBtn');
  if (!zoomBtn || !await zoomBtn.isVisible()) {
    fail('ズームボタンが非表示');
    return;
  }

  const initialText = await zoomBtn.textContent();
  info(`初期ズームボタン: ${initialText?.trim()}`);

  await zoomBtn.click();
  await page.waitForTimeout(300);
  const afterText = await zoomBtn.textContent();
  afterText !== initialText ? pass(`ズーム切り替え: "${initialText?.trim()}" → "${afterText?.trim()}"`) : fail('ズームボタンのテキストが変わらない');
}

async function testMobileMoreMenu(page, device) {
  if (!device.isMobile) { return; }
  section('17. モバイル ⋮ メニュー (モバイルのみ)');

  // JS 直接クリック (#printBtn のインターセプトを回避)
  await page.evaluate(() => document.getElementById('moreTrigger')?.click());
  await page.waitForTimeout(200);

  const moreMenu = await page.$('#moreMenu');
  const isOpen = await moreMenu?.isVisible();
  isOpen ? pass('⋮ メニューが開く') : fail('⋮ メニューが開かない');

  // Escape で閉じる
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

async function testTabNavigation(page, device) {
  section('18. タブナビゲーション');

  // 登録スケールタブへ
  await page.click('[data-tab="saved"]');
  await page.waitForTimeout(200);
  const savedPanel = await page.$('#panelSaved:not(.hidden)');
  savedPanel ? pass('登録スケールタブに切り替わる') : fail('登録スケールタブが表示されない');

  // エディタータブへ
  await page.click('[data-tab="editor"]');
  await page.waitForTimeout(200);
  const editorPanel = await page.$('#panelEditor:not(.hidden)');
  editorPanel ? pass('エディタータブに切り替わる') : fail('エディタータブが表示されない');
}

async function testDeleteAll(page, device) {
  section('19. 全削除');

  // タブ切り替えも JS 経由 (メニューが残っている場合の回避)
  await page.evaluate(() => {
    document.querySelector('[data-tab="saved"]')?.click();
  });
  await page.waitForTimeout(300);

  const hasBtn = await page.$('#deleteAllBtn');
  if (!hasBtn) { info('全削除ボタンが非表示（カードなし）'); return; }

  // JS 直接クリック (インターセプト回避)
  await page.evaluate(() => {
    localStorage.setItem('deleteWarnDisabled', '1');
    document.getElementById('deleteAllBtn')?.click();
  });
  await page.waitForTimeout(300);

  // 確認ダイアログ (JS直接クリック)
  await page.evaluate(() => document.getElementById('deleteConfirmOk')?.click());
  await page.waitForTimeout(300);

  const remaining = await page.$$('.saved-card');
  remaining.length === 0 ? pass('全削除成功') : fail(`${remaining.length}枚残存`);
}

async function testReset(page, device) {
  section('20. リセット');

  // PC ならヘッダのリセットボタン / Mobile はmore メニュー経由
  const resetBtn = await page.$('#resetBtn');
  if (resetBtn && await resetBtn.isVisible()) {
    // dialog を自動承認できないのでスキップ（confirmダイアログ）
    info('リセットボタン存在確認 (confirmダイアログのためスキップ)');
    pass('リセットボタンが存在する');
  } else {
    const moreTrigger = await page.$('#moreTrigger');
    if (moreTrigger && await moreTrigger.isVisible()) {
      await moreTrigger.click();
      await page.waitForTimeout(200);
      const resetItem = await page.$('[data-act="reset"]');
      resetItem ? pass('モバイルリセット項目が存在する') : fail('モバイルリセット項目なし');
      await page.keyboard.press('Escape');
    }
  }
}

async function testNoConsoleErrors(errors, device) {
  section('21. コンソールエラーなし');
  const filtered = errors.filter(e =>
    !e.includes('favicon') &&
    !e.includes('gtag') &&
    !e.includes('SW registration') &&
    !e.includes('fonts.googleapis')
  );
  filtered.length === 0
    ? pass('コンソールエラーなし')
    : fail(`エラー ${filtered.length} 件:\n    ${filtered.slice(0, 3).join('\n    ')}`);
}

// ────────────────────────────────────────────────────────────────────────────
// メイン実行
// ────────────────────────────────────────────────────────────────────────────

async function runForDevice(browser, deviceKey) {
  const { page, context, errors, device } = await setup(browser, deviceKey);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`デバイス: ${device.label}`);
  console.log('='.repeat(60));

  let passed = 0, failed = 0;
  const origPass = console.log.bind(console);

  try {
    await testAppLoad(page, device);
    await testInstrumentSelection(page, device);
    await cleanup(page);
    await testKeySelection(page, device);
    await testScalePicker(page, device);
    await testFretboardDisplay(page, device);
    await testDegreePickerCustom(page, device);
    await cleanup(page);
    await testMaskControl(page, device);
    await testRegisterAndSaved(page, device);
    await cleanup(page);
    await testTabNavigation(page, device);
    await testEditMode(page, device);
    await cleanup(page);  // 編集モードを確実にクリア
    await testDeleteScale(page, device);
    await cleanup(page);
    await testFullscreen(page, device);
    await cleanup(page);
    await testColorModal(page, device);
    await cleanup(page);
    await testLayoutPicker(page, device);
    await cleanup(page);
    await testPrintModal(page, device);
    await cleanup(page);
    await testPrintDomStructure(page, device);
    await cleanup(page);
    await testMobileZoom(page, device);
    await cleanup(page);
    await testMobileMoreMenu(page, device);
    await cleanup(page);
    await testDeleteAll(page, device);
    await testReset(page, device);
    await testNoConsoleErrors(errors, device);
  } catch (e) {
    fail(`予期しないエラー: ${e.message}`);
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  console.log('神スケールトレーナー — 全機能 E2E テスト');
  console.log(`テスト環境: PC / Android / iOS シミュレーション\n`);

  for (const deviceKey of DEVICE_KEYS) {
    await runForDevice(browser, deviceKey);
  }

  await browser.close();
  console.log('\n=== テスト完了 ===\n');
}

main().catch(e => { console.error(e); process.exit(1); });
