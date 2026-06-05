import { describe, it, expect } from 'vitest';
import { normalizeReleaseNotes, isNewerVersion } from '../../src/domain/releaseNotes.js';

describe('normalizeReleaseNotes', () => {
  it('正常な releases を正規化して返す（記載順を保持）', () => {
    const out = normalizeReleaseNotes({
      releases: [
        { version: '1.1.0', date: '2026-07-01', highlights: ['A', 'B'] },
        { version: '1.0.1', date: '2026-06-05', highlights: ['C'] },
      ],
    });
    expect(out).toEqual([
      { version: '1.1.0', date: '2026-07-01', highlights: ['A', 'B'] },
      { version: '1.0.1', date: '2026-06-05', highlights: ['C'] },
    ]);
  });

  it('data が null/非オブジェクトなら空配列', () => {
    expect(normalizeReleaseNotes(null)).toEqual([]);
    expect(normalizeReleaseNotes(undefined)).toEqual([]);
    expect(normalizeReleaseNotes('x')).toEqual([]);
    expect(normalizeReleaseNotes(42)).toEqual([]);
  });

  it('releases が配列でなければ空配列', () => {
    expect(normalizeReleaseNotes({})).toEqual([]);
    expect(normalizeReleaseNotes({ releases: null })).toEqual([]);
    expect(normalizeReleaseNotes({ releases: 'nope' })).toEqual([]);
  });

  it('highlights 欠落/非配列はそのバージョンを見出しのみ（空配列）にする', () => {
    const out = normalizeReleaseNotes({
      releases: [
        { version: '2.0.0', date: '2026-08-01' },
        { version: '1.9.0', date: '2026-07-15', highlights: 'oops' },
        { version: '1.8.0', date: '2026-07-10', highlights: { a: 1 } },
      ],
    });
    expect(out).toEqual([
      { version: '2.0.0', date: '2026-08-01', highlights: [] },
      { version: '1.9.0', date: '2026-07-15', highlights: [] },
      { version: '1.8.0', date: '2026-07-10', highlights: [] },
    ]);
  });

  it('highlights 内の非文字列要素は除去する', () => {
    const out = normalizeReleaseNotes({
      releases: [{ version: '1.0.0', date: '2026-01-01', highlights: ['ok', 3, null, '  ', 'fine'] }],
    });
    expect(out[0].highlights).toEqual(['ok', 'fine']);
  });

  it('version/date 欠落や非文字列は空文字にフォールバック（クラッシュしない）', () => {
    const out = normalizeReleaseNotes({
      releases: [{ highlights: ['x'] }, { version: 5, date: {}, highlights: [] }],
    });
    expect(out[0]).toEqual({ version: '', date: '', highlights: ['x'] });
    expect(out[1]).toEqual({ version: '', date: '', highlights: [] });
  });

  it('release 要素が非オブジェクトなら除去する', () => {
    const out = normalizeReleaseNotes({
      releases: ['bad', null, 7, { version: '1.0.0', date: '2026-01-01', highlights: [] }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].version).toBe('1.0.0');
  });
});

describe('isNewerVersion', () => {
  it('lastSeen が無ければ常に新着（初回）', () => {
    expect(isNewerVersion('1.0.0', null)).toBe(true);
    expect(isNewerVersion('1.0.0', undefined)).toBe(true);
    expect(isNewerVersion('1.0.0', '')).toBe(true);
  });

  it('current > lastSeen で true', () => {
    expect(isNewerVersion('1.1.0', '1.0.1')).toBe(true);
    expect(isNewerVersion('1.0.2', '1.0.1')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
  });

  it('current <= lastSeen で false', () => {
    expect(isNewerVersion('1.0.1', '1.0.1')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(false);
    expect(isNewerVersion('1.9.9', '2.0.0')).toBe(false);
  });

  it('桁数が異なっても比較できる', () => {
    expect(isNewerVersion('1.1', '1.0.5')).toBe(true);
    expect(isNewerVersion('1.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0.1', '1.0.0')).toBe(true);
  });

  it('current が不正なら false（バッジを出さない）', () => {
    expect(isNewerVersion('', '1.0.0')).toBe(false);
    expect(isNewerVersion(null, '1.0.0')).toBe(false);
  });
});
