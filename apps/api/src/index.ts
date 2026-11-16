import { buildApp } from './app.js';
import { startOutboxDispatcher } from './lib/outbox.js';
import { startCalendarSync } from './lib/calendar-sync.js';

const port = Number(process.env.API_PORT ?? 4000);
const app = buildApp();

try {
  await app.listen({ host: '0.0.0.0', port });
  // Delivers content-change events (cache invalidation) after commit.
  startOutboxDispatcher(app.log);
  // Sends public activities to the church Google Calendar when configured.
  startCalendarSync(app.log);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
