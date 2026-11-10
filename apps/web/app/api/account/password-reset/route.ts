import { z } from 'zod';
import { prisma } from '@grace-abounds/database';
import { emailField } from '../../../../lib/server/account-schemas';
import { issueChallenge } from '../../../../lib/server/challenges';
import { emails, sendEmail } from '../../../../lib/server/email';
import { accountRoute, clientIp, ok } from '../../../../lib/server/http';
import { allow } from '../../../../lib/server/limits';

export const runtime = 'nodejs';

const schema = z.object({ email: emailField }).strict();

/** Sends a reset code to active accounts. Same 202 answer for every address. */
export const POST = accountRoute(schema, async ({ email }, request) => {
  const accepted = () => ok({ status: 'code_sent' }, 202);
  if (!(await allow('codeRequestIp', clientIp(request)))) return accepted();
  if (!(await allow('codeRequestEmail', email))) return accepted();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, status: true },
  });
  if (!user || user.status !== 'ACTIVE') return accepted();
  const code = await prisma.$transaction((tx) =>
    issueChallenge(tx, { purpose: 'PASSWORD_RESET', email, userId: user.id }),
  );
  await sendEmail(emails.resetCode(email, code));
  return accepted();
});
