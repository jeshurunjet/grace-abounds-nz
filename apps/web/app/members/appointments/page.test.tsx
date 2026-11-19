import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APPOINTMENT_PRIVACY_NOTE } from '@grace-abounds/validation';
import AppointmentsPage from './page';

/*
 * Phase 4B: the member appointments page shows the privacy and retention
 * wording before asking; a request's key is tied to its exact details
 * (same details reuse it, edited details get a new one, a conflict keeps
 * the draft); actions send the version shown and cancelling asks first; it
 * follows the address for the appointment to show; and everything belongs
 * to the signed-in person: a switch clears it and late answers are ignored.
 */

vi.mock('../../components/member-shell', () => ({
  MemberShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const route = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(route.search),
}));
const session = vi.hoisted(() => ({ id: 'anna' as string | undefined }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: session.id ? { user: { id: session.id } } : null,
  }),
}));

type Body = Record<string, string>;
const server = vi.hoisted(() => ({
  handler: null as unknown as (
    url: string,
    init?: RequestInit,
  ) => Promise<Response> | Response,
  posts: [] as Body[],
  writes: [] as { url: string; ifMatch: string | null }[],
}));
const appointment = (
  id: string,
  topic: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  topic,
  reason: '',
  status: 'requested',
  preferredDate: '',
  preferredTime: 'any',
  startsAt: '',
  endsAt: '',
  location: '',
  version: 1,
  createdAt: '2026-11-19T01:00:00.000Z',
  closedAt: '',
  deleteAfter: '',
  history: [
    {
      status: 'requested',
      at: '2026-11-19T01:00:00.000Z',
      startsAt: '',
      endsAt: '',
    },
  ],
  ...extra,
});
const ok = (data: unknown, status = 200) => Response.json({ data }, { status });
const refuse = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });
function later() {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => (release = resolve));
  return { promise, release };
}

beforeEach(() => {
  session.id = 'anna';
  route.search = '';
  server.posts = [];
  server.writes = [];
  let mine: ReturnType<typeof appointment>[] = [];
  server.handler = (url, init) => {
    if (init?.method === 'POST' && url.endsWith('/member/appointments')) {
      const body = JSON.parse(String(init.body));
      server.posts.push(body);
      const created = appointment(`a${server.posts.length}`, body.topic, {
        reason: body.reason,
      });
      mine = [created, ...mine];
      return ok(created, 201);
    }
    return ok(mine);
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => server.handler(url, init)),
  );
});
afterEach(() => vi.unstubAllGlobals());

const settle = () =>
  act(async () => {
    for (let turn = 0; turn < 5; turn++)
      await new Promise((resolve) => setTimeout(resolve, 0));
  });
const choose = (topic: string) =>
  fireEvent.change(screen.getByLabelText('Topic'), {
    target: { value: topic },
  });
const write = (value: string) =>
  fireEvent.change(screen.getByLabelText('Message (optional)'), {
    target: { value },
  });
const send = async () => {
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Ask for an appointment' }),
    );
  });
  await settle();
};

