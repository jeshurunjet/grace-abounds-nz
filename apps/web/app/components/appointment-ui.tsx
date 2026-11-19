'use client';
import {
  appointmentStatusLabels,
  type AppointmentHistoryEntry,
  type AppointmentStatus,
} from '@grace-abounds/validation';
import { careDate } from './prayer-ui';

/* Shared pieces of the member and staff appointment screens (Phase 4B). */

const zone = 'Pacific/Auckland';
/** "Tue 24 Nov 2026, 10:00am–10:30am", in New Zealand time. */
export function slotText(startsAt: string, endsAt: string) {
  if (!startsAt) return '';
  const start = new Date(startsAt);
  const day = start.toLocaleDateString('en-NZ', {
    timeZone: zone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = (value: Date) =>
    value
      .toLocaleTimeString('en-NZ', {
        timeZone: zone,
        hour: 'numeric',
        minute: '2-digit',
      })
      .replace(/\s/g, '');
  return `${day}, ${time(start)}${endsAt ? `–${time(new Date(endsAt))}` : ''}`;
}

export function AppointmentBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span className={`care-badge is-${status}`}>
      {appointmentStatusLabels[status]}
    </span>
  );
}

export function AppointmentHistory({
  history,
}: {
  history: AppointmentHistoryEntry[];
}) {
  return (
    <ol className="care-history" aria-label="History">
      {history.map((entry) => (
        <li
          key={`${entry.status}-${entry.at}`}
          className={`is-${entry.status}`}
        >
          <b>{appointmentStatusLabels[entry.status]}</b>
          <time dateTime={entry.at}>{careDate(entry.at)}</time>
          {entry.startsAt && (
            <small>for {slotText(entry.startsAt, entry.endsAt)}</small>
          )}
        </li>
      ))}
    </ol>
  );
}
