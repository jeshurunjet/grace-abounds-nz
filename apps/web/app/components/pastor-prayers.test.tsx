import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PastorPrayers } from './pastor-prayers';

/*
 * Phase 4A: the Pastor's list filters by status and opens a request; the
 * open request follows the address (also for a second notification on the
 * same page); actions are explicit and send the version loaded; a conflict
 * reloads; a slow answer for a request opened earlier never replaces the
 * one open now or receives its actions.
 */

const route = vi.hoisted(() => ({ search: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(route.search),
  usePathname: () => '/pastor/care',
  useRouter: () => ({ replace: route.replace }),
}));

const base = {
  createdAt: '2026-11-18T01:00:00.000Z',
  closedAt: '',
  deleteAfter: '',
  history: [{ status: 'submitted', at: '2026-11-18T01:00:00.000Z' }],
  noteCount: 0,
};
const person = (name: string) => ({
  name,
  email: `${name.split(' ')[0]!.toLowerCase()}@example.org`,
});
const server = vi.hoisted(() => ({
  prayers: [] as Record<string, unknown>[],
  conflict: false,
  held: {} as Record<string, Promise<Response>>,
  heldNote: null as Promise<Response> | null,
  writes: [] as { url: string; ifMatch: string | null; body: unknown }[],
}));
function later() {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => (release = resolve));
  return { promise, release };
}
const detail = (id: string) => ({
  ...server.prayers.find((item) => item.id === id),
  notes: [],
});

