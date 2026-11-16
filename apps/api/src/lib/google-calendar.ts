import { createHash, createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/*
 * Google Calendar adapter (Phase 3C): one-way writes to the church's public
 * calendar with a service account. Server-to-server OAuth as Google
 * documents it: an RS256-signed JWT (iss = the service account, scope,
 * aud = the token endpoint, iat/exp ≤ 1 hour) exchanged at
 * https://oauth2.googleapis.com/token for an access token, reused until it
 * expires. Only the narrow `calendar.events` scope is requested.
 *
 * The key file stays on the server's disk (GOOGLE_CALENDAR_CREDENTIALS_FILE);
 * its contents are never logged or stored in the database.
 */

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const CHURCH_TIME_ZONE = 'Pacific/Auckland';

/** The public fields of one event. Nothing about people or places taken. */
export type CalendarEvent = {
  summary: string;
  description: string;
  location: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
};

export interface CalendarProvider {
  /**
   * Creates the event with this id, or replaces it if it exists (also if it
   * was removed earlier). Returns the id Google holds it under.
   */
  upsert(id: string, event: CalendarEvent): Promise<string>;
  /** Removes the event; one that is already gone counts as removed. */
  remove(id: string): Promise<void>;
}

export class CalendarError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * A stable Google event id for one occurrence: Google accepts 5–1024
 * characters from base32hex (a–v, 0–9). Hex digits are a subset, so the same
 * activity and date always give the same id and a retry can't duplicate.
 */
export function googleEventId(activityId: string, date: string) {
  return `ga${createHash('sha256').update(`${activityId}|${date}`).digest('hex').slice(0, 40)}`;
}

export type GoogleCalendarConfig = {
  calendarId: string;
  credentialsFile: string;
};
export function googleCalendarConfig(
  env: Record<string, string | undefined> = process.env,
): GoogleCalendarConfig | null {
  const calendarId = env.GOOGLE_CALENDAR_ID?.trim();
  const credentialsFile = env.GOOGLE_CALENDAR_CREDENTIALS_FILE?.trim();
  return calendarId && credentialsFile ? { calendarId, credentialsFile } : null;
}

type Credentials = { client_email: string; private_key: string };
const base64url = (value: string | Buffer) =>
  Buffer.from(value).toString('base64url');

/** The signed assertion Google exchanges for an access token. */
export function signAssertion(
  credentials: Credentials,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(credentials.private_key);
  return `${header}.${claims}.${base64url(signature)}`;
}

async function readCredentials(file: string): Promise<Credentials> {
  let parsed: Partial<Credentials> & { type?: string };
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw new CalendarError(
      'The Google Calendar key file can’t be read. Check GOOGLE_CALENDAR_CREDENTIALS_FILE points to the downloaded JSON key.',
      0,
      false,
    );
  }
  if (
    parsed.type !== 'service_account' ||
    typeof parsed.client_email !== 'string' ||
    typeof parsed.private_key !== 'string'
  )
    throw new CalendarError(
      'The Google Calendar key file isn’t a service account key (JSON).',
      0,
      false,
    );
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

/** The real calendar, over Google's REST API. */
export function googleCalendar(
  config: GoogleCalendarConfig,
  send: typeof fetch = fetch,
  credentialsSource: () => Promise<Credentials> = () =>
    readCredentials(config.credentialsFile),
): CalendarProvider {
  let credentials: Credentials | null = null;
  let token: { value: string; expires: number } | null = null;

  async function accessToken(fresh: boolean) {
    if (!fresh && token && token.expires > Date.now() + 60_000)
      return token.value;
    credentials ??= await credentialsSource();
    const response = await request(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signAssertion(credentials),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: unknown;
      expires_in?: unknown;
      error_description?: unknown;
    };
    if (!response.ok || typeof body.access_token !== 'string')
      throw new CalendarError(
        `Google sign-in for the calendar failed (${response.status}${typeof body.error_description === 'string' ? `: ${body.error_description}` : ''}).`,
        response.status,
        response.status >= 500 || response.status === 429,
      );
    token = {
      value: body.access_token,
      expires: Date.now() + Number(body.expires_in ?? 3600) * 1000,
    };
    return token.value;
  }

  async function request(url: string, init: RequestInit) {
    try {
      return await send(url, { ...init, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new CalendarError('Google Calendar couldn’t be reached.', 0, true);
    }
  }

  const events = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`;
  async function call(
    method: string,
    path: string,
    body?: unknown,
    fresh = false,
  ): Promise<Response> {
    const response = await request(`${events}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await accessToken(fresh)}`,
        ...(body !== undefined && { 'content-type': 'application/json' }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    // An expired token: sign in again once.
    if (response.status === 401 && !fresh)
      return call(method, path, body, true);
    return response;
  }

  async function failure(response: Response, action: string) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string; errors?: { reason?: string }[] };
    } | null;
    const reason = body?.error?.errors?.[0]?.reason ?? '';
    const rate =
      response.status === 429 ||
      (response.status === 403 && /rateLimit|quotaExceeded/i.test(reason));
    const hint =
      response.status === 403 && !rate
        ? ' Check the calendar is shared with the service account with “Make changes to events”.'
        : response.status === 404
          ? ' Check GOOGLE_CALENDAR_ID.'
          : '';
    return new CalendarError(
      `Google Calendar ${action} failed (${response.status}${body?.error?.message ? `: ${body.error.message}` : ''}).${hint}`,
      response.status,
      rate || response.status >= 500,
    );
  }

  // Never notify anyone: there are no attendees, and sendUpdates=none says so.
  const quiet = '?sendUpdates=none';
  return {
    async upsert(id, event) {
      // A removed event keeps its id in Google; if it can't be brought
      // back, a numbered variant of the same id is used instead.
      for (let attempt = 0; attempt < 3; attempt++) {
        const target = attempt ? `${id}v${attempt}` : id;
        const created = await call('POST', quiet, { id: target, ...event });
        if (created.ok) return target;
        if (created.status !== 409) throw await failure(created, 'create');
        const replaced = await call(`PUT`, `/${target}${quiet}`, {
          ...event,
          status: 'confirmed',
        });
        if (replaced.ok) return target;
        if (replaced.status !== 404 && replaced.status !== 410)
          throw await failure(replaced, 'update');
      }
      throw new CalendarError(
        'Google Calendar wouldn’t accept this event’s id.',
        409,
        false,
      );
    },
    async remove(id) {
      const response = await call('DELETE', `/${id}${quiet}`);
      if (response.ok || response.status === 404 || response.status === 410)
        return;
      throw await failure(response, 'removal');
    },
  };
}

/** Test stand-in: an in-memory calendar that can be told to fail. */
export class MemoryCalendar implements CalendarProvider {
  events = new Map<string, CalendarEvent>();
  created = 0;
  calls: string[] = [];
  /** How many of the next calls fail, and how. */
  failures = 0;
  failure = new CalendarError(
    'Google Calendar create failed (503).',
    503,
    true,
  );

  private check() {
    if (this.failures > 0) {
      this.failures--;
      throw this.failure;
    }
  }
  async upsert(id: string, event: CalendarEvent) {
    this.calls.push(`upsert ${id}`);
    this.check();
    if (!this.events.has(id)) this.created++;
    this.events.set(id, structuredClone(event));
    return id;
  }
  async remove(id: string) {
    this.calls.push(`remove ${id}`);
    this.check();
    this.events.delete(id);
  }
}
