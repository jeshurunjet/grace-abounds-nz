import { consumeAttempt, prisma, resetAttempts } from '@grace-abounds/database';

const MINUTE = 60 * 1000;

/**
 * Abuse limits. Per-email limits protect each account; per-IP limits are
 * deliberately higher because a church's shared Wi-Fi puts many members
 * behind one address.
 */
export const LIMITS = {
  codeRequestEmail: { max: 5, windowMs: 60 * MINUTE },
  codeRequestIp: { max: 30, windowMs: 60 * MINUTE },
  codeVerifyEmail: { max: 5, windowMs: 15 * MINUTE },
  codeVerifyIp: { max: 60, windowMs: 15 * MINUTE },
  passwordEmail: { max: 5, windowMs: 15 * MINUTE },
  passwordIp: { max: 50, windowMs: 15 * MINUTE },
  signupIp: { max: 20, windowMs: 60 * MINUTE },
} as const;

export type LimitName = keyof typeof LIMITS;

export function allow(name: LimitName, subject: string) {
  const { max, windowMs } = LIMITS[name];
  return consumeAttempt(prisma, `${name}:${subject}`, max, windowMs);
}

export const clearLimit = (name: LimitName, subject: string) =>
  resetAttempts(prisma, `${name}:${subject}`);

/** All six-digit codes expire after 10 minutes. */
export const CODE_MAX_AGE_SECONDS = 10 * 60;
/** Wrong guesses before a code is voided. */
export const CODE_MAX_ATTEMPTS = 5;
