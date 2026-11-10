import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { ChallengePurpose, Prisma } from '@grace-abounds/database';
import { CODE_MAX_AGE_SECONDS, CODE_MAX_ATTEMPTS } from './limits';

function challengeKey() {
  const secret = process.env.AUTH_CHALLENGE_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('AUTH_CHALLENGE_SECRET must be set (32+ characters).');
  return secret;
}

/**
 * Keyed hash of a code, bound to its purpose and email. Without the server
 * secret, a leaked database row cannot be brute-forced offline.
 */
export const hashCode = (
  purpose: ChallengePurpose,
  email: string,
  code: string,
) =>
  createHmac('sha256', challengeKey())
    .update(`${purpose}:${email}:${code}`)
    .digest('hex');

export const generateCode = () =>
  String(randomInt(0, 1_000_000)).padStart(6, '0');

/** Lock namespace for challenges (two-key advisory locks; separate from single-key locks). */
const CHALLENGE_LOCK_CLASS = 7_204_102;

/**
 * Serializes issuing and checking codes for one email and purpose, even
 * when no challenge row exists yet. Held until the transaction ends.
 */
async function lockChallenges(
  tx: Prisma.TransactionClient,
  purpose: ChallengePurpose,
  email: string,
) {
  const key = `${purpose}:${email}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHALLENGE_LOCK_CLASS}::int, hashtext(${key}))`;
}

/**
 * Issues a new code and voids any outstanding code for the same purpose and
 * email. For sign-up, the pending password/name travel with this challenge
 * only, so an earlier unverified request can never be activated.
 */
export async function issueChallenge(
  tx: Prisma.TransactionClient,
  input: {
    purpose: ChallengePurpose;
    email: string;
    userId?: string;
    pendingPasswordHash?: string;
    pendingName?: string;
  },
) {
  await lockChallenges(tx, input.purpose, input.email);
  await tx.authChallenge.updateMany({
    where: { purpose: input.purpose, email: input.email, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  const code = generateCode();
  await tx.authChallenge.create({
    data: {
      purpose: input.purpose,
      email: input.email,
      userId: input.userId ?? null,
      codeHash: hashCode(input.purpose, input.email, code),
      pendingPasswordHash: input.pendingPasswordHash ?? null,
      pendingName: input.pendingName ?? null,
      expiresAt: new Date(Date.now() + CODE_MAX_AGE_SECONDS * 1000),
    },
  });
  return code;
}

/**
 * Checks a code and, if correct, marks it used in the caller's transaction.
 * Only the newest challenge for the email and purpose is ever considered:
 * once it is used, voided or expired, no older code becomes usable. Returns
 * the challenge or null. A wrong guess is counted on the challenge; after
 * CODE_MAX_ATTEMPTS it is voided. Checks are serialized with issuing.
 */
export async function consumeChallenge(
  tx: Prisma.TransactionClient,
  input: { purpose: ChallengePurpose; email: string; code: string },
) {
  await lockChallenges(tx, input.purpose, input.email);
  const challenge = await tx.authChallenge.findFirst({
    where: { purpose: input.purpose, email: input.email },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  if (
    !challenge ||
    challenge.consumedAt ||
    challenge.expiresAt.getTime() <= Date.now()
  )
    return null;
  const expected = Buffer.from(challenge.codeHash, 'hex');
  const actual = Buffer.from(
    hashCode(input.purpose, input.email, input.code),
    'hex',
  );
  if (!/^\d{6}$/.test(input.code) || !timingSafeEqual(expected, actual)) {
    await tx.$executeRaw`
      UPDATE "AuthChallenge"
      SET "attempts" = "attempts" + 1,
          "consumedAt" = CASE WHEN "attempts" + 1 >= ${CODE_MAX_ATTEMPTS} THEN now() ELSE "consumedAt" END
      WHERE "id" = ${challenge.id}`;
    return null;
  }
  const claimed = await tx.authChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return claimed.count === 1 ? challenge : null;
}
