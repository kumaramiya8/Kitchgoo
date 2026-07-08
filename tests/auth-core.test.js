import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, legacySimpleHash } from '../api/_lib/core.js';

describe('password hashing', () => {
  it('hashes with scrypt and verifies the right password', () => {
    const stored = hashPassword('s3cret-pass');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('s3cret-pass', stored).ok).toBe(true);
    expect(verifyPassword('wrong', stored).ok).toBe(false);
  });

  it('produces unique salts', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('accepts legacy simpleHash rows and flags them for rehash', () => {
    const legacy = legacySimpleHash('admin123');
    const res = verifyPassword('admin123', legacy);
    expect(res.ok).toBe(true);
    expect(res.needsRehash).toBe(true);
  });

  it('rejects wrong passwords against legacy rows without rehash flag', () => {
    const legacy = legacySimpleHash('admin123');
    const res = verifyPassword('nope', legacy);
    expect(res.ok).toBe(false);
  });

  it('rejects empty/garbage stored values', () => {
    expect(verifyPassword('x', '').ok).toBe(false);
    expect(verifyPassword('x', 'scrypt$broken').ok).toBe(false);
    expect(verifyPassword('x', null).ok).toBe(false);
  });
});
