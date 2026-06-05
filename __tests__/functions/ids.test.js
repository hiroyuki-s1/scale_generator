import { describe, it, expect } from 'vitest';
import { genShareId, genPublicId } from '../../functions/_lib/ids.js';

describe('genShareId', () => {
  it('defaults to 10 url-safe chars from the unambiguous alphabet', () => {
    const id = genShareId();
    expect(id).toHaveLength(10);
    expect(/^[23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ]+$/.test(id)).toBe(true);
    // excludes confusable chars 0 O 1 l I
    expect(/[0O1lI]/.test(id)).toBe(false);
  });
  it('honours a custom length', () => {
    expect(genShareId(16)).toHaveLength(16);
  });
  it('is effectively unique across many calls', () => {
    const set = new Set();
    for (let i = 0; i < 500; i++) set.add(genShareId());
    expect(set.size).toBe(500);
  });
});

describe('genPublicId', () => {
  it('produces a UUID', () => {
    expect(genPublicId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
  it('is unique', () => {
    expect(genPublicId()).not.toBe(genPublicId());
  });
});
