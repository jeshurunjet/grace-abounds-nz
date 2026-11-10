/**
 * Integration tests that touch PostgreSQL run only with RUN_DB_TESTS=1 and a
 * TEST_DATABASE_URL whose database name ends in _test (they delete identity
 * rows). Import this first in such test files, before anything that loads
 * the Prisma client, so the client connects to the test database.
 */
const url = process.env.TEST_DATABASE_URL;
let isTestDatabase = false;
try {
  isTestDatabase =
    !!url && new URL(url).pathname.replace(/^\//, '').endsWith('_test');
} catch {
  isTestDatabase = false;
}
export const dbTestsEnabled =
  process.env.RUN_DB_TESTS === '1' && isTestDatabase;
if (dbTestsEnabled) process.env.DATABASE_URL = url;

process.env.AUTH_SECRET ??= 'test-only-auth-secret-0123456789abcdef';
process.env.AUTH_CHALLENGE_SECRET ??= 'test-only-challenge-secret-0123456789ab';
process.env.API_ASSERTION_SECRET ??= 'test-only-assertion-secret-0123456789';
process.env.AUTH_URL ??= 'http://localhost:3000';
