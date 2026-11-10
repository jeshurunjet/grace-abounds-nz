import { z } from 'zod';
import { requireRecentAuth } from '../../../../lib/server/current';
import { accountRoute, HttpError, ok } from '../../../../lib/server/http';
import { setIntent } from '../../../../lib/server/sessions';

export const runtime = 'nodejs';

const schema = z.object({ kind: z.enum(['google', 'passkey']) }).strict();

/**
 * Records, for 10 minutes and for this session only, that the person
 * intends to link Google or register a passkey. The Auth.js route guards
 * refuse linking/registration without it.
 */
export const POST = accountRoute(schema, async ({ kind }) => {
  const { userId, row } = await requireRecentAuth();
  if (
    kind === 'google' &&
    !(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)
  )
    throw new HttpError(
      503,
      'GOOGLE_UNAVAILABLE',
      'Google sign-in is not set up yet.',
    );
  await setIntent(kind, userId, row.id);
  return ok({ status: 'ready' });
});
