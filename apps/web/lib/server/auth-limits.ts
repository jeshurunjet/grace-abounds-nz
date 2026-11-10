import { prisma } from '@grace-abounds/database';

/**
 * Fixed-window limiter backed by the AuthAttempt table, so limits hold
 * across server instances and restarts. Returns false once `max` is reached.
 */
export async function consumeAttempt(
  key: string,
  max: number,
  windowMs: number,
) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const current = await tx.authAttempt.findUnique({ where: { key } });
    if (!current || now.getTime() - current.windowStart.getTime() > windowMs) {
      await tx.authAttempt.upsert({
        where: { key },
        create: { key, count: 1, windowStart: now },
        update: { count: 1, windowStart: now },
      });
      return true;
    }
    if (current.count >= max) return false;
    await tx.authAttempt.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return true;
  });
}

export const resetAttempts = (key: string) =>
  prisma.authAttempt.deleteMany({ where: { key } });

/** Limits for six-digit sign-in codes. */
export const CODE_LIMITS = {
  /** Codes that can be requested per email per hour. */
  requests: { max: 5, windowMs: 60 * 60 * 1000 },
  /** Wrong guesses per email before every outstanding code is voided. */
  verifications: { max: 5, windowMs: 15 * 60 * 1000 },
  /** Code lifetime. */
  maxAgeSeconds: 10 * 60,
};
