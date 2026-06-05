import { describe, it, expect } from 'vitest';
import { frontendApiFromPublishableKey } from '../../src/domain/clerkPublishableKey.js';

describe('frontendApiFromPublishableKey', () => {
  it('decodes the Frontend API host from a pk_test_ key', () => {
    // base64('set-turkey-55.clerk.accounts.dev$') = c2V0LXR1cmtleS01NS5jbGVyay5hY2NvdW50cy5kZXYk
    const pk = 'pk_test_c2V0LXR1cmtleS01NS5jbGVyay5hY2NvdW50cy5kZXYk';
    expect(frontendApiFromPublishableKey(pk)).toBe('set-turkey-55.clerk.accounts.dev');
  });

  it('works for pk_live_ keys too', () => {
    // base64('clerk.example.com$')
    const body = btoa('clerk.example.com$');
    expect(frontendApiFromPublishableKey(`pk_live_${body}`)).toBe('clerk.example.com');
  });

  it('returns null for malformed keys', () => {
    expect(frontendApiFromPublishableKey('')).toBe(null);
    expect(frontendApiFromPublishableKey(null)).toBe(null);
    expect(frontendApiFromPublishableKey('nope')).toBe(null);
    expect(frontendApiFromPublishableKey('pk_test_')).toBe(null);
    expect(frontendApiFromPublishableKey('pk_test_!!!not-base64!!!')).toBe(null);
  });
});
