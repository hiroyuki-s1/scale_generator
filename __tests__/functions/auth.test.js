import { describe, it, expect } from 'vitest';
import {
  parseBearer, base64UrlToBytes, decodeJwt, isTimeValid, verifyClerkJwt,
} from '../../functions/_lib/auth.js';

const b64url = obj => Buffer.from(JSON.stringify(obj)).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const makeJwt = (header, payload) => `${b64url(header)}.${b64url(payload)}.c2ln`;

describe('parseBearer', () => {
  it('extracts the token (case-insensitive)', () => {
    expect(parseBearer('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(parseBearer('bearer xyz')).toBe('xyz');
  });
  it('returns null for missing/invalid headers', () => {
    expect(parseBearer(null)).toBe(null);
    expect(parseBearer('')).toBe(null);
    expect(parseBearer('Token abc')).toBe(null);
  });
});

describe('base64UrlToBytes', () => {
  it('decodes base64url back to original bytes', () => {
    const enc = Buffer.from('héllo {}').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const bytes = base64UrlToBytes(enc);
    expect(new TextDecoder().decode(bytes)).toBe('héllo {}');
  });
});

describe('decodeJwt', () => {
  it('parses header and payload of a well-formed token', () => {
    const tok = makeJwt({ alg: 'RS256', kid: 'k1' }, { sub: 'user_123', exp: 9999999999 });
    const out = decodeJwt(tok);
    expect(out.header).toEqual({ alg: 'RS256', kid: 'k1' });
    expect(out.payload.sub).toBe('user_123');
    expect(out.signingInput).toBe(tok.split('.').slice(0, 2).join('.'));
  });
  it('returns null for malformed tokens', () => {
    expect(decodeJwt('only.two')).toBe(null);
    expect(decodeJwt('a.b.c.d')).toBe(null);
    expect(decodeJwt(null)).toBe(null);
    expect(decodeJwt('!!!.!!!.!!!')).toBe(null);
  });
});

describe('isTimeValid', () => {
  const now = 1_000_000;
  it('rejects expired tokens (beyond leeway)', () => {
    expect(isTimeValid({ exp: now - 100 }, now)).toBe(false);
  });
  it('accepts unexpired tokens', () => {
    expect(isTimeValid({ exp: now + 100 }, now)).toBe(true);
  });
  it('rejects not-yet-valid (nbf in future)', () => {
    expect(isTimeValid({ nbf: now + 100 }, now)).toBe(false);
  });
  it('allows small clock skew via leeway', () => {
    expect(isTimeValid({ exp: now - 3 }, now, 5)).toBe(true);
  });
});

describe('verifyClerkJwt (early rejections, no network)', () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  it('returns null when CLERK_ISSUER is not configured', async () => {
    const tok = makeJwt({ alg: 'RS256', kid: 'k1' }, { sub: 'u', exp: future });
    expect(await verifyClerkJwt(tok, {})).toBe(null);
  });
  it('returns null for non-RS256 alg', async () => {
    const tok = makeJwt({ alg: 'HS256', kid: 'k1' }, { sub: 'u', exp: future });
    expect(await verifyClerkJwt(tok, { CLERK_ISSUER: 'https://x.clerk.accounts.dev' })).toBe(null);
  });
  it('returns null for expired token before any network call', async () => {
    const tok = makeJwt({ alg: 'RS256', kid: 'k1' }, { sub: 'u', exp: 1 });
    let fetched = false;
    const out = await verifyClerkJwt(tok, { CLERK_ISSUER: 'https://x.clerk.accounts.dev' }, {
      fetchImpl: () => { fetched = true; return Promise.reject(new Error('should not fetch')); },
    });
    expect(out).toBe(null);
    expect(fetched).toBe(false);
  });
  it('returns null when issuer mismatches', async () => {
    const tok = makeJwt({ alg: 'RS256', kid: 'k1' }, { sub: 'u', exp: future, iss: 'https://evil.example' });
    expect(await verifyClerkJwt(tok, { CLERK_ISSUER: 'https://x.clerk.accounts.dev' })).toBe(null);
  });
});
