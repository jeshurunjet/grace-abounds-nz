import { z } from 'zod';
import { prisma } from '@grace-abounds/database';
import {
  emailField,
  passwordField,
} from '../../../../lib/server/account-schemas';
import { issueChallenge } from '../../../../lib/server/challenges';
import { emails, sendEmail } from '../../../../lib/server/email';
import { accountRoute, clientIp, ok } from '../../../../lib/server/http';
import { allow } from '../../../../lib/server/limits';
import { hashPassword } from '../../../../lib/server/password';

export const runtime = 'nodejs';

const schema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(80),
    email: emailField,
    password: passwordField,
  })
  .strict();

/**
 * Step 1 of password sign-up. Always answers 202 with the same body, so the
 * response never reveals whether the email already has an account. No
 * account exists until the emailed code is verified.
 */
export const POST = accountRoute(
  schema,
  async ({ name, email, password }, request) => {
    const accepted = () => ok({ status: 'code_sent' }, 202);
    if (!(await allow('signupIp', clientIp(request)))) return accepted();
    if (!(await allow('codeRequestEmail', email))) return accepted();
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      await sendEmail(emails.alreadyRegistered(email));
      return accepted();
    }
    const pendingPasswordHash = await hashPassword(password);
    const code = await prisma.$transaction((tx) =>
      issueChallenge(tx, {
        purpose: 'SIGNUP_VERIFY',
        email,
        pendingPasswordHash,
        pendingName: name,
      }),
    );
    await sendEmail(emails.signupCode(email, code));
    return accepted();
  },
);
