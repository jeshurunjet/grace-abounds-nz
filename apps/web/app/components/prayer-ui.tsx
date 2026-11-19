'use client';
import {
  prayerStatusLabels,
  type PrayerHistoryEntry,
  type PrayerStatus,
} from '@grace-abounds/validation';

/* Shared pieces of the member and Pastor prayer screens (Phase 4A). */

export const careDate = (iso: string, withTime = true) =>
  new Date(iso).toLocaleString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime && { hour: 'numeric', minute: '2-digit' }),
  });

export function PrayerBadge({ status }: { status: PrayerStatus }) {
  return (
    <span className={`care-badge is-${status}`}>
      {prayerStatusLabels[status]}
    </span>
  );
}

/** When each status was reached, oldest first. */
export function PrayerHistory({ history }: { history: PrayerHistoryEntry[] }) {
  return (
    <ol className="care-history" aria-label="History">
      {history.map((entry) => (
        <li
          key={`${entry.status}-${entry.at}`}
          className={`is-${entry.status}`}
        >
          <b>{prayerStatusLabels[entry.status]}</b>
          <time dateTime={entry.at}>{careDate(entry.at)}</time>
        </li>
      ))}
    </ol>
  );
}
