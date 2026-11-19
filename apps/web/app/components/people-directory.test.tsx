import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeopleDirectory } from './people-directory';

/*
 * Phase 4C: People shows real accounts from the server, searched and
 * filtered there. Suspend/reactivate is explicit and confirmed, sends the
 * version shown, and changes the screen only after the server agrees; a
 * conflict reloads and a failure leaves the shown state alone. Staff
 * accounts offer no actions. Admin never sees prayer counts. Only the
 * newest search and detail answers are used, and a different identity,
 * role or sign-out starts fresh, ignoring late answers. Filters follow the
 * address (Home counts link to them). Suspending needs a recent sign-in:
 * "Confirm it's you" retries the change only once the server accepts it.
 */

const route = vi.hoisted(() => ({ search: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(route.search),
  usePathname: () => '/admin/users',
  useRouter: () => ({ replace: route.replace }),
}));
const session = vi.hoisted(() => ({
  id: 'staff' as string | undefined,
  role: 'pastor',
}));
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: session.id ? { user: { id: session.id, role: session.role } } : null,
  }),
}));
const toast = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('./toast', () => ({ useToast: () => ({ push: toast.push }) }));

type Row = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  manageable: boolean;
  createdAt: string;
  version: number;
};
const person = (id: string, name: string, extra: Partial<Row> = {}): Row => ({
  id,
  name,
  email: `${name.split(' ')[0]!.toLowerCase()}@example.org`,
  role: 'member',
  status: 'active',
  manageable: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  version: 1,
  ...extra,
});
const counts = {
  requested: 2,
  proposed: 0,
  confirmed: 1,
  completed: 0,
  cancelled: 0,
  declined: 0,
};
const server = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  lists: [] as string[],
  held: {} as Record<string, Promise<Response>>,
  heldList: null as Promise<Response> | null,
  heldWrite: null as Promise<Response> | null,
  writes: [] as { url: string; ifMatch: string | null; body: unknown }[],
  detailReads: [] as string[],
  fail: '' as '' | 'conflict' | 'error',
  recent: true,
  password: 'right-password',
  heldReauth: null as Promise<Response> | null,
  reauths: [] as Record<string, unknown>[],
}));
/** What the server would send this role (the asker's, by default). */
const detail = (row: Record<string, unknown>, role = session.role) => ({
  ...row,
  phone: '',
  emailVerified: true,
  appointments: counts,
  ...(role === 'pastor' && {
    prayers: { submitted: 3, praying: 1, prayedFor: 4 },
  }),
});
function later() {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => (release = resolve));
  return { promise, release };
}
const json = (data: unknown, status = 200) => Response.json(data, { status });

