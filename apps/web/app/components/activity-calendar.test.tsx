import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankActivity, nzNow, type StaffActivity } from '../lib/activities';
import { ActivityCalendar } from './activity-ui';

/*
 * Phase 3A: one calendar, one editor. Staff create and edit activities from
 * the Home calendar and its list (explicit Save, with the version they
 * loaded); members only read published activities.
 */

const today = nzNow().date;

/** The month as a list, including days earlier this month. */
function showList() {
  fireEvent.click(screen.getByRole('button', { name: 'List view' }));
  const earlier = screen.queryByRole('button', {
    name: /^Show earlier this month/,
  });
  if (earlier) fireEvent.click(earlier);
}
const state = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: state.role, email: 'x@y.z' } } }),
}));
vi.mock('./toast', () => ({ useToast: () => ({ push: vi.fn() }) }));

const live: StaffActivity = {
  ...blankActivity('service'),
  id: 'svc',
  slug: 'sunday-service',
  title: 'Sunday Service',
  status: 'published',
  locationId: 'manukau',
  schedule: {
    repeat: 'weekly',
    date: '2026-01-04',
    until: '',
    days: [0, 1, 2, 3, 4, 5, 6],
    monthWeek: 1,
    monthDay: 0,
    startTime: '10:00',
    endTime: '11:30',
  },
  version: 4,
  updatedAt: '2026-11-01T00:00:00.000Z',
};
const draft: StaffActivity = {
  ...blankActivity('event'),
  id: 'draft-1',
  slug: 'planning-night',
  title: 'Planning night',
  status: 'draft',
  schedule: {
    repeat: 'once',
    date: today,
    until: '',
    days: [],
    monthWeek: 1,
    monthDay: 0,
    startTime: '19:00',
    endTime: '20:30',
  },
  version: 1,
  updatedAt: '2026-11-01T00:00:00.000Z',
};
vi.mock('./content-provider', () => ({
  useContent: () => ({
    content: {
      activities: [live],
      activityExceptions: [],
      participations: [],
      serviceAssignments: [],
      users: [],
      pages: { locations: [{ id: 'manukau', name: 'Manukau' }] },
    },
  }),
}));

type Call = {
  method: string;
  url: string;
  ifMatch: string | null;
  body?: Record<string, unknown>;
};
let calls: Call[] = [];
const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );

beforeEach(() => {
  state.role = 'admin';
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({
        method,
        url,
        ifMatch: new Headers(init?.headers).get('if-match'),
        body,
      });
      if (url.endsWith('/roster')) return json(200, { data: [] });
      if (url === '/api/v1/public/availability') return json(200, { data: {} });
      if (url === '/api/v1/staff/calendar-sync')
        return json(200, { data: { configured: false, items: [] } });
      if (url === '/api/v1/staff/activities' && method === 'GET')
        return json(200, {
          data: { activities: [live, draft], exceptions: [] },
        });
      if (url === '/api/v1/staff/activities' && method === 'POST')
        return json(201, {
          data: { ...draft, ...body, id: 'new', status: 'draft', version: 1 },
        });
      if (url.includes('/exceptions/'))
        return json(200, {
          data: { ...live, version: live.version + 1 },
          exceptions: [
            {
              id: 'x',
              activityId: live.id,
              date: url.split('/').pop(),
              kind: 'cancelled',
              note: body?.note ?? '',
              startTime: '',
              endTime: '',
              venue: '',
            },
          ],
        });
      return json(200, {
        data: { ...draft, ...body, version: draft.version + 1 },
      });
    }),
  );
});

const writes = () => calls.filter((call) => call.method !== 'GET');

describe('Home calendar for staff', () => {
  it('creates an activity only on Save', async () => {
    render(<ActivityCalendar member />);
    const create = await screen.findByRole('button', {
      name: /Create activity/,
    });
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);
    const panel = screen.getByRole('dialog', { name: 'Create activity' });
    fireEvent.change(within(panel).getByLabelText('Title'), {
      target: { value: 'Community lunch' },
    });
    expect(writes()).toEqual([]);
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    });
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      method: 'POST',
      url: '/api/v1/staff/activities',
      body: { title: 'Community lunch', status: 'draft', kind: 'event' },
    });
  });

  it('lists drafts for staff and edits with the loaded version', async () => {
    render(<ActivityCalendar member />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Create activity/ }),
      ).toBeEnabled(),
    );
    showList();
    expect(screen.getAllByText('Planning night').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Planning night' }),
    );
    const panel = screen.getByRole('dialog', { name: 'Edit activity' });
    fireEvent.change(within(panel).getByLabelText('Title'), {
      target: { value: 'Planning evening' },
    });
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    });
    await waitFor(() =>
      expect(writes()[0]).toMatchObject({
        method: 'PATCH',
        url: '/api/v1/staff/activities/draft-1',
        ifMatch: '"1"',
        body: { title: 'Planning evening' },
      }),
    );
  });

  it('cancels one date as its own action, with the activity version', async () => {
    render(<ActivityCalendar member />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Create activity/ }),
      ).toBeEnabled(),
    );
    showList();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Edit Sunday Service' })[0]!,
    );
    const panel = screen.getByRole('dialog', { name: 'Edit activity' });
    const dates = within(panel).getByRole('region', { name: 'Upcoming dates' });
    fireEvent.click(
      within(dates).getAllByRole('button', { name: 'Cancel date' })[0]!,
    );
    fireEvent.change(
      within(dates).getByLabelText('Note for people (optional)'),
      {
        target: { value: 'Combined service' },
      },
    );
    await act(async () => {
      fireEvent.click(
        within(dates).getByRole('button', {
          name: /^Cancel (Mon|Tue|Wed|Thu|Fri|Sat|Sun)/,
        }),
      );
    });
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      method: 'PUT',
      ifMatch: '"4"',
      body: { kind: 'cancelled', note: 'Combined service' },
    });
    expect(writes()[0]!.url).toMatch(
      /^\/api\/v1\/staff\/activities\/svc\/exceptions\/\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe('Home calendar for members', () => {
  it('shows published activities only, with no editing', async () => {
    state.role = 'member';
    render(<ActivityCalendar member />);
    showList();
    expect(screen.getAllByText('Sunday Service').length).toBeGreaterThan(0);
    expect(screen.queryByText('Planning night')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Create activity/ }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
    expect(calls).toEqual([]);
  });

  it('opens a day card beside the date and closes it with Escape', () => {
    state.role = 'member';
    render(<ActivityCalendar member />);
    const sunday = screen.getAllByRole('button', { name: /^Sun, \d+ / })[0]!;
    fireEvent.click(sunday);
    const card = screen.getByRole('dialog', { name: /Sun/ });
    expect(within(card).getByText('Sunday Service')).toBeInTheDocument();
    expect(sunday).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sunday).toHaveFocus();
  });
});
