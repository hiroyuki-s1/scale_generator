import { normalizeReleaseNotes, isNewerVersion } from '../domain/releaseNotes.js';

/**
 * リリースノートモーダル。`…` メニューの「リリースノート」から開く。
 * 一次ソースは public/release-notes.json（fetch、base path に追従）。
 * 原則「落とさない・黙らせない」: fetch/parse 失敗時もアプリは継続し、
 * モーダル内にフォールバック文言を出して console.error を残す。
 *
 * @param {string} currentVersion 現行バージョン（package.json / __VERSION__）
 */
const LAST_SEEN_KEY = 'sg.v1.lastSeenRelease';

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode: skip */ }
}

export function initReleaseNotes(currentVersion) {
  const modal    = document.getElementById('releaseNotesModal');
  const list     = document.getElementById('releaseNotesList');
  const menuItem = document.querySelector('[data-act="release-notes"]');
  const badge    = document.getElementById('releaseNotesBadge');
  const trigger  = document.getElementById('moreTrigger');
  if (!modal || !list) return;
  const closeBtn = modal.querySelector('[data-act="close"]');

  let cache = null; // 正規化済みリリース配列（初回 fetch 後に保持）

  function refreshUnread() {
    const unread = isNewerVersion(currentVersion, safeGet(LAST_SEEN_KEY));
    badge?.classList.toggle('hidden', !unread);
    trigger?.classList.toggle('has-unread', unread);
  }

  function renderError() {
    list.innerHTML = '';
    const p = document.createElement('div');
    p.className = 'release-notes-error';
    p.textContent = 'リリースノートを読み込めませんでした。';
    list.appendChild(p);
  }

  function render(releases) {
    list.innerHTML = '';
    if (!releases.length) {
      const p = document.createElement('div');
      p.className = 'release-notes-empty';
      p.textContent = 'リリースノートはまだありません。';
      list.appendChild(p);
      return;
    }
    releases.forEach(rel => {
      const item = document.createElement('div');
      item.className = 'release-note-item';

      const head = document.createElement('div');
      head.className = 'release-note-head';
      const ver = document.createElement('span');
      ver.className = 'release-note-version';
      ver.textContent = rel.version ? `v${rel.version}` : '';
      const date = document.createElement('span');
      date.className = 'release-note-date';
      date.textContent = rel.date;
      head.appendChild(ver);
      head.appendChild(date);
      item.appendChild(head);

      if (rel.highlights.length) {
        const ul = document.createElement('ul');
        ul.className = 'release-note-highlights';
        rel.highlights.forEach(h => {
          const li = document.createElement('li');
          li.textContent = h;
          ul.appendChild(li);
        });
        item.appendChild(ul);
      }
      list.appendChild(item);
    });
  }

  async function load() {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}release-notes.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      cache = normalizeReleaseNotes(data);
      render(cache);
    } catch (e) {
      console.error('リリースノートの読み込みに失敗しました:', e);
      cache = null;
      renderError();
    }
  }

  function open() {
    modal.classList.add('show');
    if (cache) render(cache); else load();
    // 開いたら現行バージョンを既読にしてバッジを消す
    if (typeof currentVersion === 'string' && currentVersion) {
      safeSet(LAST_SEEN_KEY, currentVersion);
    }
    refreshUnread();
  }
  function close() { modal.classList.remove('show'); }

  menuItem?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('show')) close();
  });

  refreshUnread();
}
