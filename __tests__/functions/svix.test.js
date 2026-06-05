import { describe, it, expect } from 'vitest';
import { timingSafeEqual, buildSignedContent, verifySvixSignature } from '../../functions/_lib/svix.js';

// テスト用に Svix と同じ方式で署名を作る（whsec_<base64> の base64 部分を鍵に HMAC-SHA256→base64）。
async function sign(secret, id, ts, body) {
  const raw = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  let bin = '';
  new Uint8Array(sig).forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

const SECRET = 'whsec_' + btoa('super-secret-key-1234567890');

describe('timingSafeEqual', () => {
  it('true for equal strings, false otherwise', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('abc', 42)).toBe(false);
  });
});

describe('buildSignedContent', () => {
  it('joins id.timestamp.body', () => {
    expect(buildSignedContent('msg_1', '1700000000', '{"a":1}')).toBe('msg_1.1700000000.{"a":1}');
  });
});

describe('verifySvixSignature', () => {
  const id = 'msg_2abc';
  const ts = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: 'user.deleted', data: { id: 'user_x' } });
  const now = () => Date.now();

  it('accepts a correctly signed payload', async () => {
    const sig = await sign(SECRET, id, ts, body);
    const headers = { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` };
    expect(await verifySvixSignature(body, headers, SECRET, now)).toBe(true);
  });

  it('accepts when multiple signatures present (rotation)', async () => {
    const sig = await sign(SECRET, id, ts, body);
    const headers = { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,wrongone v1,${sig}` };
    expect(await verifySvixSignature(body, headers, SECRET, now)).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const sig = await sign(SECRET, id, ts, body);
    const headers = { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` };
    expect(await verifySvixSignature(body + 'x', headers, SECRET, now)).toBe(false);
  });

  it('rejects wrong secret', async () => {
    const sig = await sign(SECRET, id, ts, body);
    const headers = { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` };
    const other = 'whsec_' + btoa('different-secret-aaaaaaaaaa');
    expect(await verifySvixSignature(body, headers, other, now)).toBe(false);
  });

  it('rejects missing headers', async () => {
    expect(await verifySvixSignature(body, {}, SECRET, now)).toBe(false);
  });

  it('rejects stale timestamp (replay)', async () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 10000);
    const sig = await sign(SECRET, id, oldTs, body);
    const headers = { 'svix-id': id, 'svix-timestamp': oldTs, 'svix-signature': `v1,${sig}` };
    expect(await verifySvixSignature(body, headers, SECRET, now)).toBe(false);
  });
});
