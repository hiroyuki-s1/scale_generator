/**
 * Pages Functions 共通の入力検証（pure・DOM/D1非依存 → Vitest でテスト可能）。
 * 仕様: docs/songbook/API.md, docs/features/SHARE.md, docs/features/EXCEPTION_HANDLING.md。
 *
 * サーバ側でも必ず検証する（クライアント入力を信用しない）。返り値は判別共用体:
 *   成功 → { ok: true, value }
 *   失敗 → { ok: false, error: '<code>', message: '<人間向け>' }
 */

export const MAX_NAME_LEN = 100;
/** 表示名（公開プロフィール名）の最大長。migration 0005 の CHECK と一致させる。 */
export const MAX_DISPLAY_NAME_LEN = 50;
export const MAX_SCALES = 200;
/** scales JSON の最大バイト数（巨大ペイロードでの D1 圧迫・worker OOM 防止）。 */
export const MAX_SCALES_JSON_BYTES = 500_000;
export const MAX_SONGBOOKS = 50;
export const MAX_SHARES = 100;
// 共有の有効期限は廃止 (migration 0003)。後方互換のため定数 export を残しているが
// API では使用しない。

const fail = (message) => ({ ok: false, error: 'invalid_body', message });

/** 名前: 文字列・トリム後 1〜100 文字。 */
export function validateName(name) {
  if (typeof name !== 'string') return fail('name は文字列である必要があります');
  const trimmed = name.trim();
  if (trimmed.length < 1) return fail('名前を入力してください');
  if (trimmed.length > MAX_NAME_LEN) return fail(`名前は${MAX_NAME_LEN}文字以内にしてください`);
  return { ok: true, value: trimmed };
}

// 制御文字（C0 範囲 U+0000–001F と DEL U+007F）。表示崩れ/なりすまし防止のため表示名で拒否する。
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * 表示名（公開プロフィール名）: 文字列・トリム後 1〜50 文字。重複は許可（一意ハンドルではない）。
 * 他ユーザーにも表示されるため、改行/タブ/制御文字（U+0000–001F, U+007F）は拒否する。
 * 空白は内部の連続をひとつに畳んでからトリムする（見えない水増しを防ぐ）。
 */
export function validateDisplayName(name) {
  if (typeof name !== 'string') return fail('表示名は文字列である必要があります');
  if (CONTROL_CHARS.test(name)) return fail('表示名に使用できない文字が含まれています');
  const normalized = name.replace(/\s+/g, ' ').trim();
  if (normalized.length < 1) return fail('表示名を入力してください');
  if (normalized.length > MAX_DISPLAY_NAME_LEN) {
    return fail(`表示名は${MAX_DISPLAY_NAME_LEN}文字以内にしてください`);
  }
  return { ok: true, value: normalized };
}

/**
 * scales スナップショット JSON を検証する。形式: `{ v: <int>, scales: [...] }`。
 * 返り値 value に { scales(元オブジェクト), scaleCount, schemaVersion } を含める。
 */
export function validateScales(scales) {
  if (!scales || typeof scales !== 'object' || Array.isArray(scales)) {
    return fail('scales はオブジェクトである必要があります');
  }
  const list = scales.scales;
  if (!Array.isArray(list)) return fail('scales.scales は配列である必要があります');
  if (list.length > MAX_SCALES) {
    return fail(`スケール数が上限（${MAX_SCALES}）を超えています`);
  }
  const json = JSON.stringify(scales);
  if (json.length > MAX_SCALES_JSON_BYTES) {
    return fail('スケールデータが大きすぎます');
  }
  const v = scales.v;
  const schemaVersion = Number.isInteger(v) && v >= 1 ? v : 1;
  // json を再利用できるよう一緒に返す（呼び出し側で再 stringify しなくてよい）。
  return { ok: true, value: { scales, scalesJson: json, scaleCount: list.length, schemaVersion } };
}

/**
 * ソングブック作成/更新 body を検証。
 * @returns {{ok:true, value:{name, scales, scalesJson, scaleCount, schemaVersion}} | {ok:false, error, message}}
 */
export function validateSongbookBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail('リクエストボディが不正です');
  }
  const nameRes = validateName(body.name);
  if (!nameRes.ok) return nameRes;
  const scalesRes = validateScales(body.scales);
  if (!scalesRes.ok) return scalesRes;
  return {
    ok: true,
    value: {
      name: nameRes.value,
      scales: scalesRes.value.scales,
      scalesJson: scalesRes.value.scalesJson,
      scaleCount: scalesRes.value.scaleCount,
      schemaVersion: scalesRes.value.schemaVersion,
    },
  };
}

/** 共有作成 body を検証（ソングブックと同形式）。 */
export function validateShareBody(body) {
  return validateSongbookBody(body);
}
