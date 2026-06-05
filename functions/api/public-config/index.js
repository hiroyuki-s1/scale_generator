/**
 * GET /api/public-config — フロントが起動時に取得する公開設定。
 *
 * Publishable key は公開情報だが、単一ソース（.dev.vars / Pages 環境変数）に集約し、
 * フロント (src/) にハードコードしないためここで配る（src/ のバンドル依存ゼロを維持）。
 * 認証不要。
 */
import { json } from '../../_lib/responses.js';

export function onRequestGet({ env }) {
  return json({
    clerkPublishableKey: env.CLERK_PUBLISHABLE_KEY || null,
  });
}
