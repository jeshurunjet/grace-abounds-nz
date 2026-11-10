import type { NextRequest } from 'next/server';
import { normalizeEmail, prisma } from '@grace-abounds/database';
import { handlers } from '../../../../auth';
import {
  CODE_LIMITS,
  consumeAttempt,
  resetAttempts,
} from '../../../../lib/server/auth-limits';

export const runtime = 'nodejs';

/**
 * Code checks go through Auth.js's email callback. Count every attempt per
 * email first; after too many wrong codes, void all outstanding codes so a
 * six-digit code cannot be brute forced.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  if (url.pathname.endsWith('/callback/email-code')) {
    const email = normalizeEmail(url.searchParams.get('email') ?? '');
    const key = `code-verify:${email}`;
    const allowed = await consumeAttempt(
      key,
      CODE_LIMITS.verifications.max,
      CODE_LIMITS.verifications.windowMs,
    );
    if (!allowed) {
      await prisma.verificationToken.deleteMany({
        where: { identifier: email },
      });
      return Response.redirect(
        new URL('/login?error=TooManyAttempts', url),
        303,
      );
    }
    const response = await handlers.GET(request);
    // A redirect away from the error page means the code was accepted.
    const location = response.headers.get('location') ?? '';
    if (
      response.status >= 300 &&
      response.status < 400 &&
      !location.includes('error=')
    )
      await resetAttempts(key);
    return response;
  }
  return handlers.GET(request);
}

export const { POST } = handlers;
