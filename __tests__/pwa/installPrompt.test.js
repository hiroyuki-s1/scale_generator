/**
 * installPrompt の振る舞いテスト
 *
 * 検証項目:
 *   1. detectPlatform — UA からの判定 (iOS Safari / iOS他 / Android / Desktop)
 *   2. initInstallPrompt — DOM が無いときは無害に終了する
 *   3. initInstallPrompt — standalone (ホーム画面起動) でボタンが隠れる
 *   4. initInstallPrompt — Android で beforeinstallprompt を捕捉してクリックで prompt
 *   5. initInstallPrompt — iOS Safari でクリック → モーダルに「ホーム画面に追加」表示
 *   6. initInstallPrompt — iOS 他ブラウザでクリック → 「Safari で開いてください」案内
 *   7. initInstallPrompt — appinstalled でボタンが隠れる
 *   8. initInstallPrompt — モーダル背景クリックで閉じる
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
// jsdom env をローカル指定 (他テストは Node 環境)
// @vitest-environment jsdom
import { detectPlatform, initInstallPrompt } from '../../src/ui/installPrompt.js';

const UA = {
  iosSafari17: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  iosChrome:   'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
  iosFirefox:  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/604.1',
  iosLine:     'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Line/14.0.0',
  android:     'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  pcChrome:    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  ipadOs:      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
};

describe('detectPlatform', () => {
  it('iOS Safari (純正) → ios-safari', () => {
    expect(detectPlatform({ userAgent: UA.iosSafari17 })).toBe('ios-safari');
  });
  it('iOS Chrome (CriOS) → ios-other', () => {
    expect(detectPlatform({ userAgent: UA.iosChrome })).toBe('ios-other');
  });
  it('iOS Firefox (FxiOS) → ios-other', () => {
    expect(detectPlatform({ userAgent: UA.iosFirefox })).toBe('ios-other');
  });
  it('iOS LINE in-app → ios-other', () => {
    expect(detectPlatform({ userAgent: UA.iosLine })).toBe('ios-other');
  });
  it('Android → android', () => {
    expect(detectPlatform({ userAgent: UA.android })).toBe('android');
  });
  it('PC Chrome → desktop', () => {
    expect(detectPlatform({ userAgent: UA.pcChrome })).toBe('desktop');
  });
  it('iPadOS (Mac UA + touch) → ios-safari', () => {
    expect(detectPlatform({ userAgent: UA.ipadOs, maxTouchPoints: 5 })).toBe('ios-safari');
  });
  it('真の Mac (touch なし) → desktop', () => {
    expect(detectPlatform({ userAgent: UA.ipadOs, maxTouchPoints: 0 })).toBe('desktop');
  });
  it('nav 無し → other', () => {
    expect(detectPlatform(null)).toBe('other');
  });
});

function buildDom() {
  document.body.innerHTML = `
    <button id="installBtn">アプリとして追加</button>
    <div id="installModal" class="hidden">
      <div class="install-modal-inner">
        <div class="install-modal-body">
          <div class="install-modal-title"></div>
          <div class="install-modal-body-text"></div>
          <div class="install-modal-actions">
            <span class="install-modal-cta"></span>
            <button class="install-modal-close">閉じる</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

describe('initInstallPrompt — DOM 振る舞い', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // matchMedia stub (jsdom には無い)
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    // navigator.standalone を強制リセット
    if ('standalone' in window.navigator) {
      try { delete window.navigator.standalone; } catch { /* ignore */ }
    }
  });

  it('DOM が無いと無害に終了 (例外を投げない)', () => {
    expect(() => initInstallPrompt()).not.toThrow();
  });

  it('display-mode standalone のときボタンを隠す', () => {
    buildDom();
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    initInstallPrompt({ platform: 'android' });
    expect(document.getElementById('installBtn').style.display).toBe('none');
  });

  it('iOS Safari の navigator.standalone=true でも隠す', () => {
    buildDom();
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    initInstallPrompt({ platform: 'ios-safari' });
    expect(document.getElementById('installBtn').style.display).toBe('none');
  });

  it('Android: beforeinstallprompt → クリックでネイティブ prompt を呼ぶ', async () => {
    buildDom();
    initInstallPrompt({ platform: 'android' });
    const promptSpy = vi.fn();
    const fakeEvent = Object.assign(new Event('beforeinstallprompt'), {
      prompt: promptSpy,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    window.dispatchEvent(fakeEvent);
    document.getElementById('installBtn').click();
    await Promise.resolve();
    expect(promptSpy).toHaveBeenCalledTimes(1);
    // モーダルは開かない (ネイティブダイアログを使うため)
    expect(document.getElementById('installModal').classList.contains('hidden')).toBe(true);
  });

  it('iOS Safari: クリックでモーダルが「ホーム画面に追加する」で開く', () => {
    buildDom();
    initInstallPrompt({ platform: 'ios-safari' });
    document.getElementById('installBtn').click();
    const modal = document.getElementById('installModal');
    expect(modal.classList.contains('hidden')).toBe(false);
    expect(modal.querySelector('.install-modal-title').textContent).toContain('ホーム画面');
    // 共有ボタン手順が明記される
    expect(modal.querySelector('.install-modal-body-text').innerHTML).toContain('共有ボタン');
    expect(modal.querySelector('.install-modal-body-text').innerHTML).toContain('ホーム画面に追加');
  });

  it('iOS 他ブラウザ: Safari で開く案内', () => {
    buildDom();
    initInstallPrompt({ platform: 'ios-other' });
    document.getElementById('installBtn').click();
    const modal = document.getElementById('installModal');
    expect(modal.classList.contains('hidden')).toBe(false);
    expect(modal.querySelector('.install-modal-title').textContent).toContain('Safari');
  });

  it('Android で beforeinstallprompt が無いとき: フォールバック案内モーダル', () => {
    buildDom();
    initInstallPrompt({ platform: 'android' });
    document.getElementById('installBtn').click();
    const modal = document.getElementById('installModal');
    expect(modal.classList.contains('hidden')).toBe(false);
    expect(modal.querySelector('.install-modal-title').textContent).toContain('ホーム画面');
  });

  it('Desktop: ブックマーク案内 (Ctrl+D)', () => {
    buildDom();
    initInstallPrompt({ platform: 'desktop' });
    document.getElementById('installBtn').click();
    const modal = document.getElementById('installModal');
    expect(modal.classList.contains('hidden')).toBe(false);
    expect(modal.querySelector('.install-modal-body-text').innerHTML).toMatch(/Ctrl\s*\+\s*D|⌘\s*\+\s*D/);
  });

  it('appinstalled イベントでボタンとモーダルを隠す', () => {
    buildDom();
    initInstallPrompt({ platform: 'ios-safari' });
    document.getElementById('installBtn').click();
    expect(document.getElementById('installModal').classList.contains('hidden')).toBe(false);
    window.dispatchEvent(new Event('appinstalled'));
    expect(document.getElementById('installBtn').style.display).toBe('none');
    expect(document.getElementById('installModal').classList.contains('hidden')).toBe(true);
  });

  it('モーダル背景クリックで閉じる (内側クリックは閉じない)', () => {
    buildDom();
    initInstallPrompt({ platform: 'ios-safari' });
    document.getElementById('installBtn').click();
    const modal = document.getElementById('installModal');
    // 内側 (inner) をクリックしても閉じない
    modal.querySelector('.install-modal-inner').click();
    expect(modal.classList.contains('hidden')).toBe(false);
    // 背景 (modal 自身) をクリックすると閉じる
    modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(modal.classList.contains('hidden')).toBe(true);
  });

  it('閉じるボタンでモーダルが閉じる', () => {
    buildDom();
    initInstallPrompt({ platform: 'ios-safari' });
    document.getElementById('installBtn').click();
    document.querySelector('.install-modal-close').click();
    expect(document.getElementById('installModal').classList.contains('hidden')).toBe(true);
  });
});
