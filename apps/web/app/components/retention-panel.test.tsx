import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RetentionPanel } from './retention-panel';

/*
 * Phase 5C: Records & retention shows due counts and what holds keep
 * back, says plainly when deleting isn't switched on, deletes only after a
 * confirmation (and "Confirm it's you" when needed), reports exactly what
 * was removed and kept, manages holds with the version shown, and ignores
 * late answers once another staff identity or role is signed in.
 */

const session = vi.hoisted(() => ({
  id: 'staff' as string | undefined,
  role: 'admin',
}));
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: session.id ? { user: { id: session.id, role: session.role } } : null,
  }),
}));
const toast = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('./toast', () => ({ useToast: () => ({ push: toast.push }) }));

const hold = {
  id: 'h1',
  userId: 'u1',
  subject: 'Deleted user',
  reason: 'claim',
  reference: 'Claim 2026-14',
  basis: 'Needed while a claim is resolved',
  reviewBy: '2027-02-01',
  overdue: false,
  placedAt: '2026-11-21T00:00:00.000Z',
  version: 3,
};
const server = vi.hoisted(() => ({
  enabled: true,
  recent: true,
  conflict: false,
  held: null as Promise<Response> | null,
  /** The next run stops part-way (500) after deleting one account. */
  runFails: false,
  lastRun: null as unknown,
  posts: [] as { url: string; ifMatch: string | null; body: unknown }[],
}));
const json = (data: unknown, status = 200) => Response.json(data, { status });
function later() {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => (release = resolve));
  return { promise, release };
}
const preview = () => ({
  enabled: server.enabled,
  auditRule:
    'Activity records are kept for the calendar year they were made in and all of the next calendar year.',
  auditCutoff: '2024-12-31T11:00:00.000Z',
  due: { deletedAccounts: 2, auditEvents: 40, deletionRecords: 1 },
  held: { deletedAccounts: 1, auditEvents: 5 },
  holds: { active: 1, overdue: 0 },
  lastRun: server.lastRun,
});
const runKeys = () =>
  server.posts
    .filter((post) => post.url.endsWith('/run'))
    .map((post) => (post.body as { requestKey: string }).requestKey);

