import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffAppointments } from './staff-appointments';

/*
 * Phase 4B: one appointments view for the Pastor and Admin. Admin's screen
 * shows logistics only (the server sends nothing else) and offers no
 * decline or notes; the Pastor sees the topic, message and private notes.
 * Actions send the version loaded and a conflict reloads; the open
 * appointment follows the address and a slow answer for an earlier one
 * never replaces it or receives its actions; a time typed while a save
 * finishes is kept. A different staff identity, a role change or signing
 * out starts a fresh screen, and late answers from before (lists, details,
 * saves) never put private details, toasts or draft changes on it.
 */

const route = vi.hoisted(() => ({ search: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(route.search),
  usePathname: () => '/pastor/care',
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

const logistics = (id: string, name: string) => ({
  id,
  status: 'requested',
  preferredDate: '',
  preferredTime: 'morning',
  startsAt: '',
  endsAt: '',
  location: '',
  version: 1,
  createdAt: '2026-11-18T01:00:00.000Z',
  closedAt: '',
  deleteAfter: '',
  history: [
    {
      status: 'requested',
      at: '2026-11-18T01:00:00.000Z',
      startsAt: '',
      endsAt: '',
    },
  ],
  member: {
    name,
    email: `${name.split(' ')[0]!.toLowerCase()}@example.org`,
    phone: '',
  },
});
const server = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  conflict: false,
  held: {} as Record<string, Promise<Response>>,
  heldWrite: null as Promise<Response> | null,
  heldList: null as Promise<Response> | null,
  notes: [] as string[],
  listReads: 0,
  writes: [] as { url: string; ifMatch: string | null; body: unknown }[],
  detailReads: [] as string[],
}));
const confidential: Record<string, { topic: string; reason: string }> = {
  a1: { topic: 'Marriage and family', reason: 'We are struggling' },
  a2: { topic: 'Baptism', reason: 'I would like to be baptised' },
};
/** What the server would send this role (the asker's, by default). */
const view = (
  row: Record<string, unknown>,
  detail = false,
  role = session.role,
) =>
  role === 'pastor'
    ? {
        ...row,
        ...confidential[row.id as string],
        noteCount: server.notes.length,
        ...(detail && {
          notes: server.notes.map((text, index) => ({
            id: `n${index}`,
            text,
            author: 'Pastor',
            createdAt: '2026-11-19T01:00:00.000Z',
          })),
        }),
      }
    : row;
function later() {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => (release = resolve));
  return { promise, release };
}

beforeEach(() => {
  session.id = 'staff';
  session.role = 'pastor';
  toast.push.mockClear();
  server.heldList = null;
  server.notes = [];
  server.listReads = 0;
  route.search = '';
  route.replace.mockClear();
  server.conflict = false;
  server.held = {};
  server.heldWrite = null;
  server.writes = [];
  server.detailReads = [];
  server.rows = [logistics('a1', 'Anna Member'), logistics('a2', 'Ben Member')];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      // Answers carry what the asker's role may see, even if they arrive
      // after the screen has changed hands.
      const asker = session.role;
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        server.writes.push({
          url,
          ifMatch: new Headers(init.headers).get('if-match'),
          body,
        });
        if (server.heldWrite) await server.heldWrite;
        if (server.conflict)
          return Response.json(
            { error: { code: 'VERSION_CONFLICT', message: 'Changed.' } },
            { status: 412 },
          );
        const id = url.split('/').at(-2)!;
        const note = url.endsWith('/notes');
        if (note) server.notes.push(body.text);
        server.rows = server.rows.map((row) =>
          row.id !== id
            ? row
            : {
                ...row,
                ...(!note && {
                  status: 'proposed',
                  startsAt: '2026-12-01T21:00:00.000Z',
                  endsAt: '2026-12-01T21:30:00.000Z',
                  location: body.location,
                }),
                version: (row.version as number) + 1,
              },
        );
        return Response.json({
          data: view(
            server.rows.find((row) => row.id === id)!,
            true,
            asker,
          ),
        });
      }
      const one = url.match(/\/staff\/appointments\/(\w+)$/);
      if (one) {
        server.detailReads.push(one[1]!);
        if (server.held[one[1]!]) return server.held[one[1]!]!;
        return Response.json({
          data: view(
            server.rows.find((row) => row.id === one[1])!,
            true,
          ),
        });
      }
      server.listReads++;
      if (server.heldList) return server.heldList;
      return Response.json({ data: server.rows.map((row) => view(row)) });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const settle = () =>
  act(async () => {
    for (let turn = 0; turn < 5; turn++)
      await new Promise((resolve) => setTimeout(resolve, 0));
  });
const click = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.click(element);
  });
  await settle();
};
const panel = () => screen.getByRole('dialog', { name: 'Appointment' });
const open = (name: string) =>
  click(screen.getByRole('button', { name: `Open appointment with ${name}` }));
