import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id (the library default algorithm) with OWASP's recommended
 * minimum cost: 19 MiB memory, 2 iterations, 1 lane.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const hashPassword = (password: string) => hash(password, OPTIONS);

let dummy: Promise<string> | undefined;

/**
 * Verifies a password. When there is no stored hash, still does the same
 * work against a dummy hash, so response time doesn't reveal whether an
 * account or password exists.
 */
export async function verifyPassword(
  stored: string | null | undefined,
  password: string,
) {
  if (!stored) {
    dummy ??= hashPassword('grace-abounds-timing-equalizer');
    await verify(await dummy, password).catch(() => false);
    return false;
  }
  return verify(stored, password).catch(() => false);
}