beforeEach(() => {
  route.search = '';
  route.replace.mockClear();
  server.conflict = false;
  server.held = {};
  server.heldNote = null;
  server.writes = [];
  server.prayers = [
    {
      ...base,
      id: 'p1',
      text: 'For healing',
      status: 'submitted',
      version: 1,
      member: person('Anna Member'),
    },
    {
      ...base,
      id: 'p3',
      text: 'For a new job',
      status: 'submitted',
      version: 1,
      member: person('Cara Member'),
    },
    {
      ...base,
      id: 'p2',
      text: 'Thanks',
      status: 'prayed_for',
      version: 3,
      member: person('Ben Member'),
    },
  ];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        server.writes.push({
          url,
          ifMatch: new Headers(init.headers).get('if-match'),
          body: JSON.parse(String(init.body)),
        });
        if (url.endsWith('/notes') && server.heldNote) {
          const held = server.heldNote;
          server.heldNote = null;
          await held;
          return Response.json(
            { data: detail(url.split('/').at(-2)!) },
            { status: 201 },
          );
        }
        if (server.conflict)
          return Response.json(
            { error: { code: 'VERSION_CONFLICT', message: 'Changed.' } },
            { status: 412 },
          );
        const id = url.split('/').at(-2)!;
        server.prayers = server.prayers.map((item) =>
          item.id === id ? { ...item, status: 'praying', version: 2 } : item,
        );
        return Response.json({ data: detail(id) });
      }
      const one = url.match(/\/pastor\/prayers\/(\w+)$/);
      if (one) {
        if (server.held[one[1]!]) return server.held[one[1]!]!;
        return Response.json({ data: detail(one[1]!) });
      }
      return Response.json({ data: server.prayers });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

/** Lets pending requests and their follow-ups finish. */
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
const panel = () => screen.getByRole('dialog', { name: 'Prayer request' });

describe('Pastor prayer requests', () => {
  it('shows open requests first and filters by status', async () => {
    render(<PastorPrayers />);
    await settle();
    expect(screen.getByText('Anna Member')).toBeInTheDocument();
    expect(screen.queryByText('Ben Member')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Prayed for/ }));
    expect(screen.getByText('Ben Member')).toBeInTheDocument();
    expect(screen.queryByText('Anna Member')).toBeNull();
  });

  it('marks a request as praying with the version it loaded', async () => {
    render(<PastorPrayers />);
    await settle();
    await click(
      screen.getByRole('button', {
        name: 'Open prayer request from Anna Member',
      }),
    );
    expect(within(panel()).getByText('For healing')).toBeInTheDocument();
    await click(
      within(panel()).getByRole('button', { name: 'Mark as praying' }),
    );
    expect(server.writes[0]).toEqual({
      url: '/api/v1/pastor/prayers/p1/status',
      ifMatch: '"1"',
      body: { status: 'praying' },
    });
    expect(
      within(panel()).queryByRole('button', { name: 'Mark as praying' }),
    ).toBeNull();
    expect(
      within(panel()).getByRole('button', { name: 'Mark as prayed for' }),
    ).toBeInTheDocument();
  });

  it('a slow answer for an earlier request never replaces the open one', async () => {
    const slowA = later();
    server.held.p1 = slowA.promise;
    const view = render(<PastorPrayers />);
    await settle();
    await click(
      screen.getByRole('button', {
        name: 'Open prayer request from Anna Member',
      }),
    );
    // Before A's answer arrives, a notification for C is opened.
    route.search = 'prayer=p3';
    view.rerender(<PastorPrayers />);
    await settle();
    expect(within(panel()).getByText('For a new job')).toBeInTheDocument();
    slowA.release(Response.json({ data: detail('p1') }));
    await settle();
    expect(within(panel()).getByText('For a new job')).toBeInTheDocument();
    expect(within(panel()).queryByText('For healing')).toBeNull();
    await click(
      within(panel()).getByRole('button', { name: 'Mark as praying' }),
    );
    expect(server.writes.map((item) => item.url)).toEqual([
      '/api/v1/pastor/prayers/p3/status',
    ]);
  });

  it('a second notification on the same page retargets the panel', async () => {
    route.search = 'prayer=p1';
    const view = render(<PastorPrayers />);
    await settle();
    expect(within(panel()).getByText('anna@example.org')).toBeInTheDocument();
    route.search = 'prayer=p3';
    view.rerender(<PastorPrayers />);
    await settle();
    expect(within(panel()).getByText('cara@example.org')).toBeInTheDocument();
  });

  it('a conflict reloads the request instead of overwriting it', async () => {
    route.search = 'prayer=p1';
    server.conflict = true;
    render(<PastorPrayers />);
    await settle();
    await click(
      within(panel()).getByRole('button', { name: 'Mark as praying' }),
    );
    expect(server.writes).toHaveLength(1);
    expect(
      within(panel()).getByRole('button', { name: 'Mark as praying' }),
    ).toBeInTheDocument();
  });

  it('words typed while a note saves are kept, not cleared', async () => {
    route.search = 'prayer=p1';
    render(<PastorPrayers />);
    await settle();
    const box = () => within(panel()).getByLabelText('Add a note');
    fireEvent.change(box(), { target: { value: 'Called her' } });
    const saving = later();
    server.heldNote = saving.promise;
    await act(async () => {
      fireEvent.click(
        within(panel()).getByRole('button', { name: 'Add note' }),
      );
    });
    fireEvent.change(box(), { target: { value: 'Called her; visit Friday' } });
    saving.release(new Response(null));
    await settle();
    expect(server.writes.at(-1)?.body).toEqual({ text: 'Called her' });
    expect(box()).toHaveValue('Called her; visit Friday');

    // With nothing typed meanwhile, the saved words are cleared.
    fireEvent.change(box(), { target: { value: 'Second note' } });
    await click(within(panel()).getByRole('button', { name: 'Add note' }));
    expect(box()).toHaveValue('');
  });

  it('a note finishing after another request is opened leaves its draft alone', async () => {
    route.search = 'prayer=p1';
    const view = render(<PastorPrayers />);
    await settle();
    fireEvent.change(within(panel()).getByLabelText('Add a note'), {
      target: { value: 'Note for Anna' },
    });
    const saving = later();
    server.heldNote = saving.promise;
    await act(async () => {
      fireEvent.click(
        within(panel()).getByRole('button', { name: 'Add note' }),
      );
    });
    route.search = 'prayer=p3';
    view.rerender(<PastorPrayers />);
    await settle();
    expect(within(panel()).getByText('For a new job')).toBeInTheDocument();
    fireEvent.change(within(panel()).getByLabelText('Add a note'), {
      target: { value: 'Draft for Cara' },
    });
    saving.release(new Response(null));
    await settle();
    expect(server.writes.at(-1)).toMatchObject({
      url: '/api/v1/pastor/prayers/p1/notes',
      body: { text: 'Note for Anna' },
    });
    expect(within(panel()).getByText('For a new job')).toBeInTheDocument();
    expect(within(panel()).getByLabelText('Add a note')).toHaveValue(
      'Draft for Cara',
    );
  });

  it('a Home count link opens that list; another link switches it on the same page', async () => {
    route.search = 'prayers=prayed_for';
    const view = render(<PastorPrayers />);
    await settle();
    expect(screen.getByText('Ben Member')).toBeInTheDocument();
    expect(screen.queryByText('Anna Member')).toBeNull();
    route.search = 'prayers=submitted';
    view.rerender(<PastorPrayers />);
    await settle();
    expect(screen.getByText('Anna Member')).toBeInTheDocument();
    expect(screen.queryByText('Ben Member')).toBeNull();
  });

  it('closing a linked request keeps the list filter in the address', async () => {
    route.search = 'prayers=prayed_for&prayer=p2';
    render(<PastorPrayers />);
    await settle();
    await click(within(panel()).getByRole('button', { name: 'Close panel' }));
    expect(route.replace).toHaveBeenCalledWith(
      '/pastor/care?prayers=prayed_for',
    );
  });
});
