/**
 * /api/songbooks/:public_id — 取得 (GET) / 更新 (PUT) / 削除 (DELETE)。
 * 仕様: docs/songbook/API.md。全クエリで user_id 一致を必須にしテナント分離する。
 */
import { requireUserId } from '../../_lib/auth.js';
import { validateSongbookBody } from '../../_lib/validation.js';
import { json, unauthorized, badRequest, notFound, internal } from '../../_lib/responses.js';

export async function onRequestGet({ request, env, params }) {
  const userId = await requireUserId(request, env);
  if (!userId) return unauthorized();
  try {
    const row = await env.DB.prepare(
      `SELECT public_id, name, scales, schema_version, scale_count, created_at, updated_at
         FROM songbooks
        WHERE public_id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).bind(params.public_id, userId).first();
    if (!row) return notFound();
    // scales は TEXT(JSON) → パースして返す。壊れていても 200 で生文字列は返さない。
    let scales;
    try { scales = JSON.parse(row.scales); } catch { scales = null; }
    return json({ ...row, scales });
  } catch (e) {
    console.error('GET /api/songbooks/:id failed', e);
    return internal();
  }
}

export async function onRequestPut({ request, env, params }) {
  const userId = await requireUserId(request, env);
  if (!userId) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('JSON を解釈できませんでした'); }
  const v = validateSongbookBody(body);
  if (!v.ok) return badRequest(v.message);

  try {
    const res = await env.DB.prepare(
      `UPDATE songbooks
          SET name = ?, scales = ?, schema_version = ?, scale_count = ?, updated_at = ?
        WHERE public_id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).bind(v.value.name, v.value.scalesJson, v.value.schemaVersion, v.value.scaleCount, Date.now(), params.public_id, userId).run();
    if (!res.meta || res.meta.changes === 0) return notFound();
    return json({ ok: true });
  } catch (e) {
    console.error('PUT /api/songbooks/:id failed', e);
    return internal();
  }
}

export async function onRequestDelete({ request, env, params }) {
  const userId = await requireUserId(request, env);
  if (!userId) return unauthorized();
  try {
    // 論理削除（deleted_at を設定）。既に削除済み/他人のものは 404。
    const res = await env.DB.prepare(
      `UPDATE songbooks SET deleted_at = ?
        WHERE public_id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).bind(Date.now(), params.public_id, userId).run();
    if (!res.meta || res.meta.changes === 0) return notFound();
    return json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/songbooks/:id failed', e);
    return internal();
  }
}
