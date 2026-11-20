import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationSettings } from './notification-settings';

/*
 * Phase 5A: notification choices load from the server, change only as a
 * draft until Save, send the version shown, keep the draft on a conflict
 * or failure, state that security emails are always sent, and belong to
 * one signed-in account (late answers for a previous one are ignored).
 */

const session = vi.hoisted(() => ({ id: 'anna' as string | undefined }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: session.id ? { user: { id: session.id, role: 'member' } } : null,
  }),
}));
const toast = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('./toast', () => ({ useToast: () => ({ push: toast.push }) }));

type Prefs = { emailCare: boolean; emailAccount: boolean; version: number };
const server = vi.hoisted(() => ({
  saved: {} as Record<string, Prefs>,
  puts: [] as { body: unknown; ifMatch: string | null }[],
  fail: '' as '' | 'conflict' | 'error',
  heldGet: null as Promise<Response> | null,
  heldPut: null as Promise<Response> | null,
  gets: 0,
}));
function later() {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => (release = resolve));
  return { promise, release };
}
const json = (data: unknown, status = 200) => Response.json(data, { status });

beforeEach(() => {
  session.id = 'anna';
  toast.push.mockClear();
  server.saved = {
    anna: { emailCare: false, emailAccount: false, version: 1 },
    ben: { emailCare: true, emailAccount: true, version: 4 },
  };
  server.puts = [];
  server.fail = '';
  server.heldGet = null;
  server.heldPut = null;
  server.gets = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const who = session.id!;
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        server.puts.push({
          body,
          ifMatch: new Headers(init.headers).get('if-match'),
        });
        if (server.heldPut) await server.heldPut;
        if (server.fail === 'conflict') {
          server.fail = '';
          server.saved[who] = {
            emailCare: false,
            emailAccount: true,
            version: server.saved[who]!.version + 1,
          };
          return json(
            { error: { code: 'VERSION_CONFLICT', message: 'Changed.' } },
            412,
          );
        }
        if (server.fail === 'error')
          return json(
            { error: { code: 'SERVER', message: 'Couldn’t save.' } },
            500,
          );
        server.saved[who] = {
          ...body,
          version: server.saved[who]!.version + 1,
        };
        return json({ data: server.saved[who] });
      }
      server.gets++;
      if (server.heldGet) return server.heldGet;
      return json({ data: server.saved[who] });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const settle = () =>
  act(async () => {
    for (let turn = 0; turn < 5; turn++)
      await new Promise((resolve) => setTimeout(resolve, 0));
  });
const care = () =>
  screen.getByRole('switch', { name: 'Email prayer and appointment updates' });
const account = () =>
  screen.getByRole('switch', { name: 'Email account updates' });
const saveButton = () => screen.getByRole('button', { name: 'Save' });
const save = async () => {
  await act(async () => {
    fireEvent.click(saveButton());
  });
  await settle();
};

describe('notification settings', () => {
  it('saves a draft explicitly with the version shown', async () => {
    render(<NotificationSettings />);
    await settle();
    expect(care()).toHaveAttribute('aria-checked', 'false');
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(/Security emails .* are always sent/)).toBeTruthy();
    expect(
      screen.getByText(/push notifications aren’t available/),
    ).toBeTruthy();
    fireEvent.click(care());
    expect(server.puts).toHaveLength(0);
    expect(saveButton()).toBeEnabled();
    await save();
    expect(server.puts).toEqual([
      { body: { emailCare: true, emailAccount: false }, ifMatch: '"1"' },
    ]);
    expect(care()).toHaveAttribute('aria-checked', 'true');
    expect(saveButton()).toBeDisabled();
    expect(toast.push).toHaveBeenCalledWith(
      'Notification settings saved.',
      'success',
    );
  });

  it('Undo changes restores the saved choices without saving', async () => {
    render(<NotificationSettings />);
    await settle();
    fireEvent.click(account());
    fireEvent.click(screen.getByRole('button', { name: 'Undo changes' }));
    expect(account()).toHaveAttribute('aria-checked', 'false');
    expect(server.puts).toHaveLength(0);
  });

  it('a conflict reloads the saved choices and keeps the draft; the next save uses the new version', async () => {
    render(<NotificationSettings />);
    await settle();
    fireEvent.click(care());
    server.fail = 'conflict';
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'changed on another device',
    );
    expect(care()).toHaveAttribute('aria-checked', 'true');
    await save();
    expect(server.puts.at(-1)).toEqual({
      body: { emailCare: true, emailAccount: false },
      ifMatch: '"2"',
    });
  });

  it('a failed save keeps the draft and says so', async () => {
    render(<NotificationSettings />);
    await settle();
    fireEvent.click(care());
    server.fail = 'error';
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t save.');
    expect(care()).toHaveAttribute('aria-checked', 'true');
    expect(toast.push).not.toHaveBeenCalled();
  });

  it('a different sign-in starts fresh; late answers for the previous account are ignored', async () => {
    const annaLoad = later();
    server.heldGet = annaLoad.promise;
    const page = render(<NotificationSettings />);
    await settle();
    server.heldGet = null;
    session.id = 'ben';
    page.rerender(<NotificationSettings />);
    await settle();
    expect(care()).toHaveAttribute('aria-checked', 'true');
    annaLoad.release(
      json({ data: { emailCare: false, emailAccount: false, version: 1 } }),
    );
    await settle();
    expect(care()).toHaveAttribute('aria-checked', 'true');

    // A save finishing after another sign-in shows nothing on the new screen.
    fireEvent.click(account());
    const held = later();
    server.heldPut = held.promise;
    await save();
    session.id = 'anna';
    page.rerender(<NotificationSettings />);
    await settle();
    held.release(new Response());
    server.heldPut = null;
    await settle();
    expect(toast.push).not.toHaveBeenCalled();
    expect(care()).toHaveAttribute('aria-checked', 'false');
  });

  it('shows nothing when signed out', () => {
    session.id = undefined;
    render(<NotificationSettings />);
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
