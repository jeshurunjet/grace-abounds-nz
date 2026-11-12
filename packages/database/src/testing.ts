/** Test-only helpers (never imported by application code). */
import { prisma } from './index.ts';
import { dbTestsEnabled } from './test-env.ts';

/** Empties identity tables in the _test database only. */
export async function resetIdentityTables() {
  if (!dbTestsEnabled)
    throw new Error('Refusing to reset: not the test database.');
  await prisma.$executeRawUnsafe(
    'TRUNCATE "ContentRevision","PageContent","SiteSettings","AuditEvent","AuthAttempt","AuthChallenge","UserSession","Authenticator","Account","VerificationToken","User" CASCADE',
  );
}

let counter = 0;
export async function createUser(
  data: {
    role?: 'MEMBER' | 'ADMIN' | 'PASTOR';
    status?: 'ACTIVE' | 'SUSPENDED';
  } = {},
) {
  counter += 1;
  return prisma.user.create({
    data: {
      email: `person${counter}-${Date.now()}@example.test`,
      emailVerified: new Date(),
      role: data.role ?? 'MEMBER',
      status: data.status ?? 'ACTIVE',
    },
  });
}

export async function createSession(
  userId: string,
  overrides: {
    authenticatedAt?: Date;
    expiresAt?: Date;
    revokedAt?: Date;
  } = {},
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return prisma.userSession.create({
    data: {
      userId,
      sessionVersion: user.sessionVersion,
      method: 'password',
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 86_400_000),
      authenticatedAt: overrides.authenticatedAt ?? new Date(),
      revokedAt: overrides.revokedAt ?? null,
    },
  });
}