beforeEach(() => {
  session.id = 'staff';
  session.role = 'pastor';
  route.search = '';
  route.replace.mockClear();
  toast.push.mockClear();
  server.rows = [
    person('m1', 'Anna Member'),
    person('m2', 'Ben Member', { status: 'suspended', version: 4 }),
    person('s1', 'Admin Example', { role: 'admin', manageable: false }),
  ];
  server.lists = [];
  server.held = {};
  server.heldList = null;
  server.heldWrite = null;
  server.writes = [];
  server.detailReads = [];
  server.fail = '';
  server.recent = true;
  server.heldReauth = null;
  server.reauths = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const asker = session.role;
      if (url === '/api/account/reauth') {
        const body = JSON.parse(String(init?.body));
        server.reauths.push(body);
        if (server.heldReauth) await server.heldReauth;
        if (body.password !== server.password)
          return json(
            {
              error: {
                code: 'INVALID_PASSWORD',
                message: 'That password is not correct.',
              },
            },
            400,
          );
        server.recent = true;
        return json({ data: { status: 'ok' } });
      }
      if (url === '/api/v1/me/security')
        return json({
          data: { email: 'staff@example.org', hasPassword: true },
        });
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        server.writes.push({
          url,
          ifMatch: new Headers(init.headers).get('if-match'),
          body,
        });
        if (server.heldWrite) await server.heldWrite;
        if (!server.recent)
          return json(
            {
              error: {
                code: 'REAUTH_REQUIRED',
                message: 'For your security, confirm it’s you first.',
              },
            },
            403,
          );
        if (server.fail === 'conflict')
          return json(
            { error: { code: 'VERSION_CONFLICT', message: 'Changed.' } },
            412,
          );
        if (server.fail === 'error')
          return json(
            { error: { code: 'SERVER', message: 'Something went wrong.' } },
            500,
          );
        const id = url.split('/').at(-2)!;
        server.rows = server.rows.map((row) =>
          row.id === id
            ? {
                ...row,
                status: body.status,
                version: (row.version as number) + 1,
              }
            : row,
        );
        return json({
          data: detail(
            server.rows.find((row) => row.id === id)!,
            asker,
          ),
        });
      }
      const one = url.match(/\/staff\/members\/(\w+)$/);
      if (one) {
        server.detailReads.push(one[1]!);
        if (server.held[one[1]!]) return server.held[one[1]!]!;
        return json({
          data: detail(server.rows.find((row) => row.id === one[1])!),
        });
      }
      server.lists.push(url);
      if (server.heldList) return server.heldList;
      const params = new URL(url, 'http://x').searchParams;
      const q = params.get('q') ?? '';
      const status = params.get('status') ?? 'all';
      const role = params.get('role') ?? 'all';
      const items = server.rows.filter(
        (row) =>
          `${row.name} ${row.email}`.toLowerCase().includes(q.toLowerCase()) &&
          (status === 'all' || row.status === status) &&
          (role === 'all' || (role === 'member') === (row.role === 'member')),
      );
      return json({ data: { items, nextCursor: '' } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const settle = () =>
  act(async () => {
    for (let turn = 0; turn < 5; turn++)
      await new Promise((resolve) => setTimeout(resolve, 0));
  });
const afterTyping = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
const click = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.click(element);
  });
  await settle();
};
const panel = () => screen.getByRole('dialog', { name: 'Account' });
const open = (name: string) =>
  click(screen.getByRole('button', { name: `Open ${name}` }));
const confirmBox = () => screen.getByRole('alertdialog');

