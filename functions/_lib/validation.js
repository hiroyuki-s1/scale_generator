/**
 * Pages Functions 共通の入力検証（pure・DOM/D1非依存 → Vitest でテスト可能）。
 * 仕様: docs/songbook/API.md, docs/features/SHARE.md, docs/features/EXCEPTION_HANDLING.md。
 *
 * サーバ側でも必ず検証する（クライアント入力を信用しない）。返り値は判別共用体:
 *   成功 → { ok: true, value }
 *   失敗 → { ok: false, error: '<code>', message: '<人間向け>' }
 */

export const MAX_NAME_LEN = 100;
export const MAX_SCALES = 200;
/** scales JSON の最大バイト数（巨大ペイロードでの D1 圧迫・worker OOM 防止）。 */
export const MAX_SCALES_JSON_BYTES = 500_000;
export const MAX_SONGBOOKS = 50;
export const MAX_SHARES = 100;
/** 共有の既定有効期間: 90日（ms）。docs/features/SHARE.md。 */
export const SHARE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const fail = (message) => ({ ok: false, error: 'invalid_body', message });

/** 名前: 文字列・トリム後 1〜100 文字。 */
export function validateName(name) {
  if (typeof name !== 'string') return fail('name は文字列である必要があります');
  const trimmed = name.trim();
  if (trimmed.length < 1) return fail('名前を入力してください');
  if (trimmed.length > MAX_NAME_LEN) return fail(`名前は${MAX_NAME_LEN}文字以内にしてください`);
  return { ok: true, value: trimmed };
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
