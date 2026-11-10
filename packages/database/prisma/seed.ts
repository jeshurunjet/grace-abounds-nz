/**
 * Development seed. Only runs against an empty database; never overwrites
 * real data. Creates the three development staff/member accounts so you can
 * sign in with an email code printed to the console.
 */
import { prisma, Role } from '../src/index.ts';

if (process.env.NODE_ENV === 'production') {
  console.error('The development seed never runs in production.');
  process.exit(1);
}
if ((await prisma.user.count()) > 0) {
  console.log('Database already has users; seed skipped.');
  process.exit(0);
}
await prisma.user.createMany({
  data: [
    {
      email: 'pastor@example.org',
      name: 'Pastor Bartolome R. Sanchez',
      role: Role.PASTOR,
    },
    { email: 'admin@example.org', name: 'Maria Santos', role: Role.ADMIN },
    { email: 'member@example.org', name: 'Michael Tane', role: Role.MEMBER },
  ],
});
console.log(
  'Seeded development accounts: pastor@, admin@, member@example.org.',
);
await prisma.$disconnect();
