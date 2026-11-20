import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataExportPanel } from './data-export';

/*
 * Phase 5B: "Download your data" shows the server's real export state,
 * requests one (confirming it's you when the server asks), downloads
 * through a fresh short-lived link, reports limits and expiry truthfully,
 * and ignores late answers once a different account is signed in.
 */

const session = vi.hoisted(() => ({ id: 'anna' as string | undefined }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: session.id ? { user: { id: session.id, role: 'member' } } : null,
  }),
}));
const toast = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('./toast', () => ({ useToast: () => ({ push: toast.push }) }));
const opened = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock('../lib/open-download', () => ({
  openDownload: (url: string) => opened.urls.push(url),
}));

type Item = {
  id: string;
  status: string;
  createdAt: string;
  readyAt: string;
  expiresAt: string;
  size: number;
};
const item = (status: string, extra: Partial<Item> = {}): Item => ({
  id: 'e1',
  status,
  createdAt: '2026-11-20T00:00:00.000Z',
  readyAt: status === 'ready' ? '2026-11-20T00:01:00.000Z' : '',
  expiresAt: status === 'ready' ? '2026-11-27T00:01:00.000Z' : '',
  size: 1200,
  ...extra,
});
const server = vi.hoisted(() => ({
  list: [] as Record<string, unknown>[],
  recent: true,
  posts: [] as string[],
  limit: false,
  heldDownload: null as Promise<Response> | null,
}));
function later() {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => (release = resolve));
  return { promise, release };
}
const json = (data: unknown, status = 200) => Response.json(data, { status });
const reauthNeeded = () =>
  json(
    {
      error: {
        code: 'REAUTH_REQUIRED',
        message: 'For your security, confirm it’s you first.',
      },
    },
    403,
  );

beforeEach(() => {
  session.id = 'anna';
  toast.push.mockClear();
  opened.urls = [];
  server.list = [];
  server.recent = true;
  server.posts = [];
  server.limit = false;
  server.heldDownload = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/account/reauth') {
        server.recent = true;
        return json({ data: { status: 'ok' } });
      }
      if (url === '/api/v1/me/security')
        return json({ data: { email: 'anna@example.org', hasPassword: true } });
      if (init?.method === 'POST') {
        server.posts.push(url);
        if (!server.recent) return reauthNeeded();
        if (url.endsWith('/download')) {
          if (server.heldDownload) return server.heldDownload;
          return json({
            data: {
              url: 'https://storage.test/export',
              expiresAt: '2026-11-20T00:06:00.000Z',
            },
          });
        }
        if (server.limit)
          return json(
            {
              error: {
                code: 'EXPORT_LIMIT',
                message: 'You can request up to 3 exports a day.',
              },
            },
            429,
          );
        server.list = [item('queued')];
        return json({ data: server.list[0] }, 202);
      }
      return json({ data: server.list });
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
const reauthBox = () =>
  screen.getByRole('dialog', { name: 'Confirm it’s you' });

describe('data export', () => {
  it('requests an export and shows it being prepared', async () => {
    render(<DataExportPanel />);
    await settle();
    expect(screen.getByText(/ready to download for 7 days/)).toBeTruthy();
    expect(
      screen.getByText(/never includes other people’s details/),
    ).toBeTruthy();
    await click(screen.getByRole('button', { name: 'Request export' }));
    expect(server.posts).toEqual(['/api/v1/me/exports']);
    expect(screen.getByText(/being prepared/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Request export' }),
    ).toBeDisabled();
  });

  it('asks to confirm it’s you when the server requires it, then retries once', async () => {
    server.recent = false;
    render(<DataExportPanel />);
    await settle();
    await click(screen.getByRole('button', { name: 'Request export' }));
    expect(server.posts).toHaveLength(1);
    fireEvent.change(within(reauthBox()).getByLabelText('Current password'), {
      target: { value: 'secret-password' },
    });
    await click(within(reauthBox()).getByRole('button', { name: 'Confirm' }));
    expect(
      screen.queryByRole('dialog', { name: 'Confirm it’s you' }),
    ).toBeNull();
    expect(server.posts).toHaveLength(2);
    expect(screen.getByText(/being prepared/)).toBeTruthy();
  });

  it('downloads a ready export through a fresh link', async () => {
    server.list = [item('ready')];
    render(<DataExportPanel />);
    await settle();
    expect(screen.getByText(/download it until/)).toBeTruthy();
    await click(screen.getByRole('button', { name: 'Download' }));
    expect(server.posts).toEqual(['/api/v1/me/exports/e1/download']);
    expect(opened.urls).toEqual(['https://storage.test/export']);
  });

  it('expired and failed exports can be requested again; limits are explained', async () => {
    server.list = [item('expired')];
    const page = render(<DataExportPanel />);
    await settle();
    expect(screen.getByText(/has expired/)).toBeTruthy();
    server.limit = true;
    await click(screen.getByRole('button', { name: 'Request export' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'up to 3 exports a day',
    );
    page.unmount();

    server.list = [item('failed')];
    render(<DataExportPanel />);
    await settle();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('a download link arriving after another person signs in is never opened', async () => {
    server.list = [item('ready')];
    const held = later();
    server.heldDownload = held.promise;
    const page = render(<DataExportPanel />);
    await settle();
    await click(screen.getByRole('button', { name: 'Download' }));
    session.id = 'ben';
    server.list = [];
    page.rerender(<DataExportPanel />);
    await settle();
    held.release(
      json({ data: { url: 'https://storage.test/anna', expiresAt: '' } }),
    );
    await settle();
    expect(opened.urls).toEqual([]);
    expect(screen.getByRole('button', { name: 'Request export' })).toBeTruthy();
  });
});
