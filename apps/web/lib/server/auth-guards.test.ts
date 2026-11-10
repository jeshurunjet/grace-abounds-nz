// @vitest-environment node
import { dbTestsEnabled } from '@grace-abounds/database/test-env';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@grace-abounds/database';
import {
  createSession,
  createUser,
  resetIdentityTables,
} from '@grace-abounds/database/testing';

/** Stand-ins for Next's request cookies and the Auth.js handlers. */
const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  session: null as null | { user: { id: string }; sessionId: string },
  handled: [] as { method: string; url: string; body: string }[],
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      state.cookies.has(name)
        ? { name, value: state.cookies.get(name)! }
        : undefined,
    set: (name: string, value: string) => state.cookies.set(name, value),
  }),
  headers: async () => new Headers({ 'user-agent': 'vitest' }),
}));
vi.mock('../../auth', () => ({
  auth: async () => state.session,
  handlers: {
    GET: async (request: Request) => {
      state.handled.push({ method: 'GET', url: request.url, body: '' });
      return new Response('handled', { status: 200 });
    },
    POST: async (request: Request) => {
      state.handled.push({
        method: 'POST',
        url: request.url,
        body: await request.text(),
      });
      return new Response('handled', { status: 200 });
    },
  },
}));

const { GET, POST } = await import('../../app/api/auth/[...nextauth]/route');
const { setIntent } = await import('./sessions');

const BASE = 'http://localhost:3000/api/auth';
const get = (path: string) => GET(new NextRequest(`${BASE}${path}`));
const post = (path: string, form: Record<string, string>) =>
  POST(
    new NextRequest(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    }),
  );
const HOUR_AGO = () => new Date(Date.now() - 60 * 60 * 1000);

describe.skipIf(!dbTestsEnabled)('Auth.js route guards (PostgreSQL)', () => {
  beforeEach(async () => {
    await resetIdentityTables();
    state.cookies.clear();
    state.session = null;
    state.handled = [];
  });
  afterAll(() => prisma.$disconnect());

  async function signIn(options: { authenticatedAt?: Date } = {}) {
    const user = await createUser();
    const row = await createSession(user.id, options);
    state.session = { user: { id: user.id }, sessionId: row.id };
    return { user, row };
  }

  it('signed out: passkey sign-in passes, any registration is refused', async () => {
    expect(
      (await get('/webauthn-options/passkey?action=authenticate')).status,
    ).toBe(200);
    expect(
      (await get('/webauthn-options/passkey?action=register')).status,
    ).toBe(403);
    expect((await get('/webauthn-options/passkey')).status).toBe(403);
    expect(
      (await post('/callback/passkey', { action: 'register', data: '{}' }))
        .status,
    ).toBe(403);
    const auth = await post('/callback/passkey', {
      action: 'authenticate',
      data: '{"x":1}',
    });
    expect(auth.status).toBe(200);
    // Auth.js receives the identical body after the bounded read.
    expect(new URLSearchParams(state.handled.at(-1)!.body).get('data')).toBe(
      '{"x":1}',
    );
  });

  it('signed out: Google sign-in goes to Auth.js (sign-in rules apply there)', async () => {
    expect((await get('/callback/google?code=x&state=y')).status).toBe(200);
  });

  it('signed in without an intent: linking and registration are refused', async () => {
    await signIn();
    expect(
      (await get('/webauthn-options/passkey?action=register')).status,
    ).toBe(403);
    expect(
      (await post('/callback/passkey', { action: 'register', data: '{}' }))
        .status,
    ).toBe(403);
    const google = await get('/callback/google?code=x&state=y');
    expect(google.status).toBe(303);
    expect(google.headers.get('location')).toContain(
      '/settings?error=LinkReauthRequired',
    );
    expect(state.handled).toHaveLength(0);
  });

  it('refuses an intent without recent authentication', async () => {
    const { user, row } = await signIn({ authenticatedAt: HOUR_AGO() });
    await setIntent('passkey', user.id, row.id);
    expect(
      (await get('/webauthn-options/passkey?action=register')).status,
    ).toBe(403);
  });

  it('refuses an intent for a different session, kind or a revoked session', async () => {
    const { user, row } = await signIn();
    const other = await createSession(user.id);
    await setIntent('passkey', user.id, other.id);
    expect(
      (await get('/webauthn-options/passkey?action=register')).status,
    ).toBe(403);
    await setIntent('google', user.id, row.id);
    expect(
      (await get('/webauthn-options/passkey?action=register')).status,
    ).toBe(403);
    await setIntent('passkey', user.id, row.id);
    await prisma.userSession.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    expect(
      (await get('/webauthn-options/passkey?action=register')).status,
    ).toBe(403);
    expect(state.handled).toHaveLength(0);
  });

  it('allows intended, recently confirmed passkey registration and clears the intent', async () => {
    const { user, row } = await signIn();
    await setIntent('passkey', user.id, row.id);
    expect(
      (await get('/webauthn-options/passkey?action=register')).status,
    ).toBe(200);
    const done = await post('/callback/passkey', {
      action: 'register',
      data: '{}',
    });
    expect(done.status).toBe(200);
    expect(done.headers.get('set-cookie')).toContain(
      'grace-auth-intent=; Path=/api/auth; Max-Age=0',
    );
  });

  it('allows intended Google linking and clears the intent', async () => {
    const { user, row } = await signIn();
    await setIntent('google', user.id, row.id);
    const done = await get('/callback/google?code=x&state=y');
    expect(done.status).toBe(200);
    expect(done.headers.get('set-cookie')).toContain('grace-auth-intent=;');
  });

  it('rejects an oversized passkey callback body', async () => {
    const response = await post('/callback/passkey', {
      action: 'authenticate',
      data: 'x'.repeat(20_000),
    });
    expect(response.status).toBe(413);
  });

  it('voids email sign-in codes after too many attempts', async () => {
    const email = 'codes@example.test';
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token: 'hashed',
        expires: new Date(Date.now() + 600_000),
      },
    });
    for (let i = 0; i < 5; i += 1)
      await get(`/callback/email-code?email=${email}&token=000000`);
    const blocked = await get(
      `/callback/email-code?email=${email}&token=000000`,
    );
    expect(blocked.headers.get('location')).toContain('error=TooManyAttempts');
    expect(
      await prisma.verificationToken.count({ where: { identifier: email } }),
    ).toBe(0);
  });
});
