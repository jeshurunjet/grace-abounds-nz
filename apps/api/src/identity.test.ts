// @vitest-environment node
import { dbTestsEnabled } from '../../../test/db-env';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { prisma } from '@grace-abounds/database';
import { buildApp } from './app.js';
import {
  createSession,
  createUser,
  resetIdentityTables,
} from '../../../test/db-reset';

const key = () => new TextEncoder().encode(process.env.API_ASSERTION_SECRET!);

async function assertion(
  claims: { sub: string; sid: string; sv: number },
  options: { key?: Uint8Array; expiresIn?: string; audience?: string } = {},
) {
  return new SignJWT({ sid: claims.sid, sv: claims.sv })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer('grace-web')
    .setAudience(options.audience ?? 'grace-api')
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '60s')
    .sign(options.key ?? key());
}

describe.skipIf(!dbTestsEnabled)(
  'API identity and permissions (PostgreSQL)',
  () => {
    const app = buildApp();
    beforeAll(() => app.ready());
    beforeEach(resetIdentityTables);
    afterAll(async () => {
      await app.close();
      await prisma.$disconnect();
    });

    async function signedIn(
      role: 'MEMBER' | 'ADMIN' | 'PASTOR' = 'MEMBER',
      authenticatedAt?: Date,
    ) {
      const user = await createUser({ role });
      const session = await createSession(user.id, { authenticatedAt });
      const token = await assertion({ sub: user.id, sid: session.id, sv: 1 });
      return { user, session, headers: { authorization: `Bearer ${token}` } };
    }
    const call = (method: string, url: string, headers = {}, body?: unknown) =>
      app.inject({
        method: method as never,
        url,
        headers,
        ...(body !== undefined && { payload: body as never }),
      });

    it('returns the signed-in profile', async () => {
      const { user, headers } = await signedIn();
      const response = await call('GET', '/v1/me', headers);
      expect(response.statusCode).toBe(200);
      expect(response.json().data.id).toBe(user.id);
    });

    it('rejects missing, forged, expired and mis-addressed assertions', async () => {
      const { user, session } = await signedIn();
      expect((await call('GET', '/v1/me')).statusCode).toBe(401);
      const forged = await assertion(
        { sub: user.id, sid: session.id, sv: 1 },
        {
          key: new TextEncoder().encode(
            'a-different-secret-that-is-long-enough-123',
          ),
        },
      );
      expect(
        (await call('GET', '/v1/me', { authorization: `Bearer ${forged}` }))
          .statusCode,
      ).toBe(401);
      const expired = await assertion(
        { sub: user.id, sid: session.id, sv: 1 },
        { expiresIn: '-1s' },
      );
      expect(
        (await call('GET', '/v1/me', { authorization: `Bearer ${expired}` }))
          .statusCode,
      ).toBe(401);
      const wrongAudience = await assertion(
        { sub: user.id, sid: session.id, sv: 1 },
        { audience: 'other' },
      );
      expect(
        (
          await call('GET', '/v1/me', {
            authorization: `Bearer ${wrongAudience}`,
          })
        ).statusCode,
      ).toBe(401);
    });

    it('rejects a valid signature with someone else’s session id (guessed ids)', async () => {
      const victim = await signedIn();
      const attacker = await createUser();
      const token = await assertion({
        sub: attacker.id,
        sid: victim.session.id,
        sv: 1,
      });
      expect(
        (await call('GET', '/v1/me', { authorization: `Bearer ${token}` }))
          .statusCode,
      ).toBe(401);
    });

    it('cannot revoke another member’s session', async () => {
      const victim = await signedIn();
      const attacker = await signedIn();
      const response = await call(
        'DELETE',
        `/v1/me/sessions/${victim.session.id}`,
        attacker.headers,
      );
      expect(response.statusCode).toBe(404);
      expect((await call('GET', '/v1/me', victim.headers)).statusCode).toBe(
        200,
      );
    });

    it('revokes a session immediately', async () => {
      const { session, headers } = await signedIn();
      const second = await createSession(session.userId);
      const secondHeaders = {
        authorization: `Bearer ${await assertion({ sub: session.userId, sid: second.id, sv: 1 })}`,
      };
      const list = await call('GET', '/v1/me/sessions', headers);
      expect(list.json().data).toHaveLength(2);
      expect(
        (
          await call('POST', '/v1/me/sessions/revoke-others', headers, {})
        ).json().data.revoked,
      ).toBe(1);
      expect((await call('GET', '/v1/me', secondHeaders)).statusCode).toBe(401);
      expect((await call('GET', '/v1/me', headers)).statusCode).toBe(200);
    });

    it('keeps Members and Admins out of Pastor routes', async () => {
      const target = await createUser();
      for (const role of ['MEMBER', 'ADMIN'] as const) {
        const { headers } = await signedIn(role);
        const response = await call(
          'PATCH',
          `/v1/pastor/members/${target.id}/role`,
          { ...headers, 'if-match': '"1"' },
          { role: 'PASTOR' },
        );
        expect(response.statusCode).toBe(403);
      }
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: target.id } }))
          .role,
      ).toBe('MEMBER');
    });

    it('suspension ends the member’s access on the next request', async () => {
      const pastor = await signedIn('PASTOR');
      const member = await signedIn();
      expect((await call('GET', '/v1/me', member.headers)).statusCode).toBe(
        200,
      );
      const response = await call(
        'PATCH',
        `/v1/pastor/members/${member.user.id}/status`,
        { ...pastor.headers, 'if-match': '"1"' },
        { status: 'SUSPENDED' },
      );
      expect(response.statusCode).toBe(200);
      expect((await call('GET', '/v1/me', member.headers)).statusCode).toBe(
        403,
      );
      const audit = await prisma.auditEvent.findFirst({
        where: { action: 'member.suspended' },
      });
      expect(audit?.actorId).toBe(pastor.user.id);
    });

    it('two Pastors demoting each other at once leaves one Pastor', async () => {
      const a = await signedIn('PASTOR');
      const b = await signedIn('PASTOR');
      const demote = (actor: typeof a, target: typeof b) =>
        call(
          'PATCH',
          `/v1/pastor/members/${target.user.id}/role`,
          { ...actor.headers, 'if-match': '"1"' },
          { role: 'MEMBER' },
        );
      const [first, second] = await Promise.all([demote(a, b), demote(b, a)]);
      expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
      expect(
        await prisma.user.count({
          where: { role: 'PASTOR', status: 'ACTIVE' },
        }),
      ).toBe(1);
    });

    it('rejects a stale role change', async () => {
      const pastor = await signedIn('PASTOR');
      const member = await createUser();
      const response = await call(
        'PATCH',
        `/v1/pastor/members/${member.id}/role`,
        { ...pastor.headers, 'if-match': '"7"' },
        { role: 'ADMIN' },
      );
      expect(response.statusCode).toBe(412);
    });

    it('requires recent authentication to remove a sign-in method', async () => {
      const stale = await signedIn(
        'MEMBER',
        new Date(Date.now() - 60 * 60 * 1000),
      );
      await prisma.account.create({
        data: {
          userId: stale.user.id,
          type: 'oidc',
          provider: 'google',
          providerAccountId: 'g-1',
        },
      });
      const response = await call('DELETE', '/v1/me/google', stale.headers);
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('REAUTH_REQUIRED');
      const fresh = await signedIn();
      await prisma.account.create({
        data: {
          userId: fresh.user.id,
          type: 'oidc',
          provider: 'google',
          providerAccountId: 'g-2',
        },
      });
      expect(
        (await call('DELETE', '/v1/me/google', fresh.headers)).statusCode,
      ).toBe(204);
    });

    it('never returns credentials in the security summary', async () => {
      const { user, headers } = await signedIn();
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: 'argon2-hash-value' },
      });
      const response = await call('GET', '/v1/me/security', headers);
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('argon2-hash-value');
      expect(response.json().data.hasPassword).toBe(true);
    });
  },
);
