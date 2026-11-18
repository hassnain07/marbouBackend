import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH, ARGON2_PARAMS } from './argon2-params';

jest.setTimeout(30_000); // argon2 hashing takes a few seconds

/**
 * Item 5: Prove that freshly generated hashes and DUMMY_PASSWORD_HASH
 * have identical Argon2id parameters, so timing is indistinguishable.
 */
describe('argon2-params', () => {
  it('DUMMY_PASSWORD_HASH is an argon2id hash', () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$argon2id\$/);
  });

  it('DUMMY_PASSWORD_HASH embeds the same params as ARGON2_PARAMS', () => {
    // Format: $argon2id$v=19$m=<memoryCost>,t=<timeCost>,p=<parallelism>$...
    const match = DUMMY_PASSWORD_HASH.match(/m=(\d+),t=(\d+),p=(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(ARGON2_PARAMS.memoryCost);
    expect(Number(match![2])).toBe(ARGON2_PARAMS.timeCost);
    expect(Number(match![3])).toBe(ARGON2_PARAMS.parallelism);
  });

  it('freshly hashed password embeds the same params as ARGON2_PARAMS', async () => {
    const hashed = await hashPassword('test-password-min-12-chars');
    const match = hashed.match(/m=(\d+),t=(\d+),p=(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(ARGON2_PARAMS.memoryCost);
    expect(Number(match![2])).toBe(ARGON2_PARAMS.timeCost);
    expect(Number(match![3])).toBe(ARGON2_PARAMS.parallelism);
  });

  it('verifyPassword returns true for a correct hash', async () => {
    const pw = 'SomeAdminPass!99';
    const hashed = await hashPassword(pw);
    expect(await verifyPassword(hashed, pw)).toBe(true);
  });

  it('verifyPassword returns false for a wrong password', async () => {
    const hashed = await hashPassword('SomeAdminPass!99');
    expect(await verifyPassword(hashed, 'wrong')).toBe(false);
  });

  it('DUMMY_PASSWORD_HASH does not verify a random wrong password', async () => {
    // The dummy hash exists only for timing; it should not match any attacker guess
    expect(await verifyPassword(DUMMY_PASSWORD_HASH, 'wrong-password-123!')).toBe(false);
    expect(await verifyPassword(DUMMY_PASSWORD_HASH, 'ChangeMe!2026#')).toBe(false);
  });
});
