import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDeletionPanel } from './account-deletion';

/*
 * Phase 5C: deleting your own account. It explains what happens, needs
 * DELETE typed and a recent sign-in ("Confirm it's you", then one retry),
 * signs out only after the server removed access, shows plainly when
 * deletion isn't switched on, isn't offered to staff, and ignores a late
 * answer after another person signs in.
 */

const session = vi.hoisted(() => ({
  id: 'anna' as string | undefined,
  role: 'member',
  signOut: vi.fn(),
}));
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: session.id ? { user: { id: session.id, role: session.role } } : null,
  }),
  signOut: (options: unknown) => session.signOut(options),
}));

const server = vi.hoisted(() => ({
  mode: 'ok' as 'ok' | 'reauth' | 'off',
  posts: [] as unknown[],
  held: null as Promise<Response> | null,
}));
const json = (data: unknown, status = 200) => Response.json(data, { status });
function later() {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => (release = resolve));
  return { promise, release };
}

beforeEach(() => {
  session.id = 'anna';
  session.role = 'member';
  session.signOut.mockReset();
  server.mode = 'ok';
  server.posts = [];
  server.held = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/account/reauth') {
        server.mode = 'ok';
        return json({ data: { status: 'ok' } });
      }
      if (url === '/api/v1/me/security')
        return json({ data: { email: 'anna@example.org', hasPassword: true } });
      server.posts.push(JSON.parse(String(init?.body)));
      if (server.held) return server.held;
      if (server.mode === 'reauth')
        return json(
          {
            error: {
              code: 'REAUTH_REQUIRED',
              message: 'For your security, confirm it’s you first.',
            },
          },
          403,
        );
      if (server.mode === 'off')
        return json(
          {
            error: {
              code: 'DELETION_UNAVAILABLE',
              message: 'Account deletion isn’t switched on yet.',
            },
          },
          503,
        );
      return json({
        data: {
          via: 'self',
          requestedAt: '2026-11-21T00:00:00.000Z',
          purgeAfter: '2026-12-21T00:00:00.000Z',
          purgedAt: '',
        },
      });
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
const confirmBox = () =>
  screen.getByRole('alertdialog', { name: 'Delete your account?' });
const openAndType = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
  fireEvent.change(
    within(confirmBox()).getByLabelText('Type DELETE to confirm'),
    {
      target: { value: 'DELETE' },
    },
  );
};

describe('delete your account', () => {
  it('explains what happens and needs DELETE typed; signs out once access is removed', async () => {
    render(<AccountDeletionPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    expect(within(confirmBox()).getByText(/can’t be undone/)).toBeTruthy();
    expect(within(confirmBox()).getByText(/30 days/)).toBeTruthy();
    // Removal is due after 30 days, not promised on an exact date; a
    // records hold is described, and access ends at once.
    const effects = within(confirmBox()).getByText(/30 days/);
    expect(effects).toHaveTextContent('become due for removal');
    expect(effects).toHaveTextContent('only while that need is reviewed');
    expect(effects).toHaveTextContent('signed out everywhere straight away');
    expect(effects).not.toHaveTextContent('removed for good');
    const confirm = within(confirmBox()).getByRole('button', {
      name: 'Delete my account',
    });
    expect(confirm).toBeDisabled();
    fireEvent.change(
      within(confirmBox()).getByLabelText('Type DELETE to confirm'),
      {
        target: { value: 'delete' },
      },
    );
    expect(confirm).toBeDisabled();
    fireEvent.change(
      within(confirmBox()).getByLabelText('Type DELETE to confirm'),
      {
        target: { value: 'DELETE' },
      },
    );
    await click(confirm);
    expect(server.posts).toEqual([{ confirm: 'DELETE' }]);
    expect(session.signOut).toHaveBeenCalledWith({
      callbackUrl: '/login?deleted=1',
    });
  });

  it('asks to confirm it’s you when needed, then retries once', async () => {
    server.mode = 'reauth';
    render(<AccountDeletionPanel />);
    openAndType();
    await click(
      within(confirmBox()).getByRole('button', { name: 'Delete my account' }),
    );
    expect(session.signOut).not.toHaveBeenCalled();
    const reauth = screen.getByRole('dialog', { name: 'Confirm it’s you' });
    fireEvent.change(within(reauth).getByLabelText('Current password'), {
      target: { value: 'secret-password' },
    });
    await click(within(reauth).getByRole('button', { name: 'Confirm' }));
    expect(server.posts).toHaveLength(2);
    expect(session.signOut).toHaveBeenCalledTimes(1);
  });

  it('says so plainly when deletion isn’t switched on; nothing happens', async () => {
    server.mode = 'off';
    render(<AccountDeletionPanel />);
    openAndType();
    await click(
      within(confirmBox()).getByRole('button', { name: 'Delete my account' }),
    );
    expect(within(confirmBox()).getByRole('alert')).toHaveTextContent(
      'isn’t switched on yet',
    );
    expect(session.signOut).not.toHaveBeenCalled();
  });

  it('isn’t offered to staff accounts', () => {
    session.role = 'pastor';
    render(<AccountDeletionPanel />);
    expect(
      screen.getByRole('button', { name: 'Delete account' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Staff accounts can’t be deleted here/),
    ).toBeTruthy();
  });

  it('a late answer after another person signs in never signs anyone out', async () => {
    const held = later();
    server.held = held.promise;
    const page = render(<AccountDeletionPanel />);
    openAndType();
    await click(
      within(confirmBox()).getByRole('button', { name: 'Delete my account' }),
    );
    session.id = 'ben';
    page.rerender(<AccountDeletionPanel />);
    await settle();
    held.release(json({ data: { purgeAfter: '' } }));
    await settle();
    expect(session.signOut).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('the same account becoming staff drops the open confirmation and ignores a late answer', async () => {
    const held = later();
    server.held = held.promise;
    const page = render(<AccountDeletionPanel />);
    openAndType();
    await click(
      within(confirmBox()).getByRole('button', { name: 'Delete my account' }),
    );
    // Same id, new role (for example after the operator's staff:add).
    session.role = 'admin';
    page.rerender(<AccountDeletionPanel />);
    await settle();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Delete account' }),
    ).toBeDisabled();
    held.release(
      json(
        {
          error: {
            code: 'REAUTH_REQUIRED',
            message: 'For your security, confirm it’s you first.',
          },
        },
        403,
      ),
    );
    await settle();
    expect(session.signOut).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('dialog', { name: 'Confirm it’s you' }),
    ).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
