import { describe, it, expect } from 'vitest';
import {
  validateName, validateDisplayName, validateScales, validateSongbookBody, validateShareBody,
  MAX_NAME_LEN, MAX_DISPLAY_NAME_LEN, MAX_SCALES,
} from '../../functions/_lib/validation.js';

describe('validateName', () => {
  it('trims and accepts 1..100 chars', () => {
    expect(validateName('  Autumn Leaves  ')).toEqual({ ok: true, value: 'Autumn Leaves' });
  });
  it('rejects empty / whitespace-only', () => {
    expect(validateName('').ok).toBe(false);
    expect(validateName('   ').ok).toBe(false);
  });
  it('rejects > 100 chars', () => {
    const res = validateName('x'.repeat(MAX_NAME_LEN + 1));
    expect(res.ok).toBe(false);
    expect(res.error).toBe('invalid_body');
  });
  it('rejects non-strings', () => {
    expect(validateName(42).ok).toBe(false);
    expect(validateName(null).ok).toBe(false);
  });
});

describe('validateDisplayName', () => {
  it('trims and accepts 1..50 chars', () => {
    expect(validateDisplayName('  たろう  ')).toEqual({ ok: true, value: 'たろう' });
  });
  it('collapses internal whitespace runs to a single space', () => {
    expect(validateDisplayName('山田   太郎').value).toBe('山田 太郎');
  });
  it('rejects empty / whitespace-only', () => {
    expect(validateDisplayName('').ok).toBe(false);
    expect(validateDisplayName('   ').ok).toBe(false);
  });
  it('rejects > 50 chars', () => {
    const res = validateDisplayName('x'.repeat(MAX_DISPLAY_NAME_LEN + 1));
    expect(res.ok).toBe(false);
    expect(res.error).toBe('invalid_body');
  });
  it('accepts exactly 50 chars', () => {
    expect(validateDisplayName('x'.repeat(MAX_DISPLAY_NAME_LEN)).ok).toBe(true);
  });
  it('rejects control characters (newline/tab)', () => {
    expect(validateDisplayName('foo\nbar').ok).toBe(false);
    expect(validateDisplayName('foo\tbar').ok).toBe(false);
  });
  it('rejects non-strings', () => {
    expect(validateDisplayName(42).ok).toBe(false);
    expect(validateDisplayName(null).ok).toBe(false);
    expect(validateDisplayName(undefined).ok).toBe(false);
  });
  it('allows duplicates (no uniqueness check at this layer)', () => {
    expect(validateDisplayName('たろう').ok).toBe(true);
    expect(validateDisplayName('たろう').ok).toBe(true);
  });
});

describe('validateScales', () => {
  it('accepts a valid snapshot and reports scaleCount + schemaVersion', () => {
    const res = validateScales({ v: 2, scales: [{}, {}, {}] });
    expect(res.ok).toBe(true);
    expect(res.value.scaleCount).toBe(3);
    expect(res.value.schemaVersion).toBe(2);
  });
  it('defaults schemaVersion to 1 when v missing/invalid', () => {
    expect(validateScales({ scales: [] }).value.schemaVersion).toBe(1);
    expect(validateScales({ v: 0, scales: [] }).value.schemaVersion).toBe(1);
  });
  it('rejects non-object / missing scales array', () => {
    expect(validateScales(null).ok).toBe(false);
    expect(validateScales([]).ok).toBe(false);
    expect(validateScales({ scales: 'nope' }).ok).toBe(false);
  });
  it('rejects > 200 scales', () => {
    const big = { v: 1, scales: new Array(MAX_SCALES + 1).fill({}) };
    expect(validateScales(big).ok).toBe(false);
  });
  it('accepts exactly 200 scales', () => {
    const exact = { v: 1, scales: new Array(MAX_SCALES).fill({}) };
    expect(validateScales(exact).ok).toBe(true);
  });
  it('rejects an oversized JSON payload (byte cap)', () => {
    const huge = { v: 1, scales: [{ blob: 'x'.repeat(600_000) }] };
    const res = validateScales(huge);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('invalid_body');
  });
  it('reuses scalesJson (no re-stringify needed by caller)', () => {
    const res = validateScales({ v: 1, scales: [{ a: 1 }] });
    expect(typeof res.value.scalesJson).toBe('string');
    expect(JSON.parse(res.value.scalesJson)).toEqual({ v: 1, scales: [{ a: 1 }] });
  });
});

describe('validateSongbookBody / validateShareBody', () => {
  const good = { name: 'My Book', scales: { v: 1, scales: [{ a: 1 }] } };
  it('returns serialized JSON + counts on success', () => {
    const res = validateSongbookBody(good);
    expect(res.ok).toBe(true);
    expect(res.value.name).toBe('My Book');
    expect(res.value.scaleCount).toBe(1);
    expect(JSON.parse(res.value.scalesJson)).toEqual(good.scales);
  });
  it('rejects bad bodies', () => {
    expect(validateSongbookBody(null).ok).toBe(false);
    expect(validateSongbookBody({ name: '', scales: { scales: [] } }).ok).toBe(false);
    expect(validateSongbookBody({ name: 'ok', scales: null }).ok).toBe(false);
  });
  it('validateShareBody mirrors songbook validation', () => {
    expect(validateShareBody(good).ok).toBe(true);
    expect(validateShareBody({}).ok).toBe(false);
  });
});
