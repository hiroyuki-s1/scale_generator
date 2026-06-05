/**
 * ID 生成（pure・Web Crypto 利用）。Cloudflare Workers / Node 20 双方で動く。
 */

// URL 安全・紛らわしい文字（0/O/1/l/I）を除いた英数字。
const SHARE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const SHARE_ID_LEN = 10;

/**
 * 共有用の短い推測困難 ID（nanoid 風・既定10桁）。UNIQUE 衝突時は呼び出し側で再生成。
 * @returns {string}
 */
export function genShareId(len = SHARE_ID_LEN) {
  // 剰余バイアスを避けるため棄却サンプリング（>= 受理上限のバイトは捨てる）。
  const n = SHARE_ALPHABET.length;
  const limit = Math.floor(256 / n) * n; // 受理上限（これ以上は偏るので棄却）
  let out = '';
  const buf = new Uint8Array(len * 2);
  while (out.length < len) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < len; i++) {
      if (buf[i] < limit) out += SHARE_ALPHABET[buf[i] % n];
    }
  }
  return out;
}

/** ソングブックの外部公開 ID（推測不能）。 */
export function genPublicId() {
  return crypto.randomUUID();
}