describe('People directory', () => {
  it('lists real accounts and searches and filters on the server', async () => {
    route.search = 'status=suspended';
    render(<PeopleDirectory />);
    await settle();
    expect(server.lists[0]).toContain('status=suspended');
    expect(
      screen.getByRole('button', { name: 'Open Ben Member' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Open Anna Member' }),
    ).toBeNull();

    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'all' },
    });
    await settle();
    fireEvent.change(screen.getByLabelText('Search people'), {
      target: { value: 'anna' },
    });
    await afterTyping();
    await settle();
    expect(server.lists.at(-1)).toContain('q=anna');
    expect(
      screen.getByRole('button', { name: 'Open Anna Member' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Open Ben Member' }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText('Search people'), {
      target: { value: 'nobody' },
    });
    await afterTyping();
    await settle();
    expect(screen.getByText(/No accounts match/)).toBeInTheDocument();
  });

  it('Admin sees appointment counts but no prayer counts; staff accounts offer no actions', async () => {
    session.role = 'admin';
    render(<PeopleDirectory />);
    await settle();
    await open('Anna Member');
    expect(within(panel()).getByText(/2 needing a time/)).toBeInTheDocument();
    expect(within(panel()).queryByText(/Prayer requests/)).toBeNull();
    expect(
      within(panel()).getByRole('link', { name: 'Open appointments' }),
    ).toHaveAttribute('href', '/admin/appointments');
    expect(
      within(panel()).getByRole('button', { name: 'Suspend account' }),
    ).toBeInTheDocument();

    await click(within(panel()).getByRole('button', { name: 'Close panel' }));
    await open('Admin Example');
    expect(
      within(panel()).getByText(/set up by the church’s operator/),
    ).toBeInTheDocument();
    expect(
      within(panel()).queryByRole('button', { name: /Suspend|Reactivate/ }),
    ).toBeNull();
  });

  it('the Pastor also sees prayer counts', async () => {
    render(<PeopleDirectory />);
    await settle();
    await open('Anna Member');
    expect(
      within(panel()).getByText(/3 new, 1 praying, 4 prayed for/),
    ).toBeInTheDocument();
  });

  it('suspends only after confirming, with the version shown; the screen follows the server', async () => {
    render(<PeopleDirectory />);
    await settle();
    await open('Anna Member');
    fireEvent.click(
      within(panel()).getByRole('button', { name: 'Suspend account' }),
    );
    expect(server.writes).toHaveLength(0);
    fireEvent.click(
      within(confirmBox()).getByRole('button', { name: 'Keep as is' }),
    );
    expect(server.writes).toHaveLength(0);

    fireEvent.click(
      within(panel()).getByRole('button', { name: 'Suspend account' }),
    );
    await click(within(confirmBox()).getByRole('button', { name: 'Suspend' }));
    expect(server.writes[0]).toEqual({
      url: '/api/v1/staff/members/m1/status',
      ifMatch: '"1"',
      body: { status: 'suspended' },
    });
    expect(within(panel()).getByText('Suspended')).toBeInTheDocument();
    expect(
      within(panel()).getByRole('button', { name: 'Reactivate account' }),
    ).toBeInTheDocument();
    const row = screen.getByRole('button', { name: 'Open Anna Member' });
    expect(within(row).getByText('Suspended')).toBeInTheDocument();
    expect(toast.push).toHaveBeenCalledWith(
      expect.stringContaining('signed out everywhere'),
      'success',
    );
  });

  it('a failed change leaves the shown state; a conflict reloads it', async () => {
    render(<PeopleDirectory />);
    await settle();
    await open('Anna Member');
    server.fail = 'error';
    fireEvent.click(
      within(panel()).getByRole('button', { name: 'Suspend account' }),
    );
    await click(within(confirmBox()).getByRole('button', { name: 'Suspend' }));
    expect(within(panel()).getByText('Active')).toBeInTheDocument();
    expect(toast.push).toHaveBeenCalledWith('Something went wrong.', 'error');

    server.fail = 'conflict';
    const reads = server.detailReads.length;
    const lists = server.lists.length;
    fireEvent.click(
      within(panel()).getByRole('button', { name: 'Suspend account' }),
    );
    await click(within(confirmBox()).getByRole('button', { name: 'Suspend' }));
    expect(server.detailReads.length).toBe(reads + 1);
    expect(server.lists.length).toBe(lists + 1);
    expect(within(panel()).getByText('Active')).toBeInTheDocument();
  });

  it('an older search answer arriving last can’t replace the newest', async () => {
    const first = later();
    server.heldList = first.promise;
    render(<PeopleDirectory />);
    await settle();
    server.heldList = null;
    fireEvent.change(screen.getByLabelText('Search people'), {
      target: { value: 'ben' },
    });
    await afterTyping();
    await settle();
    expect(
      screen.getByRole('button', { name: 'Open Ben Member' }),
    ).toBeTruthy();
    first.release(json({ data: { items: server.rows, nextCursor: '' } }));
    await settle();
    expect(
      screen.queryByRole('button', { name: 'Open Anna Member' }),
    ).toBeNull();
  });

  it('a slow answer for an earlier person never replaces the open one', async () => {
    const slow = later();
    server.held.m1 = slow.promise;
    const page = render(<PeopleDirectory />);
    await settle();
    await open('Anna Member');
    route.search = 'person=m2';
    page.rerender(<PeopleDirectory />);
    await settle();
    expect(within(panel()).getByText('ben@example.org')).toBeInTheDocument();
    slow.release(json({ data: detail(server.rows[0]!) }));
    await settle();
    expect(within(panel()).queryByText('anna@example.org')).toBeNull();
    await click(
      within(panel()).getByRole('button', { name: 'Reactivate account' }),
    );
    await click(
      within(confirmBox()).getByRole('button', { name: 'Reactivate' }),
    );
    expect(server.writes.map((write) => [write.url, write.ifMatch])).toEqual([
      ['/api/v1/staff/members/m2/status', '"4"'],
    ]);
  });

  it('a Home count link opens exactly that list, also on the same page', async () => {
    route.search = 'role=member&status=active';
    const page = render(<PeopleDirectory />);
    await settle();
    expect(server.lists[0]).toContain('status=active');
    expect(server.lists[0]).toContain('role=member');
    expect(
      screen.getByRole('button', { name: 'Open Anna Member' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Open Admin Example' }),
    ).toBeNull();
    expect(screen.getByLabelText('Status')).toHaveValue('active');
    expect(screen.getByLabelText('Account type')).toHaveValue('member');

    // Another count link to this page switches the list without a reload.
    route.search = 'role=member&status=suspended';
    page.rerender(<PeopleDirectory />);
    await settle();
    expect(server.lists.at(-1)).toContain('status=suspended');
    expect(
      screen.getByRole('button', { name: 'Open Ben Member' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Open Anna Member' }),
    ).toBeNull();

    // Choosing a filter here updates the address, keeping the rest.
    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'all' },
    });
    expect(route.replace).toHaveBeenLastCalledWith('/admin/users?role=member', {
      scroll: false,
    });
  });

  it('closing a linked person keeps the list filters in the address', async () => {
    route.search = 'status=suspended&person=m2';
    render(<PeopleDirectory />);
    await settle();
    await click(within(panel()).getByRole('button', { name: 'Close panel' }));
    expect(route.replace).toHaveBeenCalledWith('/admin/users?status=suspended');
  });

  describe('"Confirm it’s you" before suspending', () => {
    const suspend = async () => {
      fireEvent.click(
        within(panel()).getByRole('button', { name: 'Suspend account' }),
      );
      await click(
        within(confirmBox()).getByRole('button', { name: 'Suspend' }),
      );
    };
    const reauthBox = () =>
      screen.getByRole('dialog', { name: 'Confirm it’s you' });
    const typePassword = (value: string) =>
      fireEvent.change(within(reauthBox()).getByLabelText('Current password'), {
        target: { value },
      });

    it('asks, refuses a wrong password, then retries once with the shown version', async () => {
      server.recent = false;
      render(<PeopleDirectory />);
      await settle();
      await open('Anna Member');
      await suspend();
      expect(server.writes).toHaveLength(1);
      expect(reauthBox()).toBeInTheDocument();
      expect(toast.push).not.toHaveBeenCalled();
      expect(within(panel()).getByText('Active')).toBeInTheDocument();

      typePassword('wrong');
      await click(within(reauthBox()).getByRole('button', { name: 'Confirm' }));
      expect(
        within(reauthBox()).getByText('That password is not correct.'),
      ).toBeInTheDocument();
      expect(server.writes).toHaveLength(1);

      typePassword('right-password');
      await click(within(reauthBox()).getByRole('button', { name: 'Confirm' }));
      expect(
        screen.queryByRole('dialog', { name: 'Confirm it’s you' }),
      ).toBeNull();
      expect(server.writes).toHaveLength(2);
      expect(server.writes[1]).toMatchObject({
        url: '/api/v1/staff/members/m1/status',
        ifMatch: '"1"',
        body: { status: 'suspended' },
      });
      expect(within(panel()).getByText('Suspended')).toBeInTheDocument();
    });

    it('cancelling changes nothing and sends nothing more', async () => {
      server.recent = false;
      render(<PeopleDirectory />);
      await settle();
      await open('Anna Member');
      await suspend();
      await click(within(reauthBox()).getByRole('button', { name: 'Cancel' }));
      expect(
        screen.queryByRole('dialog', { name: 'Confirm it’s you' }),
      ).toBeNull();
      expect(server.writes).toHaveLength(1);
      expect(server.reauths).toHaveLength(0);
      expect(within(panel()).getByText('Active')).toBeInTheDocument();
    });

    it('a confirmation finishing after another person signs in never resumes the change', async () => {
      server.recent = false;
      const page = render(<PeopleDirectory />);
      await settle();
      await open('Anna Member');
      await suspend();
      typePassword('right-password');
      const held = later();
      server.heldReauth = held.promise;
      await click(within(reauthBox()).getByRole('button', { name: 'Confirm' }));

      session.id = 'other-staff';
      page.rerender(<PeopleDirectory />);
      await settle();
      expect(
        screen.queryByRole('dialog', { name: 'Confirm it’s you' }),
      ).toBeNull();
      toast.push.mockClear();
      held.release(new Response());
      server.heldReauth = null;
      await settle();
      expect(server.writes).toHaveLength(1);
      expect(toast.push).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: 'Account' })).toBeNull();
    });
  });

  describe('when the signed-in staff identity or role changes', () => {
    it('Pastor → Admin: a late Pastor answer never brings prayer counts back', async () => {
      route.search = 'person=m1';
      // The Pastor's detail answer is still on its way when the role changes.
      const late = later();
      server.held.m1 = late.promise;
      const page = render(<PeopleDirectory />);
      await settle();
      session.role = 'admin';
      delete server.held.m1;
      page.rerender(<PeopleDirectory />);
      await settle();
      late.release(
        json({
          data: {
            ...detail(server.rows[0]!, 'pastor'),
            email: 'old-answer@example.org',
          },
        }),
      );
      await settle();
      expect(within(panel()).getByText('anna@example.org')).toBeInTheDocument();
      expect(screen.queryByText('old-answer@example.org')).toBeNull();
      expect(screen.queryByText(/prayed for/)).toBeNull();
      expect(screen.queryByText(/Prayer requests/)).toBeNull();
    });

    it('a change finishing after the switch shows nothing on the new screen', async () => {
      const page = render(<PeopleDirectory />);
      await settle();
      await open('Anna Member');
      const held = later();
      server.heldWrite = held.promise;
      fireEvent.click(
        within(panel()).getByRole('button', { name: 'Suspend account' }),
      );
      await click(
        within(confirmBox()).getByRole('button', { name: 'Suspend' }),
      );

      session.id = 'other-staff';
      page.rerender(<PeopleDirectory />);
      await settle();
      expect(screen.queryByRole('dialog', { name: 'Account' })).toBeNull();
      toast.push.mockClear();
      const before = server.lists.length + server.detailReads.length;
      held.release(new Response());
      server.heldWrite = null;
      await settle();
      expect(toast.push).not.toHaveBeenCalled();
      expect(server.lists.length + server.detailReads.length).toBe(before);
      // The new screen shows the server's list, not the old screen's edit.
      const row = screen.getByRole('button', { name: 'Open Anna Member' });
      expect(within(row).getByText('Active')).toBeInTheDocument();
    });

    it('signed out or non-staff: nothing is shown or fetched', async () => {
      const page = render(<PeopleDirectory />);
      await settle();
      const late = later();
      server.heldList = late.promise;
      fireEvent.change(screen.getByLabelText('Status'), {
        target: { value: 'active' },
      });
      session.id = undefined;
      page.rerender(<PeopleDirectory />);
      await settle();
      late.release(json({ data: { items: server.rows, nextCursor: '' } }));
      await settle();
      expect(screen.queryByText('Anna Member')).toBeNull();
      expect(screen.queryByLabelText('Search people')).toBeNull();
      const before = server.lists.length;
      session.id = 'member';
      session.role = 'member';
      page.rerender(<PeopleDirectory />);
      await settle();
      expect(server.lists.length).toBe(before);
      expect(screen.queryByLabelText('Search people')).toBeNull();
    });
  });
});
