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
  deletionOff: false,
  holds: [] as { url: string; body: Record<string, unknown> }[],
  /** The next hold request (after confirming it's you) is refused. */
  holdRefused: false,
  heldDeletion: null as Promise<Response | null> | null,
  deletions: [] as { url: string; body: unknown }[],
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
  holds: (row.holds as unknown[]) ?? [],
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
  server.deletionOff = false;
  server.holds = [];
  server.holdRefused = false;
  server.heldDeletion = null;
  server.deletions = [];
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
      if (init?.method === 'POST' && url === '/api/v1/staff/holds') {
        const body = JSON.parse(String(init.body));
        server.holds.push({ url, body });
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
        if (server.holdRefused) {
          server.holdRefused = false;
          return json(
            {
              error: {
                code: 'VALIDATION_FAILED',
                message: 'Choose a review date within a year.',
              },
            },
            422,
          );
        }
        server.rows = server.rows.map((row) =>
          row.id === body.userId
            ? {
                ...row,
                holds: [
                  {
                    id: 'h1',
                    userId: body.userId,
                    subject: row.name,
                    reason: body.reason,
                    reference: body.reference,
                    basis: body.basis,
                    reviewBy: body.reviewBy,
                    overdue: false,
                    placedAt: '2026-11-21T00:00:00.000Z',
                    version: 1,
                  },
                ],
              }
            : row,
        );
        return json({ data: {} }, 201);
      }
      if (init?.method === 'POST' && url.endsWith('/deletion')) {
        const body = JSON.parse(String(init.body));
        server.deletions.push({ url, body });
        if (server.heldDeletion) {
          const answer = await server.heldDeletion;
          if (answer) return answer;
        }
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
        if (server.deletionOff)
          return json(
            {
              error: {
                code: 'DELETION_UNAVAILABLE',
                message: 'Account deletion isn’t switched on yet.',
              },
            },
            503,
          );
        const id = url.split('/').at(-2)!;
        const deletion = {
          via: 'staff',
          requestedAt: '2026-11-21T00:00:00.000Z',
          purgeAfter: '2026-12-21T00:00:00.000Z',
        };
        server.rows = server.rows.map((row) =>
          row.id === id
            ? {
                ...row,
                name: 'Deleted user',
                email: '',
                status: 'deletion_pending',
                manageable: false,
                deletion,
              }
            : row,
        );
        return json({ data: { ...deletion, purgedAt: '' } });
      }
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

  describe('deleting at the member’s request', () => {
    const deleteBox = () =>
      screen.getByRole('alertdialog', { name: /Delete .* account\?/ });
    async function fillAndConfirm() {
      await click(
        within(panel()).getByRole('button', {
          name: 'Delete at member’s request',
        }),
      );
      const confirm = within(deleteBox()).getByRole('button', {
        name: 'Delete account',
      });
      expect(confirm).toBeDisabled();
      fireEvent.click(
        within(deleteBox()).getByLabelText(
          'The member asked for their account to be deleted',
        ),
      );
      fireEvent.change(
        within(deleteBox()).getByLabelText('How did they ask?'),
        {
          target: { value: 'Phoned the office' },
        },
      );
      expect(confirm).toBeDisabled();
      fireEvent.change(
        within(deleteBox()).getByLabelText('Type DELETE to confirm'),
        { target: { value: 'DELETE' } },
      );
      await click(confirm);
    }

    it('needs the member’s request, a note and DELETE; the screen shows what remains and until when', async () => {
      render(<PeopleDirectory />);
      await settle();
      await open('Anna Member');
      await fillAndConfirm();
      expect(server.deletions).toEqual([
        {
          url: '/api/v1/staff/members/m1/deletion',
          body: {
            confirm: 'DELETE',
            memberRequested: true,
            requestNote: 'Phoned the office',
          },
        },
      ]);
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(
        within(panel()).getByText(/by staff, at the member’s request/),
      ).toBeTruthy();
      expect(
        within(panel()).queryByRole('button', { name: /Suspend|Delete at/ }),
      ).toBeNull();
      expect(toast.push).toHaveBeenCalledWith(
        expect.stringContaining('Account deleted.'),
        'success',
      );
      // Due for removal from the 30-day date, never "removed on" it.
      const told = String(toast.push.mock.calls.at(-1)![0]);
      expect(told).toContain('become due for removal on');
      expect(told).not.toContain('removed on');
      const note = within(panel()).getByText(
        /by staff, at the member’s request/,
      );
      expect(note).toHaveTextContent('become due for removal on');
      expect(note).not.toHaveTextContent(/are removed on|removed for good/);
    });

    it('when deletion isn’t switched on, it says so and changes nothing', async () => {
      server.deletionOff = true;
      render(<PeopleDirectory />);
      await settle();
      await open('Anna Member');
      await fillAndConfirm();
      expect(within(deleteBox()).getByRole('alert')).toHaveTextContent(
        'isn’t switched on yet',
      );
      expect(within(panel()).getByText('Active')).toBeInTheDocument();
    });

    it('confirms it’s you when needed, then retries with the same note', async () => {
      server.recent = false;
      render(<PeopleDirectory />);
      await settle();
      await open('Anna Member');
      await fillAndConfirm();
      const reauth = screen.getByRole('dialog', { name: 'Confirm it’s you' });
      fireEvent.change(within(reauth).getByLabelText('Current password'), {
        target: { value: 'right-password' },
      });
      await click(within(reauth).getByRole('button', { name: 'Confirm' }));
      expect(server.deletions).toHaveLength(2);
      expect(server.deletions[1]!.body).toMatchObject({
        requestNote: 'Phoned the office',
      });
      expect(within(panel()).getByText(/by staff/)).toBeTruthy();
    });

    it('a held result for an earlier person never spills into the one opened since', async () => {
      for (const outcome of ['error', 'reauth', 'success'] as const) {
        const held = later();
        server.heldDeletion = held.promise as Promise<Response | null>;
        toast.push.mockClear();
        route.search = 'person=m1';
        const page = render(<PeopleDirectory />);
        await settle();
        await fillAndConfirm();
        // A notification for Ben is opened while Anna's request is held.
        route.search = 'person=m2';
        page.rerender(<PeopleDirectory />);
        await settle();
        expect(within(panel()).getByText('ben@example.org')).toBeTruthy();
        held.release(
          outcome === 'error'
            ? json(
                {
                  error: {
                    code: 'DELETION_UNAVAILABLE',
                    message: 'Account deletion isn’t switched on yet.',
                  },
                },
                503,
              )
            : outcome === 'reauth'
              ? json(
                  {
                    error: {
                      code: 'REAUTH_REQUIRED',
                      message: 'For your security, confirm it’s you first.',
                    },
                  },
                  403,
                )
              : (null as unknown as Response),
        );
        server.heldDeletion = null;
        await settle();
        expect(screen.queryByRole('alertdialog')).toBeNull();
        expect(
          screen.queryByRole('dialog', { name: 'Confirm it’s you' }),
        ).toBeNull();
        expect(within(panel()).queryByRole('alert')).toBeNull();
        expect(within(panel()).getByText('ben@example.org')).toBeTruthy();
        expect(within(panel()).queryByText(/by staff/)).toBeNull();
        expect(toast.push).not.toHaveBeenCalledWith(
          expect.stringContaining('Account deleted.'),
          'success',
        );
        page.unmount();
        server.rows = server.rows.map((row) =>
          row.id === 'm1'
            ? { ...person('m1', 'Anna Member'), status: 'active' }
            : row,
        );
      }
    });
  });

  describe('a deleted account’s removal is described truthfully', () => {
    const deleted = (purgeAfter: string, holds: unknown[] = []) =>
      person('m9', 'Deleted user', {
        email: '',
        status: 'deletion_pending',
        manageable: false,
        deletion: {
          via: 'self',
          requestedAt: '2026-09-01T00:00:00.000Z',
          purgeAfter,
        },
        holds,
      } as Partial<Row>);
    const noteFor = () => within(panel()).getByText(/by the member/);

    it('before its 30 days: the date it becomes due, not a removal date', async () => {
      server.rows = [deleted('2099-01-01T00:00:00.000Z')];
      render(<PeopleDirectory />);
      await settle();
      await open('Deleted user');
      expect(noteFor()).toHaveTextContent('become due for removal on');
      expect(noteFor()).not.toHaveTextContent(/removed on|removed for good/);
    });

    it('due but not yet removed: says so, and that the next clean-up deletes them', async () => {
      server.rows = [deleted('2026-10-01T00:00:00.000Z')];
      render(<PeopleDirectory />);
      await settle();
      await open('Deleted user');
      expect(noteFor()).toHaveTextContent('have been due for removal since');
      expect(noteFor()).toHaveTextContent('next records clean-up');
      expect(noteFor()).not.toHaveTextContent(/were removed|removed on/);
    });

    it('under an active records hold: kept until the hold is reviewed and released', async () => {
      server.rows = [
        deleted('2026-10-01T00:00:00.000Z', [
          {
            id: 'h1',
            userId: 'm9',
            subject: 'Deleted user',
            reason: 'claim',
            reference: 'Claim 2026-14',
            basis: 'Needed while a claim is resolved',
            reviewBy: '2027-02-01',
            overdue: false,
            placedAt: '2026-11-21T00:00:00.000Z',
            version: 1,
          },
        ]),
      ];
      render(<PeopleDirectory />);
      await settle();
      await open('Deleted user');
      expect(noteFor()).toHaveTextContent(
        'a records hold keeps them until it is reviewed and released',
      );
      expect(noteFor()).not.toHaveTextContent('next records clean-up');
    });
  });

  describe('records holds', () => {
    const holdBox = () =>
      screen.getByRole('dialog', { name: /Place a records hold/ });
    async function fillHold() {
      await click(
        within(panel()).getByRole('button', { name: 'Place records hold' }),
      );
      const place = within(holdBox()).getByRole('button', {
        name: 'Place hold',
      });
      expect(place).toBeDisabled();
      fireEvent.change(within(holdBox()).getByLabelText('Reason'), {
        target: { value: 'claim' },
      });
      fireEvent.change(within(holdBox()).getByLabelText('Reference'), {
        target: { value: 'Claim 2026-14' },
      });
      fireEvent.change(
        within(holdBox()).getByLabelText('Why the records must be kept'),
        { target: { value: 'Needed while a claim is resolved' } },
      );
      await click(place);
    }

    it('places a documented hold and shows it on the person', async () => {
      render(<PeopleDirectory />);
      await settle();
      await open('Anna Member');
      expect(within(panel()).getByText('No records hold.')).toBeTruthy();
      await fillHold();
      expect(server.holds[0]!.body).toMatchObject({
        userId: 'm1',
        reason: 'claim',
        reference: 'Claim 2026-14',
        basis: 'Needed while a claim is resolved',
      });
      expect(server.holds[0]!.body.reviewBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(within(panel()).getByText(/Claim 2026-14/)).toBeTruthy();
      expect(toast.push).toHaveBeenCalledWith(
        'Records hold placed.',
        'success',
      );
    });

    it('confirms it’s you when needed and retries with the same draft', async () => {
      server.recent = false;
      render(<PeopleDirectory />);
      await settle();
      await open('Anna Member');
      await fillHold();
      const reauth = screen.getByRole('dialog', { name: 'Confirm it’s you' });
      fireEvent.change(within(reauth).getByLabelText('Current password'), {
        target: { value: 'right-password' },
      });
      await click(within(reauth).getByRole('button', { name: 'Confirm' }));
      expect(server.holds).toHaveLength(2);
      expect(server.holds[1]!.body).toMatchObject({
        reference: 'Claim 2026-14',
      });
    });

    const reauthBox = () =>
      screen.getByRole('dialog', { name: 'Confirm it’s you' });
    const shownDraft = () => ({
      reason: (within(holdBox()).getByLabelText('Reason') as HTMLSelectElement)
        .value,
      reference: (
        within(holdBox()).getByLabelText('Reference') as HTMLInputElement
      ).value,
      basis: (
        within(holdBox()).getByLabelText(
          'Why the records must be kept',
        ) as HTMLInputElement
      ).value,
    });
    const filled = {
      reason: 'claim',
      reference: 'Claim 2026-14',
      basis: 'Needed while a claim is resolved',
    };

    it('cancelling confirm-it’s-you brings the hold back with its draft, unsent', async () => {
      server.recent = false;
      render(<PeopleDirectory />);
      await settle();
      await open('Anna Member');
      await fillHold();
      expect(
        screen.queryByRole('dialog', { name: /Place a records hold/ }),
      ).toBeNull();
      await click(within(reauthBox()).getByRole('button', { name: 'Cancel' }));
      expect(shownDraft()).toEqual(filled);
      expect(within(holdBox()).getByRole('alert')).toHaveTextContent(
        'The hold isn’t placed yet',
      );
      expect(server.holds).toHaveLength(1);
      // Placing it again asks again, still with the same draft.
      await click(
        within(holdBox()).getByRole('button', { name: 'Place hold' }),
      );
      fireEvent.change(within(reauthBox()).getByLabelText('Current password'), {
        target: { value: 'right-password' },
      });
      await click(within(reauthBox()).getByRole('button', { name: 'Confirm' }));
      expect(server.holds).toHaveLength(3);
      expect(server.holds[2]!.body).toMatchObject({ userId: 'm1', ...filled });
      expect(
        screen.queryByRole('dialog', { name: /Place a records hold/ }),
      ).toBeNull();
    });

    it('a retry that fails after confirming shows its error with the draft still there', async () => {
      server.recent = false;
      server.holdRefused = true;
      render(<PeopleDirectory />);
      await settle();
      await open('Anna Member');
      await fillHold();
      fireEvent.change(within(reauthBox()).getByLabelText('Current password'), {
        target: { value: 'right-password' },
      });
      await click(within(reauthBox()).getByRole('button', { name: 'Confirm' }));
      expect(server.holds).toHaveLength(2);
      expect(within(holdBox()).getByRole('alert')).toHaveTextContent(
        'Choose a review date within a year.',
      );
      expect(shownDraft()).toEqual(filled);
      expect(
        within(holdBox()).getByRole('button', { name: 'Place hold' }),
      ).not.toBeDisabled();
      // Cancel and reopen: the draft is still there for this person.
      await click(within(holdBox()).getByRole('button', { name: 'Cancel' }));
      await click(
        within(panel()).getByRole('button', { name: 'Place records hold' }),
      );
      expect(shownDraft()).toEqual(filled);
    });

    it('a draft belongs to its person: opening someone else starts blank and nothing is sent for them', async () => {
      server.recent = false;
      render(<PeopleDirectory />);
      await settle();
      await open('Anna Member');
      await fillHold();
      expect(reauthBox()).toBeTruthy();
      await open('Ben Member');
      expect(
        screen.queryByRole('dialog', { name: 'Confirm it’s you' }),
      ).toBeNull();
      await click(
        within(panel()).getByRole('button', { name: 'Place records hold' }),
      );
      expect(shownDraft()).toMatchObject({ reference: '', basis: '' });
      await click(within(holdBox()).getByRole('button', { name: 'Cancel' }));
      // Back to Anna: her unsent draft was dropped with the switch.
      await open('Anna Member');
      await click(
        within(panel()).getByRole('button', { name: 'Place records hold' }),
      );
      expect(shownDraft()).toMatchObject({ reference: '', basis: '' });
      expect(server.holds).toHaveLength(1);
      expect(server.holds.every((hold) => hold.body.userId === 'm1')).toBe(
        true,
      );
    });

    it('a retry answered after switching person shows nothing on the new person', async () => {
      server.recent = false;
      render(<PeopleDirectory />);
      await settle();
      await open('Anna Member');
      await fillHold();
      server.holdRefused = true;
      const answer = later();
      server.heldReauth = answer.promise;
      fireEvent.change(within(reauthBox()).getByLabelText('Current password'), {
        target: { value: 'right-password' },
      });
      await click(within(reauthBox()).getByRole('button', { name: 'Confirm' }));
      server.heldReauth = null;
      await open('Ben Member');
      answer.release(json({ data: { status: 'ok' } }));
      await settle();
      expect(
        screen.queryByRole('dialog', { name: /Place a records hold/ }),
      ).toBeNull();
      expect(server.holds).toHaveLength(1);
      expect(toast.push).not.toHaveBeenCalledWith(
        'Records hold placed.',
        'success',
      );
    });
  });
});
