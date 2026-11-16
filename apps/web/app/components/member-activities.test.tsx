import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemberPlan } from '@grace-abounds/validation';
import { JoinActivities, MyPlans } from './member-activities';
import { ToastProvider } from './toast';
import { resetParticipationStore } from '../lib/participation';

/*
 * Phase 3B: joining and booking go to the server; the page shows what the
 * server says (its plans and its counts), including when it refuses.
 */

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'member-1', email: 'member@example.org' } },
  }),
}));

const server = vi.hoisted(() => ({
  plans: [] as MemberPlan[],
  counts: {} as Record<string, Record<string, number>>,
  refuse: '',
  requests: [] as { method: string; url: string; body: unknown }[],
}));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const plan = (over: Partial<MemberPlan>): MemberPlan => ({
  id: 'p1',
  activityId: 'study-foundations',
  date: '',
  createdAt: '2026-11-16T00:00:00.000Z',
  activity: { title: 'Foundations Class', slug: 'foundations', kind: 'study' },
  available: true,
  dateCancelled: false,
  ...over,
});

beforeEach(() => {
  resetParticipationStore();
  server.plans = [];
  server.counts = {};
  server.refuse = '';
  server.requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      server.requests.push({ method, url, body });
      if (url === '/api/v1/public/availability')
        return json({ data: server.counts });
      if (url === '/api/v1/member/participations' && method === 'GET')
        return json({ data: server.plans });
      if (url === '/api/v1/member/participations' && method === 'POST') {
        if (server.refuse)
          return json({ error: { code: 'FULL', message: server.refuse } }, 409);
        const created = plan({ activityId: body.activityId, date: body.date });
        server.plans = [...server.plans, created];
        return json({ data: created }, 201);
      }
      if (method === 'DELETE') {
        server.plans = server.plans.filter((item) => !url.endsWith(item.id));
        return new Response(null, { status: 204 });
      }
      return json({ error: { code: 'NOT_FOUND', message: 'No' } }, 404);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const card = () =>
  document.getElementById('activity-study-foundations') as HTMLElement;

describe('joining and booking with the server', () => {
  it('joining sends the request and shows the server’s answer', async () => {
    render(
      <ToastProvider>
        <JoinActivities focus="study-foundations" />
      </ToastProvider>,
    );
    const join = within(card()).getByRole('button', { name: 'Join' });
    await waitFor(() => expect(join).toBeEnabled());
    await act(async () => {
      fireEvent.click(join);
    });
    expect(
      server.requests.find((item) => item.method === 'POST')?.body,
    ).toEqual({ activityId: 'study-foundations', date: '' });
    expect(
      await within(card()).findByText('You’re in this group'),
    ).toBeInTheDocument();
  });

  it('a refusal is shown and nothing is marked as joined', async () => {
    server.refuse = 'Sorry, this group is full.';
    render(
      <ToastProvider>
        <JoinActivities focus="study-foundations" />
      </ToastProvider>,
    );
    const join = within(card()).getByRole('button', { name: 'Join' });
    await waitFor(() => expect(join).toBeEnabled());
    await act(async () => {
      fireEvent.click(join);
    });
    expect(
      await screen.findByText('Sorry, this group is full.'),
    ).toBeInTheDocument();
    expect(within(card()).queryByText('You’re in this group')).toBeNull();
  });

  it('places left come from the server’s counts', async () => {
    server.counts = { 'study-foundations': { '': 30 } };
    render(<JoinActivities focus="study-foundations" />);
    expect(
      await within(card()).findByRole('button', { name: 'Full' }),
    ).toBeInTheDocument();
    expect(within(card()).getByRole('button', { name: 'Full' })).toBeDisabled();
  });

  it('My plans lists the server’s plans and cancels through it', async () => {
    server.plans = [
      plan({}),
      plan({
        id: 'p2',
        activityId: 'gone',
        activity: { title: 'Old Retreat', slug: 'old', kind: 'event' },
        available: false,
      }),
    ];
    render(<MyPlans />);
    expect(await screen.findByText('Foundations Class')).toBeInTheDocument();
    // No longer published: still listed so it can be cancelled.
    expect(screen.getByText('Old Retreat')).toBeInTheDocument();
    expect(screen.getByText('No longer running')).toBeInTheDocument();
    const leave = screen.getAllByRole('button', { name: 'Leave' })[0]!;
    await act(async () => {
      fireEvent.click(leave);
    });
    expect(
      server.requests.some(
        (item) =>
          item.method === 'DELETE' &&
          item.url === '/api/v1/member/participations/p1',
      ),
    ).toBe(true);
    await waitFor(() =>
      expect(screen.queryByText('Foundations Class')).toBeNull(),
    );
  });
});
