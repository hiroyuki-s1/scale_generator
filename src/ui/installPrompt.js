/**
 * 「アプリとして追加」(ホーム画面に追加) ボタンの制御。
 *
 * プラットフォーム別:
 *   - Android Chrome/Edge: `beforeinstallprompt` を捕まえてボタンタップで
 *     ネイティブダイアログを出す。
 *   - iOS Safari: API が無いため、「共有ボタン → ホーム画面に追加」の
 *     手順モーダルを案内する。
 *   - iOS Chrome/Firefox: in-app ブラウザ。Safari で開き直すように案内。
 *   - すでにインストール済 (standalone モード): ボタンを隠す。
 *
 * 設計判断:
 *   - ユーザーが「却下」しても再表示する (localStorage に「却下」フラグは
 *     置かない)。スマホアプリ風の置き場所が欲しいユーザーが「気が変わった」
 *     ときに辿り着けるよう、ボタンは常に表示する。
 *   - インストール完了 (`appinstalled`) ならボタンを隠す (二度推し防止)。
 */

/** @returns {boolean} すでに standalone (ホーム画面起動) として実行中か */
function isStandalone() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari は navigator.standalone (非標準) で判定する
  if (window.navigator?.standalone === true) return true;
  return false;
}

/**
 * UA からプラットフォームを判定する。テスト用に navigator を受け取れるようにする。
 * @param {Navigator} [nav]
 * @returns {'ios-safari'|'ios-other'|'android'|'desktop'|'other'}
 */
export function detectPlatform(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav) return 'other';
  const ua = nav.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ は Mac として識別されるが touch がある
    (ua.includes('Macintosh') && (nav.maxTouchPoints || 0) > 1);
  if (isIOS) {
    // iOS の WebView/他ブラウザは UA に CriOS / FxiOS / EdgiOS が入る。
    // Safari (純正) の UA は Version/X.X Mobile/XXX Safari/XXX で、CriOS 等が含まれない。
    const isInAppOrOther = /(CriOS|FxiOS|EdgiOS|OPiOS|YJApp|FBAN|FBAV|Line)/.test(ua);
    return isInAppOrOther ? 'ios-other' : 'ios-safari';
  }
  if (/Android/.test(ua)) return 'android';
  // 一応 PC も Chrome/Edge なら beforeinstallprompt が発火するが、今回はモバイル目的なので desktop 扱い
  return 'desktop';
}

/**
 * インストール案内モーダルの中身を作る。本文と CTA はプラットフォームで切替。
 * @param {HTMLElement} modal
 * @param {ReturnType<typeof detectPlatform>} platform
 */
function fillModal(modal, platform) {
  const bodyEl = modal.querySelector('.install-modal-body-text');
  const titleEl = modal.querySelector('.install-modal-title');
  const ctaWrap = modal.querySelector('.install-modal-cta');
  if (!bodyEl || !titleEl || !ctaWrap) return;

  if (platform === 'ios-safari') {
    titleEl.textContent = 'ホーム画面に追加する';
    bodyEl.innerHTML = `
      <p class="install-modal-step"><span class="install-modal-step-num">1</span>
        画面下の <strong>共有ボタン</strong>
        <span class="install-modal-share-icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        </span>
        をタップ
      </p>
      <p class="install-modal-step"><span class="install-modal-step-num">2</span>
        メニューから <strong>「ホーム画面に追加」</strong> を選択
      </p>
      <p class="install-modal-step"><span class="install-modal-step-num">3</span>
        右上の <strong>「追加」</strong> をタップして完了
      </p>
    `;
    ctaWrap.innerHTML = '';
  } else if (platform === 'ios-other') {
    titleEl.textContent = 'Safari で開いてください';
    bodyEl.innerHTML = `
      <p class="install-modal-text">
        iOS では <strong>Safari</strong> からのみホーム画面に追加できます。
      </p>
      <p class="install-modal-text">
        画面下の「<strong>…</strong>」メニュー →
        <strong>「Safari で開く」</strong> を選んでから、もう一度このボタンを
        タップしてください。
      </p>
    `;
    ctaWrap.innerHTML = '';
  } else if (platform === 'android') {
    // beforeinstallprompt が捕れていない時のフォールバック (Chrome 以外、または
    // 既にインストール条件を満たしていない場合)
    titleEl.textContent = 'ホーム画面に追加する';
    bodyEl.innerHTML = `
      <p class="install-modal-text">
        Chrome の <strong>メニュー (︙)</strong> から
        <strong>「ホーム画面に追加」</strong> を選んでください。
      </p>
      <p class="install-modal-text install-modal-text-sub">
        メニューに表示されない場合は、しばらく使用してから再度お試しください
        (利用実績が一定以上ないと表示されないことがあります)。
      </p>
    `;
    ctaWrap.innerHTML = '';
  } else {
    titleEl.textContent = 'ブックマークに登録する';
    bodyEl.innerHTML = `
      <p class="install-modal-text">
        PC では <strong>Ctrl + D</strong> (Mac は <strong>⌘ + D</strong>)
        でこのページをブックマークできます。
      </p>
    `;
    ctaWrap.innerHTML = '';
  }
}

/**
 * 「アプリとして追加」ボタン + モーダルを初期化する。
 * @param {{platform?:ReturnType<typeof detectPlatform>}} [opts]
 */
export function initInstallPrompt(opts = {}) {
  const btn   = document.getElementById('installBtn');
  const modal = document.getElementById('installModal');
  if (!btn || !modal) return;

  // 既にホーム画面アプリとして起動されている場合はボタン自体を隠す
  if (isStandalone()) {
    btn.style.display = 'none';
    return;
  }

  const platform = opts.platform ?? detectPlatform();

  /** @type {Event & {prompt:()=>void, userChoice:Promise<{outcome:string}>} | null} */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
  });
  // インストール完了したらボタンを隠して再案内しない
  window.addEventListener('appinstalled', () => {
    btn.style.display = 'none';
    modal.classList.add('hidden');
  });

  function openModal() {
    fillModal(modal, platform);
    modal.classList.remove('hidden');
  }
  function closeModal() {
    modal.classList.add('hidden');
  }

  btn.addEventListener('click', async () => {
    // Android で beforeinstallprompt が取れていればネイティブダイアログを優先
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } catch { /* ユーザーキャンセル等は無視 */ }
      // 1度しか使えないのでクリアする
      deferredPrompt = null;
      return;
    }
    openModal();
  });

  modal.querySelector('.install-modal-close')?.addEventListener('click', closeModal);
  // 背景クリックで閉じる
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal();
  });
}
