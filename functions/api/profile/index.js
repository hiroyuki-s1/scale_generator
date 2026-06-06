/**
 * /api/profile — 自分の公開プロフィール（表示名）の取得 (GET) / 設定・更新 (PUT, upsert)。
 *
 * 設計（migration 0005 / docs/auth/API.md）:
 *   ・表示名は「アカウント作成時に初回ログイン後のオンボーディングで設定」する。
 *     行が無い＝未設定。GET はそのとき { displayName: null } を返し、フロントがモーダルを出す。
 *   ・重複OK（一意ハンドルではない）。識別は user_id。
 *   ・他ユーザーへの表示は共有/一覧 API 側で user_id JOIN して読む（ここは本人の取得/更新のみ）。
 *   ・サーバ側でも必ず検証（validateDisplayName）。クライアント入力を信用しない。
 */
import { requireUserId } from '../../_lib/auth.js';
import { validateDisplayName } from '../../_lib/validation.js';
import { json, unauthorized, badRequest, internal } from '../../_lib/responses.js';

export async function onRequestGet({ request, env }) {
  const userId = await requireUserId(request, env);
  if (!userId) return unauthorized();
  try {
    const row = await env.DB.prepare(
      'SELECT display_name, created_at, updated_at FROM user_profiles WHERE user_id = ?',
    ).bind(userId).first();
    if (!row) return json({ displayName: null });
    return json({
      displayName: row.display_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  } catch (e) {
    console.error('GET /api/profile failed', e);
    return internal();
  }
}

export async function onRequestPut({ request, env }) {
  const userId = await requireUserId(request, env);
  if (!userId) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('JSON を解釈できませんでした'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest('リクエストボディが不正です');
  }

  const nameRes = validateDisplayName(body.displayName);
  if (!nameRes.ok) return badRequest(nameRes.message);
  const displayName = nameRes.value;

  try {
    const now = Date.now();
    // 初回は created_at=updated_at=now。更新時は display_name と updated_at のみ差し替え
    // （created_at は INSERT 時の値を保持）。
    await env.DB.prepare(
      `INSERT INTO user_profiles (user_id, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         display_name = excluded.display_name,
         updated_at   = excluded.updated_at`,
    ).bind(userId, displayName, now, now).run();
    return json({ ok: true, displayName });
  } catch (e) {
    console.error('PUT /api/profile failed', e);
    return internal();
  }
}