const fill = (label: string, value: string) =>
  fireEvent.change(within(panel()).getByLabelText(label), {
    target: { value },
  });

describe('staff appointments', () => {
  it('Admin sees logistics only: no topic, message, notes or decline', async () => {
    session.role = 'admin';
    render(<StaffAppointments />);
    await settle();
    expect(
      screen.getByText(/Topics, messages and the pastor’s notes stay private/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Marriage and family')).toBeNull();
    await open('Anna Member');
    expect(within(panel()).getByText('anna@example.org')).toBeInTheDocument();
    expect(within(panel()).queryByText('We are struggling')).toBeNull();
    expect(within(panel()).queryByText('Private notes')).toBeNull();
    expect(
      within(panel()).queryByRole('button', { name: 'Decline request' }),
    ).toBeNull();
    expect(
      within(panel()).getByRole('button', { name: 'Suggest this time' }),
    ).toBeInTheDocument();
  });

  it('the Pastor sees the topic, message, private notes and decline', async () => {
    render(<StaffAppointments />);
    await settle();
    expect(screen.getByText('Marriage and family')).toBeInTheDocument();
    await open('Anna Member');
    expect(within(panel()).getByText('We are struggling')).toBeInTheDocument();
    expect(within(panel()).getByText('Private notes')).toBeInTheDocument();
    expect(
      within(panel()).getByRole('button', { name: 'Decline request' }),
    ).toBeInTheDocument();
  });

  it('suggests a time with the version loaded; a time typed while it saves is kept', async () => {
    render(<StaffAppointments />);
    await settle();
    await open('Anna Member');
    fill('Date', '2026-12-02');
    fill('Start', '10:00');
    fill('Place', 'Church office');
    const held = later();
    server.heldWrite = held.promise;
    await click(
      within(panel()).getByRole('button', { name: 'Suggest this time' }),
    );
    expect(server.writes[0]).toEqual({
      url: '/api/v1/staff/appointments/a1/propose',
      ifMatch: '"1"',
      body: {
        date: '2026-12-02',
        time: '10:00',
        minutes: 30,
        location: 'Church office',
      },
    });
    fill('Place', 'Phone call'); // changed while the save is in flight
    held.release(new Response());
    server.heldWrite = null;
    await settle();
    expect(within(panel()).getByText(/Suggested:/)).toBeInTheDocument();
    expect(within(panel()).getByLabelText('Place')).toHaveValue('Phone call');
    expect(within(panel()).getByLabelText('Date')).toHaveValue('2026-12-02');
  });

  it('a slow answer for an earlier appointment never replaces the open one', async () => {
    const slow = later();
    server.held.a1 = slow.promise;
    const page = render(<StaffAppointments />);
    await settle();
    await open('Anna Member');
    route.search = 'appointment=a2';
    page.rerender(<StaffAppointments />);
    await settle();
    expect(within(panel()).getByText('ben@example.org')).toBeInTheDocument();
    slow.release(Response.json({ data: view(server.rows[0]!, true) }));
    await settle();
    expect(within(panel()).getByText('ben@example.org')).toBeInTheDocument();
    expect(within(panel()).queryByText('anna@example.org')).toBeNull();
    fill('Date', '2026-12-02');
    fill('Start', '11:00');
    await click(
      within(panel()).getByRole('button', { name: 'Suggest this time' }),
    );
    expect(server.writes.map((item) => item.url)).toEqual([
      '/api/v1/staff/appointments/a2/propose',
    ]);
  });

  it('a conflict reloads the appointment and keeps the typed time', async () => {
    route.search = 'appointment=a1';
    server.conflict = true;
    render(<StaffAppointments />);
    await settle();
    fill('Date', '2026-12-02');
    fill('Start', '10:00');
    const reads = server.detailReads.length;
    await click(
      within(panel()).getByRole('button', { name: 'Confirm this time' }),
    );
    expect(server.writes[0]!.body).toEqual({
      slot: { date: '2026-12-02', time: '10:00', minutes: 30, location: '' },
    });
    expect(server.detailReads.length).toBe(reads + 1);
    expect(within(panel()).getByLabelText('Date')).toHaveValue('2026-12-02');
  });

  it('a Home count link opens that list; another link switches it on the same page', async () => {
    server.rows = [
      logistics('a1', 'Anna Member'),
      {
        ...logistics('a2', 'Ben Member'),
        status: 'confirmed',
        startsAt: '2026-12-01T21:00:00.000Z',
        endsAt: '2026-12-01T21:30:00.000Z',
      },
    ];
    route.search = 'appointments=upcoming';
    const page = render(<StaffAppointments />);
    await settle();
    const row = (name: string) =>
      screen.queryByRole('button', { name: `Open appointment with ${name}` });
    expect(row('Ben Member')).toBeTruthy();
    expect(row('Anna Member')).toBeNull();
    expect(screen.getByRole('button', { name: /^Confirmed/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    route.search = 'appointments=requested';
    page.rerender(<StaffAppointments />);
    await settle();
    expect(row('Anna Member')).toBeTruthy();
    expect(row('Ben Member')).toBeNull();
    // Choosing a filter here updates the address.
    fireEvent.click(screen.getByRole('button', { name: /^Closed/ }));
    expect(route.replace).toHaveBeenLastCalledWith(
      '/pastor/care?appointments=closed',
      { scroll: false },
    );
  });

  it('closing a linked appointment keeps the list filter in the address', async () => {
    route.search = 'appointments=all&appointment=a1';
    render(<StaffAppointments />);
    await settle();
    await click(within(panel()).getByRole('button', { name: 'Close panel' }));
    expect(route.replace).toHaveBeenCalledWith('/pastor/care?appointments=all');
  });

  it('closing a linked appointment drops it from the address', async () => {
    route.search = 'appointment=a1';
    render(<StaffAppointments />);
    await settle();
    await click(within(panel()).getByRole('button', { name: 'Close panel' }));
    expect(route.replace).toHaveBeenCalledWith('/pastor/care');
    expect(screen.queryByRole('dialog', { name: 'Appointment' })).toBeNull();
  });

  describe('when the signed-in staff identity or role changes', () => {
    const traffic = () =>
      server.listReads + server.detailReads.length + server.writes.length;
    const openButton = (name: string) =>
      screen.getByRole('button', { name: `Open appointment with ${name}` });

    it('Pastor → Admin: private details, drafts and the open appointment go; fresh Admin data only', async () => {
      const page = render(<StaffAppointments />);
      await settle();
      await open('Anna Member');
      fill('Add a note', 'Half-written private note');
      fill('Date', '2026-12-02');
      expect(
        within(panel()).getByText('We are struggling'),
      ).toBeInTheDocument();
      const lists = server.listReads;

      session.role = 'admin';
      page.rerender(<StaffAppointments />);
      await settle();
      expect(server.listReads).toBe(lists + 1); // a fresh Admin list
      expect(screen.queryByRole('dialog', { name: 'Appointment' })).toBeNull();
      expect(screen.queryByText('Marriage and family')).toBeNull();
      expect(screen.queryByText('We are struggling')).toBeNull();
      expect(
        screen.getByText(/stay private to the pastor/),
      ).toBeInTheDocument();
      await open('Anna Member');
      expect(within(panel()).queryByText('We are struggling')).toBeNull();
      expect(within(panel()).queryByText('Private notes')).toBeNull();
      expect(within(panel()).queryByLabelText('Add a note')).toBeNull();
      expect(within(panel()).getByLabelText('Date')).toHaveValue('');
    });

    it('a linked appointment reopens with a fresh Admin answer, never the Pastor’s', async () => {
      route.search = 'appointment=a1';
      const page = render(<StaffAppointments />);
      await settle();
      expect(
        within(panel()).getByText('We are struggling'),
      ).toBeInTheDocument();
      const reads = server.detailReads.length;
      session.role = 'admin';
      page.rerender(<StaffAppointments />);
      await settle();
      expect(server.detailReads.length).toBe(reads + 1);
      expect(within(panel()).getByText('anna@example.org')).toBeInTheDocument();
      expect(within(panel()).queryByText('We are struggling')).toBeNull();
      expect(within(panel()).queryByText('Marriage and family')).toBeNull();
    });

    it('late Pastor list and detail answers never reach the Admin screen', async () => {
      route.search = 'appointment=a1';
      server.notes = ['Private pastor note'];
      const list = later();
      const detail = later();
      server.heldList = list.promise;
      server.held.a1 = detail.promise;
      const page = render(<StaffAppointments />);
      await settle();
      // What the Pastor asked for, marked so it would show if it landed.
      const stale = (row: Record<string, unknown>) => ({
        ...row,
        member: { name: 'Old Pastor Answer', email: 'old@example.org' },
      });
      const pastorRows = server.rows.map((row) =>
        stale(view(row, false, 'pastor')),
      );
      const pastorDetail = stale(view(server.rows[0]!, true, 'pastor'));

      server.heldList = null;
      delete server.held.a1;
      session.role = 'admin';
      page.rerender(<StaffAppointments />);
      await settle();
      list.release(Response.json({ data: pastorRows }));
      detail.release(Response.json({ data: pastorDetail }));
      await settle();
      expect(screen.queryByText('Old Pastor Answer')).toBeNull();
      expect(screen.queryByText('old@example.org')).toBeNull();
      expect(screen.queryByText('Marriage and family')).toBeNull();
      expect(screen.queryByText('We are struggling')).toBeNull();
      expect(screen.queryByText('Private pastor note')).toBeNull();
      expect(openButton('Anna Member')).toBeInTheDocument();
      expect(within(panel()).getByText('anna@example.org')).toBeInTheDocument();
    });

    it('a Pastor save finishing after the switch adds nothing to the new screen', async () => {
      const page = render(<StaffAppointments />);
      await settle();
      await open('Anna Member');
      fill('Add a note', 'Private pastor note');
      const held = later();
      server.heldWrite = held.promise;
      await click(within(panel()).getByRole('button', { name: 'Add note' }));

      session.role = 'admin';
      page.rerender(<StaffAppointments />);
      await settle();
      await open('Anna Member');
      fill('Date', '2026-12-03');
      fill('Start', '14:00');
      const before = traffic();
      toast.push.mockClear();
      held.release(new Response());
      server.heldWrite = null;
      await settle();
      // No toast, no reload, no private words, and Admin's draft untouched.
      expect(toast.push).not.toHaveBeenCalled();
      expect(traffic()).toBe(before);
      expect(screen.queryByText('Private pastor note')).toBeNull();
      expect(screen.queryByText('We are struggling')).toBeNull();
      expect(within(panel()).getByLabelText('Date')).toHaveValue('2026-12-03');
      expect(within(panel()).getByLabelText('Start')).toHaveValue('14:00');
      // Not left busy by the old save: the form is usable.
      expect(
        within(panel()).getByRole('group', {
          name: 'Suggest or confirm a time',
        }),
      ).not.toBeDisabled();
      expect(
        within(panel()).getByRole('button', { name: 'Suggest this time' }),
      ).toBeEnabled();
    });

    it('another staff member or signing out starts fresh; signed out or non-staff fetch nothing', async () => {
      const page = render(<StaffAppointments />);
      await settle();
      await open('Anna Member');
      fill('Add a note', 'Half-written');

      session.id = 'another-pastor';
      page.rerender(<StaffAppointments />);
      await settle();
      expect(screen.queryByRole('dialog', { name: 'Appointment' })).toBeNull();
      await open('Anna Member');
      expect(within(panel()).getByLabelText('Add a note')).toHaveValue('');

      // Signing out while a list refresh is still on its way.
      const late = later();
      server.heldList = late.promise;
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      session.id = undefined;
      page.rerender(<StaffAppointments />);
      await settle();
      late.release(
        Response.json({
          data: server.rows.map((row) => view(row, false, 'pastor')),
        }),
      );
      await settle();
      expect(
        screen.queryByRole('heading', { name: 'Appointments' }),
      ).toBeNull();
      expect(screen.queryByText('Anna Member')).toBeNull();
      expect(screen.queryByText('Marriage and family')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();

      const before = traffic();
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      session.id = 'member';
      session.role = 'member';
      page.rerender(<StaffAppointments />);
      await settle();
      expect(traffic()).toBe(before);
      expect(
        screen.queryByRole('heading', { name: 'Appointments' }),
      ).toBeNull();
    });
  });
});
