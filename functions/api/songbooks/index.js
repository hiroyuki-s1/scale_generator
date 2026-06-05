/**
 * /api/songbooks — 一覧 (GET) / 作成 (POST)。仕様: docs/songbook/API.md。
 *
 * 必須事項（Phase 3 受け入れ条件）:
 *  - 全エンドポイントで JWT 検証（requireUserId）
 *  - 全クエリで WHERE user_id = ?（テナント分離・クライアント入力を信用しない）
 *  - プレースホルダ bind（SQL インジェクション対策）
 *  - 入力検証（validateSongbookBody）
 *
 * ⚠️ Clerk/D1 が必要なため実行は Phase 1/2 セットアップ後。pure 層（validation/auth helper）は
 *    Vitest 済み。ハンドラ自体は wrangler pages dev + ローカル D1 で結合テストする。
 */
import { requireUserId } from '../../_lib/auth.js';
import { validateSongbookBody, MAX_SONGBOOKS } from '../../_lib/validation.js';
import { genPublicId } from '../../_lib/ids.js';
import { json, unauthorized, badRequest, internal } from '../../_lib/responses.js';

export async function onRequestGet({ request, env }) {
  const userId = await requireUserId(request, env);
  if (!userId) return unauthorized();
  try {
    // カバリングインデックス idx_songbooks_user_list を使う列順・条件（index-only）。
    const { results } = await env.DB.prepare(
      `SELECT public_id, name, scale_count, created_at, updated_at
         FROM songbooks
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC`,
    ).bind(userId).all();
    return json({ songbooks: results ?? [] });
  } catch (e) {
    console.error('GET /api/songbooks failed', e);
    return internal();
  }
}

export async function onRequestPost({ request, env }) {
  const userId = await requireUserId(request, env);
  if (!userId) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('JSON を解釈できませんでした');
  }
  const v = validateSongbookBody(body);
  if (!v.ok) return badRequest(v.message);

  try {
    const countRow = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM songbooks WHERE user_id = ? AND deleted_at IS NULL',
    ).bind(userId).first();
    if ((countRow?.n ?? 0) >= MAX_SONGBOOKS) {
      return badRequest(`ソングブックの上限（${MAX_SONGBOOKS}件）に達しました。不要なものを削除してください`);
    }
    const now = Date.now();
    const publicId = genPublicId();
    await env.DB.prepare(
      `INSERT INTO songbooks
         (public_id, user_id, name, scales, schema_version, scale_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(publicId, userId, v.value.name, v.value.scalesJson, v.value.schemaVersion, v.value.scaleCount, now, now).run();
    return json({ public_id: publicId }, 201);
  } catch (e) {
    console.error('POST /api/songbooks failed', e);
    return internal();
  }
}
