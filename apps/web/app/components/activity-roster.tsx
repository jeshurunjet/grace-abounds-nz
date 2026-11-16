'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDays,
  formatDate,
  formatTime,
  nzNow,
  occurrences,
  type ActivityException,
  type RosterEntry,
  type StaffActivity,
} from '@grace-abounds/validation';
import { KitConfirm } from './editor-kit/confirm';
import { useToast } from './toast';
import { api, errorMessage } from '../lib/api-client';

/*
 * Who has joined or booked (Phase 3B), inside the staff activity editor.
 * People book one date at a time, so a booked activity shows one date's
 * list (with how many are booked on each upcoming date); a group shows its
 * members. Removing someone cancels their place and is kept as history.
 */

const noun = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;
const when = (iso: string) =>
  iso
    ? new Date(iso).toLocaleDateString('en-NZ', {
        timeZone: 'Pacific/Auckland',
        day: 'numeric',
        month: 'short',
      })
    : '';

export function ActivityRoster({
  activity,
  exceptions,
}: {
  activity: StaffActivity;
  exceptions: ActivityException[];
}) {
  const { push } = useToast();
  const [entries, setEntries] = useState<RosterEntry[] | null>(null);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState('');
  const [removing, setRemoving] = useState<RosterEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const booking = activity.joinMode === 'booking';

  const load = useCallback(async () => {
    setError('');
    try {
      setEntries(
        (await api<RosterEntry[]>(`/staff/activities/${activity.id}/roster`))
          .data,
      );
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }, [activity.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const today = nzNow().date;
  const active = (entries ?? []).filter((item) => item.status === 'active');
  // Upcoming dates, plus any other date someone still holds a place on.
  const dates = useMemo(() => {
    if (!booking) return [];
    const coming = occurrences(
      [activity],
      exceptions.filter((item) => item.activityId === activity.id),
      today,
      addDays(today, 400),
    )
      .slice(0, 12)
      .map((item) => ({
        date: item.date,
        label: `${formatDate(item.date, true)} · ${formatTime(item.startTime)}${item.cancelled ? ' · cancelled' : ''}`,
      }));
    const held = [
      ...new Set(
        (entries ?? []).filter((item) => item.date).map((item) => item.date),
      ),
    ]
      .filter((date) => !coming.some((item) => item.date === date))
      .map((date) => ({ date, label: formatDate(date, true) }));
    return [...coming, ...held].sort((a, b) => a.date.localeCompare(b.date));
  }, [booking, activity, exceptions, entries, today]);

  if (activity.joinMode === 'none' && !entries?.length) return null;
  const date = booking ? chosen || dates[0]?.date || '' : '';
  const count = (forDate: string) =>
    active.filter((item) => item.date === forDate).length;
  const here = (entries ?? []).filter((item) => item.date === date);
  const people = here.filter((item) => item.status === 'active');
  const cancelled = here.filter((item) => item.status === 'cancelled');

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await api(`/staff/participations/${removing.id}`, { method: 'DELETE' });
      push(`${removing.name} was removed.`, 'info');
      setRemoving(null);
      await load();
    } catch (failure) {
      push(errorMessage(failure), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="activity-dates-editor activity-roster"
      aria-label="People"
    >
      <h3>People</h3>
      {error && (
        <p className="kit-error" role="alert">
          {error}{' '}
          <button
            type="button"
            className="button button-outline"
            onClick={() => void load()}
          >
            Try again
          </button>
        </p>
      )}
      {!entries && !error && <p className="kit-hint">Loading…</p>}
      {entries && booking && dates.length > 0 && (
        <label className="kit-field">
          <span>Date</span>
          <select
            value={date}
            onChange={(event) => setChosen(event.target.value)}
          >
            {dates.map((item) => (
              <option key={item.date} value={item.date}>
                {item.label} — {noun(count(item.date), 'booking', 'bookings')}
              </option>
            ))}
          </select>
        </label>
      )}
      {entries && (
        <>
          <p className="kit-hint">
            {booking
              ? date
                ? `${noun(people.length, 'person', 'people')} booked${activity.capacity != null ? ` of ${activity.capacity} places` : ''}.`
                : 'No upcoming dates.'
              : `${noun(people.length, 'person has', 'people have')} joined${activity.capacity != null ? ` (${activity.capacity} places)` : ''}.`}
          </p>
          {people.length > 0 && (
            <ul>
              {people.map((item) => (
                <li key={item.id}>
                  <span>
                    <strong>{item.name}</strong>{' '}
                    <small>
                      {item.email} · since {when(item.createdAt)}
                    </small>
                  </span>
                  <span className="activity-date-actions">
                    {(!item.date || item.date >= today) && (
                      <button
                        type="button"
                        className="button button-outline"
                        disabled={busy}
                        onClick={() => setRemoving(item)}
                      >
                        Remove
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {cancelled.length > 0 && (
            <details>
              <summary>
                {noun(cancelled.length, 'cancelled place', 'cancelled places')}
              </summary>
              <ul>
                {cancelled.map((item) => (
                  <li key={item.id}>
                    <span className="cancelled">{item.name}</span>
                    <small>cancelled {when(item.cancelledAt)}</small>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <KitConfirm
        open={!!removing}
        title={`Remove ${removing?.name ?? ''}?`}
        confirmLabel="Remove"
        onCancel={() => setRemoving(null)}
        onConfirm={() => void remove()}
      >
        <p>
          {removing?.date
            ? `Their booking for ${formatDate(removing.date, true)} is cancelled.`
            : `They are taken off ${activity.title}.`}{' '}
          It stays in the activity’s history.
        </p>
      </KitConfirm>
    </section>
  );
}
