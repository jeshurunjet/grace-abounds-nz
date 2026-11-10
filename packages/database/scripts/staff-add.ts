/**
 * Operator command: create or update a fixed Pastor/Admin account.
 *
 *   pnpm --filter @grace-abounds/database staff:add \
 *     --email pastor@example.org --name "Pastor Name" --role pastor
 *
 * The person then signs in with an email code (which verifies the address),
 * and can add a password, Google or a passkey in Settings.
 * Refuses to demote the last active Pastor.
 */
import { parseArgs } from 'node:util';
import {
  assertPastorRemains,
  LastPastorError,
  lockPastorSet,
  normalizeEmail,
  prisma,
  recordAudit,
  Role,
} from '../src/index.ts';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string' },
  },
});

const email = values.email ? normalizeEmail(values.email) : '';
const role = values.role?.toUpperCase();
if (
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  (role !== 'PASTOR' && role !== 'ADMIN')
) {
  console.error(
    'Usage: staff:add -- --email <email> --role pastor|admin [--name "Full Name"]',
  );
  process.exit(1);
}

let user;
try {
  user = await prisma.$transaction(async (tx) => {
    // Same lock as the API's role/status routes: concurrent changes cannot
    // both remove the last active Pastor.
    await lockPastorSet(tx);
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing)
      await assertPastorRemains(tx, existing.id, {
        role: role as Role,
        status: 'ACTIVE',
      });
    const saved = await tx.user.upsert({
      where: { email },
      create: { email, name: values.name ?? null, role: role as Role },
      update: {
        role: role as Role,
        status: 'ACTIVE',
        ...(values.name && { name: values.name }),
        version: { increment: 1 },
      },
    });
    await recordAudit(tx, {
      actorId: null,
      action: existing ? 'staff.role_set' : 'staff.created',
      entityType: 'User',
      entityId: saved.id,
      metadata: {
        role,
        previousRole: existing?.role ?? null,
        previousStatus: existing?.status ?? null,
        via: 'staff:add',
      },
    });
    return saved;
  });
} catch (error) {
  if (error instanceof LastPastorError) {
    console.error('Refusing to demote the last active Pastor.');
    await prisma.$disconnect();
    process.exit(1);
  }
  throw error;
}
console.log(`${user.role} account ready for ${user.email} (id ${user.id}).`);
await prisma.$disconnect();
