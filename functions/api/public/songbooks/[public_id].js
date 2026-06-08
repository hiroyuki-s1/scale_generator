/**
 * GET /api/public/songbooks/:public_id
 *   ソングブックの公開読み取り（認証不要・共有受け取り用）。
 *
 * 方針（無期限・自動生成の共有）:
 *   ソングブックの public_id は crypto.randomUUID（122bit・推測不能）なので、
 *   これを「未公開リンク（unlisted）」の共有キーとして使う。共有 URL は
 *   `?share=<public_id>` 1 本で、ソングブックが存在する限り無期限に有効。
 *   別途の共有作成・期限・取り消し（管理）は不要。
 *
 * セキュリティ:
 *   ・user_id は一切返さない（所有者を露出しない）。
 *   ・deleted_at IS NULL の有効ソングブックのみ。論理削除で即時に共有も止まる。
 *   ・WHERE public_id = ? のプレースホルダ bind（インジェクション対策）。
 */
import { json, notFound, internal } from '../../../_lib/responses.js';

export async function onRequestGet({ env, params }) {
  try {
    const row = await env.DB.prepare(
      `SELECT name, scales, schema_version, scale_count
         FROM songbooks
        WHERE public_id = ? AND deleted_at IS NULL`,
    ).bind(params.public_id).first();
    if (!row) return notFound('このソングファイルは見つかりませんでした');
    let scales;
    try { scales = JSON.parse(row.scales); } catch { scales = null; }
    return json({
      name: row.name,
      scales,
      schema_version: row.schema_version,
      scale_count: row.scale_count,
    });
  } catch (e) {
    console.error('GET /api/public/songbooks/:id failed', e);
    return internal();
  }
}
