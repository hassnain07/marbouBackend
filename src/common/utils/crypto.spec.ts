import { sha256, canonicalJson } from './crypto';

describe('sha256', () => {
  it('produces a 64-char hex string', () => {
    expect(sha256('hello')).toHaveLength(64);
    expect(sha256('hello')).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic', () => {
    expect(sha256('test')).toBe(sha256('test'));
  });

  it('differs for different inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});

describe('canonicalJson', () => {
  it('sorts object keys alphabetically', () => {
    const result = canonicalJson({ z: 1, a: 2, m: 3 });
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  it('sorts nested objects', () => {
    const result = canonicalJson({ b: { z: 1, a: 2 }, a: 'x' });
    expect(result).toBe('{"a":"x","b":{"a":2,"z":1}}');
  });

  it('produces the same string for equivalent objects regardless of insertion order', () => {
    const o1 = { action: 'flag.patch', actorId: 'x', entity: 'FeatureFlag' };
    const o2 = { entity: 'FeatureFlag', actorId: 'x', action: 'flag.patch' };
    expect(canonicalJson(o1)).toBe(canonicalJson(o2));
  });

  it('serialises BigInt to string', () => {
    expect(canonicalJson(BigInt(123))).toBe('"123"');
  });

  it('serialises Date to ISO string', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(canonicalJson(d)).toBe('"2026-01-01T00:00:00.000Z"');
  });

  it('drops undefined fields', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('handles arrays', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });
});
