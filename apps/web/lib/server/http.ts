import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';

/** The site's public origin, from AUTH_URL (falls back to NEXT_PUBLIC_SITE_URL). */
export function appOrigin() {
  const raw = process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) throw new Error('AUTH_URL must be set to the site origin.');
  return new URL(raw).origin;
}

/** Mutations must come from this site; a missing or "null" Origin is refused. */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return false;
  try {
    return new URL(origin).origin === appOrigin();
  } catch {
    return false;
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export function errorResponse(error: HttpError, requestId: string) {
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.fieldErrors && { fieldErrors: error.fieldErrors }),
        requestId,
      },
    },
    { status: error.status, headers: { 'cache-control': 'no-store' } },
  );
}

/** Account and auth form bodies are small. */
export const ACCOUNT_BODY_LIMIT = 16 * 1024;

/**
 * Reads a request body as UTF-8 text without ever buffering more than
 * maxBytes: a declared Content-Length over the limit is refused before
 * reading, and a chunked or undeclared body is cut off as soon as the byte
 * count passes the limit. Throws HttpError 413.
 */
export async function readBodyLimited(request: Request, maxBytes: number) {
  const tooLarge = () =>
    new HttpError(413, 'TOO_LARGE', 'The request is too large.');
  const declared = request.headers.get('content-length');
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > maxBytes)
  )
    throw tooLarge();
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Wraps an account route: same-origin check, bounded JSON body, the API
 * error envelope, private no-store responses, and no stack traces.
 */
export function accountRoute<T>(
  schema: ZodType<T>,
  handler: (input: T, request: Request) => Promise<Response>,
) {
  return async (request: Request) => {
    const requestId = crypto.randomUUID();
    try {
      if (!isSameOrigin(request))
        throw new HttpError(
          403,
          'CROSS_SITE_REQUEST',
          'Request origin not allowed.',
        );
      const text = await readBodyLimited(request, ACCOUNT_BODY_LIMIT);
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        throw new HttpError(
          400,
          'BAD_REQUEST',
          'The request could not be read.',
        );
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues)
          fieldErrors[issue.path.join('.') || '_'] ??= issue.message;
        throw new HttpError(
          422,
          'VALIDATION_FAILED',
          'Some fields need attention.',
          fieldErrors,
        );
      }
      const response = await handler(parsed.data, request);
      response.headers.set('cache-control', 'no-store');
      return response;
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error, requestId);
      console.error(
        `[account] request ${requestId} failed`,
        error instanceof Error ? error.name : 'error',
      );
      return errorResponse(
        new HttpError(
          500,
          'INTERNAL',
          'Something went wrong. Please try again.',
        ),
        requestId,
      );
    }
  };
}

export const ok = (data: unknown, status = 200) =>
  NextResponse.json({ data }, { status });

/**
 * Client address for abuse limits. Only X-Forwarded-For entries added by
 * the configured number of trusted proxies are believed
 * (TRUSTED_PROXY_HOPS; 0 = no proxy, e.g. local development).
 */
export function clientIp(request: Request) {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);
  if (!Number.isInteger(hops) || hops < 1) return 'direct';
  const chain = (request.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return chain[chain.length - hops] ?? 'unknown';
}