describe('member appointments page', () => {
  it('shows who can see it and for how long, before asking', async () => {
    render(<AppointmentsPage />);
    await settle();
    expect(screen.getByText(APPOINTMENT_PRIVACY_NOTE)).toBeInTheDocument();
    expect(
      screen.getByText('You haven’t asked for an appointment yet.'),
    ).toBeInTheDocument();
    const button = screen.getByRole('button', {
      name: 'Ask for an appointment',
    });
    expect(button).toBeDisabled();
    choose('Prayer');
    expect(button).toBeEnabled();
  });

  it('same details reuse the key; edited details after a failure get a new one', async () => {
    const normal = server.handler;
    let failures = 2;
    server.handler = (url, init) => {
      if (init?.method === 'POST' && failures-- > 0) {
        server.posts.push(JSON.parse(String(init.body)));
        return refuse(503, 'NETWORK', 'Couldn’t reach the server.');
      }
      return normal(url, init);
    };
    render(<AppointmentsPage />);
    await settle();
    choose('Prayer');
    write('About my family');
    await send();
    await send();
    expect(server.posts[1]!.clientKey).toBe(server.posts[0]!.clientKey);
    expect(screen.getByLabelText('Message (optional)')).toHaveValue(
      'About my family',
    );

    write('About my family and work');
    await send();
    expect(server.posts[2]!.clientKey).not.toBe(server.posts[0]!.clientKey);
    expect(server.posts[2]).toMatchObject({
      topic: 'Prayer',
      reason: 'About my family and work',
      preferredDate: '',
      preferredTime: 'any',
    });
    expect(screen.getByLabelText('Message (optional)')).toHaveValue('');
    expect(screen.getByText('About my family and work')).toBeInTheDocument();
  });

  it('a key conflict keeps the draft, and the next send is a new request', async () => {
    const normal = server.handler;
    let conflicted = false;
    server.handler = (url, init) => {
      if (init?.method === 'POST' && !conflicted) {
        conflicted = true;
        server.posts.push(JSON.parse(String(init.body)));
        return refuse(409, 'IDEMPOTENCY_CONFLICT', 'Different details.');
      }
      return normal(url, init);
    };
    render(<AppointmentsPage />);
    await settle();
    choose('Baptism');
    write('Words');
    await send();
    expect(screen.getByLabelText('Message (optional)')).toHaveValue('Words');
    await send();
    expect(server.posts[1]!.clientKey).not.toBe(server.posts[0]!.clientKey);
  });

  it('a different sign-in clears everything; late answers for the previous person are ignored', async () => {
    const annaList = later();
    server.handler = () => annaList.promise;
    const view = render(<AppointmentsPage />);
    await settle();
    choose('Prayer');
    write('Anna’s private words');

    session.id = 'ben';
    server.handler = () => ok([appointment('b1', 'Something else')]);
    view.rerender(<AppointmentsPage />);
    await settle();
    expect(screen.getByLabelText('Message (optional)')).toHaveValue('');
    expect(screen.getByLabelText('Topic')).toHaveValue('');
    expect(
      screen.getByRole('heading', { name: 'Something else' }),
    ).toBeInTheDocument();

    annaList.release(ok([appointment('a1', 'Marriage and family')]));
    await settle();
    expect(
      screen.queryByRole('heading', { name: 'Marriage and family' }),
    ).toBeNull();
  });

  it('accepts a suggested time with the version shown; cancelling asks first', async () => {
    let list = [
      appointment('a1', 'Prayer', {
        status: 'proposed',
        startsAt: '2026-11-24T21:00:00.000Z',
        endsAt: '2026-11-24T21:30:00.000Z',
        location: 'Church office',
        version: 4,
      }),
    ];
    server.handler = (url, init) => {
      if (init?.method === 'POST') {
        server.writes.push({
          url,
          ifMatch: new Headers(init.headers).get('if-match'),
        });
        list = list.map((item) => ({
          ...item,
          status: url.endsWith('/accept') ? 'confirmed' : 'cancelled',
          version: item.version + 1,
        }));
        return ok(list[0]);
      }
      return ok(list);
    };
    render(<AppointmentsPage />);
    await settle();
    expect(screen.getByText(/Suggested time:/)).toBeInTheDocument();
    expect(screen.getByText(/Church office/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Accept this time' }));
    });
    await settle();
    expect(server.writes[0]).toEqual({
      url: '/api/v1/member/appointments/a1/accept',
      ifMatch: '"4"',
    });
    expect(
      screen.queryByRole('button', { name: 'Accept this time' }),
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel appointment' }));
    expect(server.writes).toHaveLength(1);
    const ask = () =>
      screen.getByRole('alertdialog', { name: 'Cancel this appointment?' });
    expect(ask()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(server.writes).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel appointment' }));
    await act(async () => {
      fireEvent.click(
        within(ask()).getByRole('button', { name: 'Cancel appointment' }),
      );
    });
    await settle();
    expect(server.writes[1]).toEqual({
      url: '/api/v1/member/appointments/a1/cancel',
      ifMatch: '"5"',
    });
  });

  it('follows the address, including a second notification on the same page', async () => {
    server.handler = () =>
      ok([appointment('a', 'Prayer'), appointment('b', 'Baptism')]);
    route.search = 'appointment=a';
    const view = render(<AppointmentsPage />);
    await settle();
    const card = (topic: string) =>
      screen.getByRole('heading', { name: topic }).closest('article')!;
    expect(card('Prayer')).toHaveAttribute('aria-current', 'true');
    route.search = 'appointment=b';
    view.rerender(<AppointmentsPage />);
    expect(card('Baptism')).toHaveAttribute('aria-current', 'true');
    expect(card('Prayer')).not.toHaveAttribute('aria-current');
    route.search = 'appointment=gone';
    view.rerender(<AppointmentsPage />);
    expect(
      screen.getByText('That appointment isn’t available any more.'),
    ).toBeInTheDocument();
  });
});
