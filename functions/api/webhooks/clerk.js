/**
 * POST /api/webhooks/clerk — 退会クリーンアップ。仕様: docs/auth/API.md。
 *
 * - 認証は JWT ではなく Svix 署名（CLERK_WEBHOOK_SIGNING_SECRET で検証）。署名不一致は 400。
 * - type === 'user.deleted' のとき、その user_id を全テーブルから物理削除（退会＝データ消去）。
 * - 冪等: 再送されても安全（既に削除済みなら 0 件削除で 200）。Clerk は失敗時に自動リトライする。
 * - example.com 等のテストイベント（data.id 無し）は無視する。
 */
import { verifySvixSignature } from '../../_lib/svix.js';
import { json, badRequest, internal } from '../../_lib/responses.js';

export async function onRequestPost({ request, env }) {
  const rawBody = await request.text();
  const headers = {
    'svix-id': request.headers.get('svix-id'),
    'svix-timestamp': request.headers.get('svix-timestamp'),
    'svix-signature': request.headers.get('svix-signature'),
  };

  const valid = await verifySvixSignature(rawBody, headers, env.CLERK_WEBHOOK_SIGNING_SECRET);
  if (!valid) return badRequest('署名の検証に失敗しました');

  let event;
  try { event = JSON.parse(rawBody); } catch { return badRequest('ペイロードが不正です'); }

  // 退会以外は何もしない（200 で受理）。
  if (event?.type !== 'user.deleted') return json({ ok: true, ignored: event?.type ?? null });

  const userId = event?.data?.id;
  // Clerk user ID は `user_<英数字>` 形式。それ以外（空白・テストイベント・誤設定）は
  // 破壊的削除を実行せず受理だけする（取り消せない DELETE の事故防止）。
  if (typeof userId !== 'string' || !/^user_[A-Za-z0-9]+$/.test(userId)) {
    return json({ ok: true, ignored: 'no_or_malformed_user_id' });
  }

  try {
    // 各 DELETE は冪等（再送で 0 件でも 200）。バッチで失敗しても再送で残りが消える。
    const sb = await env.DB.prepare('DELETE FROM songbooks WHERE user_id = ?').bind(userId).run();
    const us = await env.DB.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(userId).run();
    const sh = await env.DB.prepare('DELETE FROM shares WHERE user_id = ?').bind(userId).run();
    return json({
      ok: true,
      deleted: {
        songbooks: sb.meta?.changes ?? 0,
        user_settings: us.meta?.changes ?? 0,
        shares: sh.meta?.changes ?? 0,
      },
    });
  } catch (e) {
    console.error('clerk webhook cleanup failed', e);
    return internal();
  }
}
