'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from './toast';
import { api, errorMessage } from '../lib/api-client';

/*
 * Google Calendar sync state for staff (Phase 3C). Saving in the app never
 * waits for Google: this shows whether the public calendar has caught up,
 * why not if it hasn't, and lets staff try again.
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

function useSyncState() {
  const [state, setState] = useState<SyncState | null>(null);
  // Status is informative only: an error or an unexpected answer shows
  // nothing, and the calendar itself keeps working.
  const accept = useCallback((data: unknown) => {
    const value = data as Partial<SyncState> | null;
    if (
      value &&
      typeof value.configured === 'boolean' &&
      Array.isArray(value.items)
    )
      setState(value as SyncState);
  }, []);
  const load = useCallback(async () => {
    try {
      accept((await api<SyncState>('/staff/calendar-sync')).data);
    } catch {
      // Left as it was.
    }
  }, [accept]);
  useEffect(() => {
    void load();
  }, [load]);
  return { state, setState: accept, load };
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
}: {
  activityId: string;
  /** Published and live: Google should have its dates. */
  isPublic: boolean;
}) {
  const { push } = useToast();
  const { state, setState } = useSyncState();
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  const item = state.items.find((entry) => entry.activityId === activityId);
  if (!item && !isPublic) return null;

  async function retry() {
    setBusy(true);
    try {
      setState(
        (
          await api<SyncState>(`/staff/calendar-sync/${activityId}/retry`, {
            method: 'POST',
          })
        ).data,
      );
      push('It will be sent to Google Calendar again shortly.', 'info');
    } catch (failure) {
      push(errorMessage(failure), 'error');
    } finally {
      setBusy(false);
    }
  }

  let text: string;
  if (!state.configured)
    text =
      'Google Calendar isn’t connected yet. Public dates will be sent once it is.';
  else if (!item || item.status === 'pending')
    text = 'Google Calendar: sending the latest changes…';
  else if (item.status === 'synced')
    text = `Google Calendar: up to date${item.syncedAt ? ` (sent ${ago(item.syncedAt)})` : ''}.`;
  else text = `Google Calendar: not sent yet. ${item.lastError}`;

  return (
    <p
      className={`kit-hint calendar-sync is-${!state.configured ? 'off' : (item?.status ?? 'pending')}`}
      role={item?.status === 'failed' ? 'alert' : undefined}
    >
      {text}{' '}
      {state.configured && item?.status === 'failed' && (
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
  const { state, setState } = useSyncState();
  const [busy, setBusy] = useState(false);
  const failed =
    state?.configured &&
    state.items.filter((item) => item.status === 'failed').length;
  if (!failed) return null;

  async function retryAll() {
    setBusy(true);
    try {
      setState(
        (
          await api<SyncState>('/staff/calendar-sync/retry', {
            method: 'POST',
          })
        ).data,
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
