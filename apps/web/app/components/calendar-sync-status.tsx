'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from './toast';
import { api, errorMessage } from '../lib/api-client';

/*
 * Google Calendar sync state for staff (Phase 3C). Saving in the app never
 * waits for Google: this shows whether the public calendar has caught up,
 * why not if it hasn't, and lets staff try again. It refreshes after a
 * confirmed change, every few seconds while something is on its way, every
 * 30 seconds otherwise while the page is visible, and when the tab returns.
 */

type SyncState = {
  configured: boolean;
  items: {
    activityId: string;
    status: 'pending' | 'synced' | 'failed';
    lastError: string;
    syncedAt: string;
  }[];
};

const FAST_MS = 4_000;
const SLOW_MS = 30_000;

/**
 * The server's sync state. `version` is the activity version the editor
 * last saved: an answer only counts as current ("fresh") if it was asked
 * for after that save, so "up to date" is never shown for an older version.
 */
function useSyncState(
  version: number | undefined,
  isBusy: (state: SyncState | null, fresh: boolean) => boolean,
) {
  const [state, setState] = useState<SyncState | null>(null);
  const [freshFor, setFreshFor] = useState<number | undefined>(undefined);
  const latest = useRef(version);
  latest.current = version;
  const running = useRef(false);
  const again = useRef(false);
  const alive = useRef(true);
  // Set on every mount: StrictMode mounts, unmounts and mounts again.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Status is informative only: an error or an unexpected answer leaves
  // what was shown, and the calendar itself keeps working.
  const accept = useCallback((data: unknown, asked: number | undefined) => {
    const value = data as Partial<SyncState> | null;
    if (
      alive.current &&
      value &&
      typeof value.configured === 'boolean' &&
      Array.isArray(value.items)
    ) {
      setState(value as SyncState);
      setFreshFor(asked);
    }
  }, []);

  // One request at a time; a refresh asked for meanwhile runs right after.
  const load = useCallback(async () => {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        const asked = latest.current;
        try {
          accept((await api<SyncState>('/staff/calendar-sync')).data, asked);
        } catch {
          // Left as it was; the next refresh tries again.
        }
      } while (again.current && alive.current);
    } finally {
      running.current = false;
    }
  }, [accept]);

  // After every confirmed change (a new version), ask again.
  useEffect(() => {
    void load();
  }, [load, version]);

  const fresh = freshFor === version;
  const busy = isBusy(state, fresh);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'hidden') void load();
    };
    const timer = window.setInterval(refresh, busy ? FAST_MS : SLOW_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load, busy]);

  return { state, fresh, accept };
}

const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(iso).toLocaleString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

/** One activity's state, in its editor. */
export function CalendarSyncStatus({
  activityId,
  isPublic,
  version,
}: {
  activityId: string;
  /** Published and live: Google should have its dates. */
  isPublic: boolean;
  /** The activity version last saved in this editor. */
  version: number;
}) {
  const { push } = useToast();
  const { state, fresh, accept } = useSyncState(version, (current, isFresh) => {
    if (!current?.configured) return false;
    const item = current.items.find((entry) => entry.activityId === activityId);
    return !isFresh || (item ? item.status === 'pending' : isPublic);
  });
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  const item = state.items.find((entry) => entry.activityId === activityId);
  // Not public and nothing left in Google: nothing to report.
  if (!isPublic && fresh && (!item || item.status === 'synced')) return null;

  async function retry() {
    setBusy(true);
    try {
      accept(
        (
          await api<SyncState>(`/staff/calendar-sync/${activityId}/retry`, {
            method: 'POST',
          })
        ).data,
        version,
      );
      push('It will be sent to Google Calendar again shortly.', 'info');
    } catch (failure) {
      push(errorMessage(failure), 'error');
    } finally {
      setBusy(false);
    }
  }

  const status = !fresh ? 'pending' : (item?.status ?? 'pending');
  let text: string;
  if (!state.configured)
    text =
      'Google Calendar isn’t connected yet. Public dates will be sent once it is.';
  else if (status === 'pending')
    text = 'Google Calendar: sending the latest changes…';
  else if (status === 'synced')
    text = `Google Calendar: up to date${item?.syncedAt ? ` (sent ${ago(item.syncedAt)})` : ''}.`;
  else text = `Google Calendar: not sent yet. ${item?.lastError ?? ''}`;

  return (
    <p
      className={`kit-hint calendar-sync is-${!state.configured ? 'off' : status}`}
      role={status === 'failed' ? 'alert' : undefined}
    >
      {text}{' '}
      {state.configured && status === 'failed' && (
        <button
          type="button"
          className="button button-outline"
          disabled={busy}
          onClick={() => void retry()}
        >
          Try again
        </button>
      )}
    </p>
  );
}

/** A note above the staff calendar when anything couldn't be sent. */
export function CalendarSyncBanner() {
  const { push } = useToast();
  const { state, accept } = useSyncState(
    undefined,
    (current) => !!current?.items.some((item) => item.status === 'pending'),
  );
  const [busy, setBusy] = useState(false);
  const failed =
    state?.configured &&
    state.items.filter((item) => item.status === 'failed').length;
  if (!failed) return null;

  async function retryAll() {
    setBusy(true);
    try {
      accept(
        (
          await api<SyncState>('/staff/calendar-sync/retry', {
            method: 'POST',
          })
        ).data,
        undefined,
      );
      push('They will be sent to Google Calendar again shortly.', 'info');
    } catch (failure) {
      push(errorMessage(failure), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <p className="calendar-sync-banner" role="status">
      {failed === 1
        ? '1 activity couldn’t be sent to Google Calendar.'
        : `${failed} activities couldn’t be sent to Google Calendar.`}{' '}
      Open one to see why, or{' '}
      <button
        type="button"
        className="button button-outline"
        disabled={busy}
        onClick={() => void retryAll()}
      >
        try again
      </button>
    </p>
  );
}