beforeEach(() => {
  session.id = 'staff';
  session.role = 'admin';
  toast.push.mockClear();
  server.enabled = true;
  server.recent = true;
  server.conflict = false;
  server.held = null;
  server.runFails = false;
  server.lastRun = null;
  server.posts = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/account/reauth') {
        server.recent = true;
        return json({ data: { status: 'ok' } });
      }
      if (url === '/api/v1/me/security')
        return json({
          data: { email: 'staff@example.org', hasPassword: true },
        });
      if (init?.method === 'POST') {
        server.posts.push({
          url,
          ifMatch: new Headers(init.headers).get('if-match'),
          body: init.body ? JSON.parse(String(init.body)) : null,
        });
        if (server.held) return server.held;
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
        if (server.conflict)
          return json(
            { error: { code: 'VERSION_CONFLICT', message: 'Changed.' } },
            412,
          );
        if (url.endsWith('/retention/run') && server.runFails) {
          server.lastRun = {
            id: 'r1',
            status: 'failed',
            startedAt: '2026-11-21T00:00:00.000Z',
            finishedAt: '2026-11-21T00:00:01.000Z',
            attempts: 1,
            removed: { deletedAccounts: 1, auditEvents: 0, deletionRecords: 0 },
            held: { deletedAccounts: 0, auditEvents: 0 },
            more: false,
          };
          return json(
            {
              error: {
                code: 'INTERNAL',
                message: 'Something went wrong.',
              },
            },
            500,
          );
        }
        if (url.endsWith('/retention/run'))
          return json({
            data: {
              id: 'r1',
              status: 'done',
              attempts: 1,
              startedAt: '2026-11-21T00:00:00.000Z',
              finishedAt: '2026-11-21T00:00:01.000Z',
              removed: {
                deletedAccounts: 2,
                auditEvents: 40,
                deletionRecords: 1,
              },
              held: { deletedAccounts: 1, auditEvents: 5 },
              more: true,
            },
          });
        if (url.endsWith('/release'))
          return new Response(null, { status: 204 });
        return json({ data: hold });
      }
      if (url.endsWith('/staff/holds')) return json({ data: [hold] });
      return json({ data: preview() });
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
const runButton = () =>
  screen.getByRole('button', { name: 'Delete eligible records now' });

describe('records & retention', () => {
  it('shows due counts and what holds keep back; deleting needs a confirmation', async () => {
    render(<RetentionPanel />);
    await settle();
    expect(
      screen.getByText(/deleted accounts past their 30 days/),
    ).toBeTruthy();
    expect(screen.getByText(/Kept back by records holds: 1/)).toBeTruthy();
    await click(runButton());
    expect(server.posts).toHaveLength(0);
    const ask = screen.getByRole('alertdialog', {
      name: 'Delete eligible records now?',
    });
    expect(
      within(ask).getByText(/only records that are already due/),
    ).toBeTruthy();
    await click(
      within(ask).getByRole('button', { name: 'Delete eligible records' }),
    );
    expect(server.posts[0]!.url).toBe('/api/v1/staff/retention/run');
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Deleted 2 accounts, 40 activity records');
    expect(status).toHaveTextContent('Kept back by holds: 1 accounts');
    expect(status).toHaveTextContent('More records are due');
  });

  it('says plainly when deleting isn’t switched on, and offers no way to run it', async () => {
    server.enabled = false;
    render(<RetentionPanel />);
    await settle();
    expect(screen.getByText(/isn’t switched on yet/)).toBeTruthy();
    expect(runButton()).toBeDisabled();
  });

  it('asks to confirm it’s you when needed, then runs once', async () => {
    server.recent = false;
    render(<RetentionPanel />);
    await settle();
    await click(runButton());
    await click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete eligible records',
      }),
    );
    const reauth = screen.getByRole('dialog', { name: 'Confirm it’s you' });
    fireEvent.change(within(reauth).getByLabelText('Current password'), {
      target: { value: 'secret' },
    });
    await click(within(reauth).getByRole('button', { name: 'Confirm' }));
    // The retry after confirming is the same run (same request key).
    const keys = runKeys();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(screen.getByRole('status')).toHaveTextContent('Deleted 2 accounts');
  });

  it('a run that stops part-way shows exactly what it did; pressing again continues the same run', async () => {
    server.runFails = true;
    render(<RetentionPanel />);
    await settle();
    const confirm = async () => {
      await click(runButton());
      await click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'Delete eligible records',
        }),
      );
    };
    await confirm();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'pressing the button again continues the same clean-up',
    );
    // Never reported as success; the reloaded page shows the real counts.
    expect(screen.queryByRole('status')).toBeNull();
    expect(toast.push).not.toHaveBeenCalledWith(
      'Eligible records were deleted.',
      'success',
    );
    expect(screen.getByText(/Last run: failed/)).toHaveTextContent(
      'It deleted 1 accounts, 0 activity records',
    );
    server.runFails = false;
    await confirm();
    expect(screen.getByRole('status')).toHaveTextContent('Deleted 2 accounts');
    // The next press is a new run.
    await confirm();
    const keys = runKeys();
    expect(keys).toHaveLength(3);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('renews and releases holds with the version shown; a conflict reloads', async () => {
    render(<RetentionPanel />);
    await settle();
    expect(screen.getByText(/Claim 2026-14/)).toBeTruthy();
    await click(screen.getByRole('button', { name: 'New review date' }));
    const dialog = screen.getByRole('dialog', { name: /New review date/ });
    fireEvent.change(within(dialog).getByLabelText('Review by'), {
      target: { value: '2027-05-01' },
    });
    await click(
      within(dialog).getByRole('button', { name: 'Save review date' }),
    );
    expect(server.posts[0]).toEqual({
      url: '/api/v1/staff/holds/h1/renew',
      ifMatch: '"3"',
      body: { reviewBy: '2027-05-01' },
    });
    server.conflict = true;
    await click(screen.getByRole('button', { name: 'Release' }));
    await click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Release hold',
      }),
    );
    expect(server.posts[1]).toMatchObject({
      url: '/api/v1/staff/holds/h1/release',
      ifMatch: '"3"',
    });
    expect(screen.getByRole('alert')).toHaveTextContent('has been reloaded');
  });

  it('a run finishing after another staff identity or role signs in shows nothing to them', async () => {
    for (const change of ['account', 'role'] as const) {
      session.id = 'staff';
      session.role = 'admin';
      toast.push.mockClear();
      const held = later();
      server.held = held.promise;
      const page = render(<RetentionPanel />);
      await settle();
      await click(runButton());
      await click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'Delete eligible records',
        }),
      );
      if (change === 'account') session.id = 'other';
      else session.role = 'pastor';
      server.held = null;
      page.rerender(<RetentionPanel />);
      await settle();
      held.release(
        json({
          data: {
            id: 'r1',
            status: 'done',
            startedAt: '',
            finishedAt: '',
            removed: { deletedAccounts: 9, auditEvents: 9, deletionRecords: 9 },
            held: { deletedAccounts: 0, auditEvents: 0 },
            more: false,
          },
        }),
      );
      await settle();
      expect(screen.queryByRole('status')).toBeNull();
      expect(toast.push).not.toHaveBeenCalled();
      page.unmount();
    }
  });

  it('shows nothing to members or when signed out', () => {
    session.role = 'member';
    const page = render(<RetentionPanel />);
    expect(screen.queryByText(/Due for deletion/)).toBeNull();
    session.id = undefined;
    page.rerender(<RetentionPanel />);
    expect(screen.queryByText(/Due for deletion/)).toBeNull();
  });
});
