/**
 * /api/settings — ユーザー設定の取得 (GET) / 保存 (PUT, upsert)。
 * 仕様: docs/auth/API.md。1ユーザー1行（user_settings.user_id PK）。
 */
import { requireUserId } from '../../_lib/auth.js';
import { json, unauthorized, badRequest, internal } from '../../_lib/responses.js';

const DEFAULT_SETTINGS = { layout: { orientation: 'landscape', cols: 2, rows: 3 } };

export async function onRequestGet({ request, env }) {
  const userId = await requireUserId(request, env);
  if (!userId) return unauthorized();
  try {
    const row = await env.DB.prepare(
      'SELECT settings FROM user_settings WHERE user_id = ?',
    ).bind(userId).first();
    if (!row) return json(DEFAULT_SETTINGS);
    let settings;
    try { settings = JSON.parse(row.settings); } catch { settings = DEFAULT_SETTINGS; }
    return json(settings);
  } catch (e) {
    console.error('GET /api/settings failed', e);
    return internal();
  }
}

export async function onRequestPut({ request, env }) {
  const userId = await requireUserId(request, env);
  if (!userId) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('JSON を解釈できませんでした'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest('設定オブジェクトが不正です');
  }
  try {
    await env.DB.prepare(
      `INSERT INTO user_settings (user_id, settings) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET settings = excluded.settings`,
    ).bind(userId, JSON.stringify(body)).run();
    return json({ ok: true });
  } catch (e) {
    console.error('PUT /api/settings failed', e);
    return internal();
  }
}
