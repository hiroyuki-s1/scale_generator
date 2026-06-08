import { describe, it, expect } from 'vitest';
import { buildShareUrl, extractShareId, isLikelyShareId } from '../../src/domain/shareLink.js';

describe('buildShareUrl', () => {
  it('本番(base=/)で origin/?share=public_id を組む', () => {
    expect(buildShareUrl('https://kami-scale-trainer.org', '/', 'abc-123'))
      .toBe('https://kami-scale-trainer.org/?share=abc-123');
  });

  it('サブパス base でもスラッシュを重複させない', () => {
    expect(buildShareUrl('https://example.com', '/scale_generator/', 'xyz'))
      .toBe('https://example.com/scale_generator/?share=xyz');
  });

  it('origin 末尾スラッシュを正規化する', () => {
    expect(buildShareUrl('https://example.com/', '/', 'id1'))
      .toBe('https://example.com/?share=id1');
  });

  it('public_id を URL エンコードする', () => {
    expect(buildShareUrl('https://e.com', '/', 'a b')).toBe('https://e.com/?share=a%20b');
  });

  it('base 未指定は / 扱い', () => {
    expect(buildShareUrl('https://e.com', '', 'id')).toBe('https://e.com/?share=id');
  });
});

describe('extractShareId', () => {
  it('完全な共有 URL から public_id を取り出す', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(extractShareId(`https://kami-scale-trainer.org/?share=${uuid}`)).toBe(uuid);
  });

  it('他クエリやハッシュが付いていても抜き出す', () => {
    expect(extractShareId('https://e.com/?foo=1&share=ABC123&bar=2#x')).toBe('ABC123');
  });

  it('生 ID はそのまま返す（前後空白除去）', () => {
    expect(extractShareId('  rawId123  ')).toBe('rawId123');
  });

  it('URL エンコードされた値をデコードする', () => {
    expect(extractShareId('https://e.com/?share=a%20b')).toBe('a b');
  });

  it('空文字や null は空文字', () => {
    expect(extractShareId('')).toBe('');
    expect(extractShareId(null)).toBe('');
    expect(extractShareId(undefined)).toBe('');
  });
});

describe('isLikelyShareId', () => {
  it('UUID(ハイフン入り)を許容する', () => {
    expect(isLikelyShareId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('レガシーの短い英数字 share_id を許容する', () => {
    expect(isLikelyShareId('aB3kPq9xZ2')).toBe(true);
  });

  it('短すぎ・長すぎ・不正文字は弾く', () => {
    expect(isLikelyShareId('abc')).toBe(false);          // 6 文字未満
    expect(isLikelyShareId('a'.repeat(41))).toBe(false); // 40 超
    expect(isLikelyShareId('has space')).toBe(false);
    expect(isLikelyShareId('drop/table')).toBe(false);
    expect(isLikelyShareId('')).toBe(false);
  });
});
