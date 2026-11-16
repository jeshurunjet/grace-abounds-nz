// @vitest-environment node
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  CalendarError,
  googleCalendar,
  googleCalendarConfig,
  googleEventId,
  signAssertion,
  type CalendarEvent,
} from './lib/google-calendar.js';

/*
 * Phase 3C: the Google adapter, against a fake Google. Stable ids, Google's
 * documented service-account sign-in, idempotent create-or-replace, quiet
 * writes (no notifications), and errors staff can act on.
 */

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const credentials = {
  client_email: 'calendar-sync@church-project.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};
const event: CalendarEvent = {
  summary: 'Family Night',
  description: 'Games and food.',
  location: 'Main hall',
  start: { dateTime: '2026-11-22T18:00:00', timeZone: 'Pacific/Auckland' },
  end: { dateTime: '2026-11-22T20:00:00', timeZone: 'Pacific/Auckland' },
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** A fake Google: the token endpoint, then scripted calendar replies. */
function fakeGoogle(replies: Response[]) {
  const calls: { url: string; method: string; body: string }[] = [];
  const send = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      calls.push({
        url: target,
        method: init?.method ?? 'GET',
        body: String(init?.body ?? ''),
      });
      if (target === 'https://oauth2.googleapis.com/token')
        return json({
          access_token: `token-${calls.length}`,
          expires_in: 3600,
        });
      return replies.shift() ?? json({});
    },
  );
  const provider = googleCalendar(
    { calendarId: 'church@group.calendar.google.com', credentialsFile: '' },
    send as unknown as typeof fetch,
    async () => credentials,
  );
  return { provider, calls };
}

describe('Google Calendar adapter', () => {
  it('gives each occurrence a stable, valid event id', () => {
    const id = googleEventId('activity-1', '2026-11-22');
    expect(id).toBe(googleEventId('activity-1', '2026-11-22'));
    expect(id).not.toBe(googleEventId('activity-1', '2026-11-29'));
    // Google: 5–1024 characters, base32hex (a–v, 0–9).
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
  });

  it('is configured only with both settings', () => {
    expect(googleCalendarConfig({})).toBeNull();
    expect(googleCalendarConfig({ GOOGLE_CALENDAR_ID: 'x' })).toBeNull();
    expect(
      googleCalendarConfig({
        GOOGLE_CALENDAR_ID: 'x@group.calendar.google.com',
        GOOGLE_CALENDAR_CREDENTIALS_FILE: '/private/key.json',
      }),
    ).toEqual({
      calendarId: 'x@group.calendar.google.com',
      credentialsFile: '/private/key.json',
    });
  });

  it('signs the documented service-account assertion', () => {
    const now = 1_800_000_000;
    const assertion = signAssertion(credentials, now);
    const [header, claims, signature] = assertion.split('.');
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(claims!, 'base64url').toString())).toEqual({
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/calendar.events',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    });
    expect(
      createVerify('RSA-SHA256')
        .update(`${header}.${claims}`)
        .verify(publicKey, Buffer.from(signature!, 'base64url')),
    ).toBe(true);
  });

  it('creates with the stable id, quietly, after signing in once', async () => {
    const { provider, calls } = fakeGoogle([json({ id: 'x' })]);
    expect(await provider.upsert('gaabc123', event)).toBe('gaabc123');
    const [token, create] = calls;
    expect(new URLSearchParams(token!.body).get('grant_type')).toBe(
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
    );
    expect(create).toMatchObject({
      method: 'POST',
      url: 'https://www.googleapis.com/calendar/v3/calendars/church%40group.calendar.google.com/events?sendUpdates=none',
    });
    expect(JSON.parse(create!.body)).toEqual({ id: 'gaabc123', ...event });
    // The token is reused for the next call.
    await provider.remove('gaabc123');
    expect(calls.filter((call) => call.url.includes('oauth2')).length).toBe(1);
  });

  it('an existing (or removed) event is replaced, never duplicated', async () => {
    const { provider, calls } = fakeGoogle([
      json(
        { error: { message: 'The requested identifier already exists.' } },
        409,
      ),
      json({ id: 'gaabc123' }),
    ]);
    expect(await provider.upsert('gaabc123', event)).toBe('gaabc123');
    const replace = calls.at(-1)!;
    expect(replace.method).toBe('PUT');
    expect(replace.url).toContain('/events/gaabc123?sendUpdates=none');
    expect(JSON.parse(replace.body)).toEqual({ ...event, status: 'confirmed' });
  });

  it('falls back to a numbered id if a removed one can’t come back', async () => {
    const { provider } = fakeGoogle([
      json({}, 409),
      json({}, 410),
      json({ id: 'gaabc123v1' }),
    ]);
    expect(await provider.upsert('gaabc123', event)).toBe('gaabc123v1');
  });

  it('treats an event that is already gone as removed', async () => {
    for (const status of [404, 410]) {
      const { provider } = fakeGoogle([json({}, status)]);
      await expect(provider.remove('gaabc123')).resolves.toBeUndefined();
    }
  });

  it('signs in again once when the token has expired', async () => {
    const { provider, calls } = fakeGoogle([json({}, 401), json({ id: 'x' })]);
    await provider.upsert('gaabc123', event);
    expect(calls.filter((call) => call.url.includes('oauth2')).length).toBe(2);
  });

  it('explains permission problems and retries only passing ones', async () => {
    const forbidden = fakeGoogle([
      json(
        { error: { message: 'Forbidden', errors: [{ reason: 'forbidden' }] } },
        403,
      ),
    ]);
    const denied = await forbidden.provider
      .upsert('gaabc123', event)
      .catch((error: CalendarError) => error);
    expect(denied).toBeInstanceOf(CalendarError);
    expect((denied as CalendarError).retryable).toBe(false);
    expect((denied as CalendarError).message).toMatch(/Make changes to events/);

    const limited = fakeGoogle([
      json({ error: { errors: [{ reason: 'rateLimitExceeded' }] } }, 403),
    ]);
    expect(
      (
        (await limited.provider
          .upsert('gaabc123', event)
          .catch((error) => error)) as CalendarError
      ).retryable,
    ).toBe(true);

    const down = fakeGoogle([json({}, 503)]);
    expect(
      (
        (await down.provider
          .remove('gaabc123')
          .catch((error) => error)) as CalendarError
      ).retryable,
    ).toBe(true);
  });

  it('a missing or wrong key file is a clear, non-retrying error', async () => {
    const provider = googleCalendar(
      { calendarId: 'c', credentialsFile: '/nowhere/key.json' },
      vi.fn() as unknown as typeof fetch,
    );
    const error = (await provider
      .upsert('gaabc123', event)
      .catch((failure) => failure)) as CalendarError;
    expect(error).toBeInstanceOf(CalendarError);
    expect(error.retryable).toBe(false);
    expect(error.message).toMatch(/GOOGLE_CALENDAR_CREDENTIALS_FILE/);
  });

  it('an unreachable Google is retried later', async () => {
    const provider = googleCalendar(
      { calendarId: 'c', credentialsFile: '' },
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
      async () => credentials,
    );
    const error = (await provider
      .remove('gaabc123')
      .catch((failure) => failure)) as CalendarError;
    expect(error.retryable).toBe(true);
  });
});
