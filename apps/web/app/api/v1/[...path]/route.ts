import type { NextRequest } from 'next/server';
import { auth } from '../../../../auth';
import { signIdentityAssertion } from '../../../../lib/server/assertion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const FORWARDED_HEADERS = [
  'content-type',
  'if-match',
  'idempotency-key',
  'accept',
];
const RETURNED_HEADERS = ['content-type', 'etag', 'location', 'retry-after'];

function error(
  status: number,
  code: string,
  message: string,
  requestId: string,
) {
  return Response.json(
    { error: { code, message, requestId } },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

/**
 * Same-origin gateway: browser → /api/v1/* → Fastify /v1/*.
 * Adds a signed identity assertion for signed-in users and blocks
 * cross-site mutations. Private responses are never cached.
 */
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const requestId = crypto.randomUUID();
  const { path } = await params;
  const mutation = !['GET', 'HEAD'].includes(request.method);
  if (mutation) {
    const origin = request.headers.get('origin');
    if (!origin || new URL(origin).host !== request.nextUrl.host)
      return error(
        403,
        'CROSS_SITE_REQUEST',
        'Request origin not allowed.',
        requestId,
      );
  }

  const session = await auth();
  const headers = new Headers({ 'x-request-id': requestId });
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (session?.user?.id)
    headers.set(
      'authorization',
      `Bearer ${await signIdentityAssertion(session.user.id, requestId)}`,
    );

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/v1/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body: mutation ? await request.text() : undefined,
        cache: 'no-store',
      },
    );
  } catch {
    return error(
      503,
      'API_UNAVAILABLE',
      'The service is unavailable. Please try again.',
      requestId,
    );
  }

  const responseHeaders = new Headers({ 'x-request-id': requestId });
  for (const name of RETURNED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  const isPublic = path[0] === 'public' && !session;
  responseHeaders.set(
    'cache-control',
    isPublic
      ? (upstream.headers.get('cache-control') ?? 'no-store')
      : 'private, no-store',
  );
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PATCH,
  proxy as PUT,
  proxy as DELETE,
};
