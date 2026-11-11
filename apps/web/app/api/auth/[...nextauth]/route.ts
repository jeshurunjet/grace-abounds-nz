import { NextRequest, NextResponse } from 'next/server';
import { normalizeEmail, prisma } from '@grace-abounds/database';
import { auth, handlers } from '../../../../auth';
import {
  ACCOUNT_BODY_LIMIT,
  clientIp,
  HttpError,
  readBodyLimited,
} from '../../../../lib/server/http';
import { allow, clearLimit } from '../../../../lib/server/limits';
import {
  currentSessionRow,
  INTENT_COOKIE_NAME,
  isRecent,
  readIntent,
  runAuthRequest,
  type IntentKind,
} from '../../../../lib/server/sessions';

export const runtime = 'nodejs';

const denied = (message: string) =>
  NextResponse.json(
    { error: { code: 'REAUTH_REQUIRED', message } },
    { status: 403, headers: { 'cache-control': 'no-store' } },
  );

/**
 * True when the browser is signed in. For a signed-in browser, linking or
 * registering is allowed only with a fresh intent for this exact session
 * and recent authentication.
 */
async function checkSignedInIntent(kind: IntentKind) {
  const session = await auth();
  if (!session?.user?.id)
    return { signedIn: false, allowed: false, link: null };
  const intent = await readIntent(kind);
  const row = await currentSessionRow(session.sessionId, session.user.id);
  const allowed =
    !!intent &&
    !!row &&
    intent.sid === row.id &&
    intent.sub === session.user.id &&
    isRecent(row);
  return {
    signedIn: true,
    allowed,
    link: allowed ? { userId: session.user.id, sessionId: row!.id } : null,
  };
}

function clearIntent(response: Response) {
  const headers = new Headers(response.headers);
  headers.append(
    'set-cookie',
    `${INTENT_COOKIE_NAME}=; Path=/api/auth; Max-Age=0; HttpOnly; SameSite=Lax`,
  );
  return new Response(response.body, { status: response.status, headers });
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;

  // Six-digit email sign-in codes: per-email and per-IP attempt limits.
  // After too many wrong codes every outstanding code is voided.
  if (url.pathname.endsWith('/callback/email-code')) {
    const email = normalizeEmail(url.searchParams.get('email') ?? '');
    const ipOk = await allow('codeVerifyIp', clientIp(request));
    const emailOk = ipOk && (await allow('codeVerifyEmail', email));
    if (!emailOk) {
      await prisma.verificationToken.deleteMany({
        where: { identifier: email },
      });
      return NextResponse.redirect(
        new URL('/login?error=TooManyAttempts', url),
        303,
      );
    }
    const response = await runAuthRequest(null, () => handlers.GET(request));
    const location = response.headers.get('location') ?? '';
    if (
      response.status >= 300 &&
      response.status < 400 &&
      !location.includes('error=')
    )
      await clearLimit('codeVerifyEmail', email);
    return response;
  }

  // Google: a signed-in browser may only link with a Settings intent.
  if (url.pathname.endsWith('/callback/google')) {
    const { signedIn, allowed, link } = await checkSignedInIntent('google');
    if (signedIn && !allowed)
      return NextResponse.redirect(
        new URL('/settings?error=LinkReauthRequired', url),
        303,
      );
    const response = link
      ? await runAuthRequest(link, () => handlers.GET(request))
      : await runAuthRequest(null, () => handlers.GET(request));
    return signedIn ? clearIntent(response) : response;
  }

  // Passkey options: registration only for a signed-in, recently
  // authenticated session with a passkey intent. Never for a new account.
  if (url.pathname.endsWith('/webauthn-options/passkey')) {
    const action = url.searchParams.get('action');
    const { signedIn, allowed } = await checkSignedInIntent('passkey');
    if (
      signedIn
        ? action !== 'authenticate' && !allowed
        : action !== 'authenticate'
    )
      return denied(
        'Confirm it’s you in Settings, then add the passkey again.',
      );
  }

  return runAuthRequest(null, () => handlers.GET(request));
}

export async function POST(request: NextRequest) {
  const url = request.nextUrl;
  if (url.pathname.endsWith('/callback/passkey')) {
    // Read the small form-encoded body once, within a byte limit, then hand
    // Auth.js an identical request.
    let text: string;
    try {
      text = await readBodyLimited(request, ACCOUNT_BODY_LIMIT);
    } catch (failure) {
      if (failure instanceof HttpError)
        return NextResponse.json(
          { error: { code: failure.code, message: failure.message } },
          { status: failure.status, headers: { 'cache-control': 'no-store' } },
        );
      throw failure;
    }
    const action = new URLSearchParams(text).get('action');
    const { signedIn, allowed, link } = await checkSignedInIntent('passkey');
    if (action !== 'authenticate' && !(signedIn && allowed))
      return denied(
        'Confirm it’s you in Settings, then add the passkey again.',
      );
    const forwarded = new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body: text,
    });
    // Registration runs in the verified linking context; sign-in never does.
    const response =
      action === 'register' && link
        ? await runAuthRequest(link, () => handlers.POST(forwarded))
        : await runAuthRequest(null, () => handlers.POST(forwarded));
    return action === 'register' ? clearIntent(response) : response;
  }
  return runAuthRequest(null, () => handlers.POST(request));
}
