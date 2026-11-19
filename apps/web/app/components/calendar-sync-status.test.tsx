import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarSyncStatus } from './calendar-sync-status';

/*
 * Phase 3C review: the editor's Google Calendar line follows the server
 * without closing and reopening: a save shows "sending" until the server
 * answers for that save, then "up to date" once the worker finishes; a
 * failure → Try again → completion is followed the same way.
 */

type Item = {
  activityId: string;
  status: string;
  lastError: string;
  syncedAt: string;
};
const server = vi.hoisted(() => ({
  item: null as Item | null,
  requests: [] as string[],
}));
const item = (status: string, lastError = ''): Item => ({
  activityId: 'night',
  status,
  lastError,
  syncedAt: status === 'synced' ? new Date().toISOString() : '',
});
const reply = () =>
  Response.json({
    data: { configured: true, items: server.item ? [server.item] : [] },
  });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  server.requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      server.requests.push(`${init?.method ?? 'GET'} ${url}`);
      if (init?.method === 'POST') server.item = item('pending');
      return reply();
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe('Google Calendar status in the editor', () => {
  it('a save shows sending, then up to date when the worker finishes', async () => {
    server.item = item('synced');
    const view = render(
      <CalendarSyncStatus activityId="night" isPublic version={1} />,
    );
    await settle();
    expect(screen.getByText(/up to date/)).toBeInTheDocument();

    // Saved: the old "up to date" is not shown for the new version.
    server.item = item('pending');
    view.rerender(
      <CalendarSyncStatus activityId="night" isPublic version={2} />,
    );
    expect(screen.getByText(/sending the latest changes/)).toBeInTheDocument();
    await settle();
    expect(screen.getByText(/sending the latest changes/)).toBeInTheDocument();

    // The worker finishes; the next refresh shows it, no reopening needed.
    server.item = item('synced');
    await wait(4_000);
    expect(screen.getByText(/up to date/)).toBeInTheDocument();
  });

  it('a failure, Try again, then completion are followed live', async () => {
    server.item = item('failed', 'Google Calendar create failed (503).');
    render(<CalendarSyncStatus activityId="night" isPublic version={1} />);
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent(/not sent yet.*503/);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(server.requests).toContain(
      'POST /api/v1/staff/calendar-sync/night/retry',
    );
    expect(screen.getByText(/sending the latest changes/)).toBeInTheDocument();

    server.item = item('synced');
    await wait(4_000);
    expect(screen.getByText(/up to date/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('works under StrictMode, where effects run twice', async () => {
    server.item = item('synced');
    render(
      <StrictMode>
        <CalendarSyncStatus activityId="night" isPublic version={1} />
      </StrictMode>,
    );
    await settle();
    expect(screen.getByText(/up to date/)).toBeInTheDocument();
  });

  it('an answer asked for before a save never marks that save up to date', async () => {
    let answerOld!: () => void;
    const oldAnswer = new Promise<void>((resolve) => (answerOld = resolve));
    let first = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        server.requests.push(`GET ${url}`);
        if (first) {
          // Asked before the save; answers "up to date" only afterwards.
          first = false;
          await oldAnswer;
          return Response.json({
            data: { configured: true, items: [item('synced')] },
          });
        }
        return reply();
      }),
    );
    const view = render(
      <CalendarSyncStatus activityId="night" isPublic version={1} />,
    );
    await settle();
    server.item = item('pending');
    view.rerender(
      <CalendarSyncStatus activityId="night" isPublic version={2} />,
    );
    answerOld();
    await settle();
    expect(screen.getByText(/sending the latest changes/)).toBeInTheDocument();
    expect(screen.queryByText(/up to date/)).toBeNull();
    // The save's own question was asked once the old one finished.
    expect(server.requests).toHaveLength(2);

    server.item = item('synced');
    await wait(4_000);
    expect(screen.getByText(/up to date/)).toBeInTheDocument();
  });

  it('asks again when the tab comes back, one request at a time', async () => {
    server.item = item('synced');
    render(<CalendarSyncStatus activityId="night" isPublic version={1} />);
    await settle();
    const before = server.requests.length;
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();
    // Two quick returns: at most one request now plus one queued after it.
    expect(server.requests.length - before).toBeLessThanOrEqual(2);
    expect(server.requests.length - before).toBeGreaterThanOrEqual(1);
  });
});
