import type { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { HttpError, readBodyLimited } from '../../../../lib/server/http';
import {
  PUBLIC_CONTENT_TAG,
  verifyRevalidation,
} from '../../../../lib/server/revalidation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const reply = (status: number, body: object) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * Called by the API's outbox dispatcher after published content changes, so
 * cached public pages (when PUBLIC_CONTENT_CACHE_SECONDS is set) refresh at
 * once. Signed with the shared API secret; anything else is refused.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.API_ASSERTION_SECRET ?? '';
  let body: unknown;
  try {
    body = JSON.parse((await readBodyLimited(request, 4096)) || 'null');
  } catch (failure) {
    return reply(failure instanceof HttpError ? failure.status : 400, {
      error: { code: 'BAD_REQUEST', message: 'Invalid request.' },
    });
  }
  if (!verifyRevalidation(body, secret))
    return reply(401, {
      error: { code: 'UNAUTHENTICATED', message: 'Not allowed.' },
    });
  revalidateTag(PUBLIC_CONTENT_TAG);
  return reply(200, { data: { revalidated: true } });
}
