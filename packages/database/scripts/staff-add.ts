/**
 * Operator command: create or update a fixed Pastor/Admin account.
 *
 *   pnpm --filter @grace-abounds/database staff:add -- \
 *     --email pastor@example.org --name "Pastor Name" --role pastor
 *
 * The person then signs in with an email code or Google using that email.
 * Refuses to demote the last active Pastor.
 */
import { parseArgs } from 'node:util';
import { normalizeEmail, prisma, recordAudit, Role } from '../src/index.ts';

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

const existing = await prisma.user.findUnique({ where: { email } });
if (existing?.role === Role.PASTOR && role !== Role.PASTOR) {
  const pastors = await prisma.user.count({
    where: { role: Role.PASTOR, status: 'ACTIVE' },
  });
  if (pastors <= 1) {
    console.error('Refusing to demote the last active Pastor.');
    process.exit(1);
  }
}

const user = await prisma.$transaction(async (tx) => {
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
    metadata: { role, previousRole: existing?.role ?? null, via: 'staff:add' },
  });
  return saved;
});

console.log(`${user.role} account ready for ${user.email} (id ${user.id}).`);
await prisma.$disconnect();
