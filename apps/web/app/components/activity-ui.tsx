'use client';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { useContent } from './content-provider';
import {
  addDays,
  formatDate,
  formatTime,
  isLive,
  kindLabels,
  nextSunday,
  nzNow,
  occurrences,
  toIcs,
  weekdayOf,
  type Activity,
  type ActivityKind,
  type Occurrence,
} from '../lib/activities';

/** Activities plus lookups shared by every activity screen. */
export function useActivities() {
  const { content } = useContent();
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    const refresh = () => setClockTick((tick) => tick + 1);
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return useMemo(() => {
    const now = nzNow();
    const locations = content.pages.locations;
    const campus = (id: string) =>
      locations.find((location) => location.id === id);
    const place = (activity: Activity, venue = activity.venue) =>
      [venue, campus(activity.locationId)?.name].filter(Boolean).join(' · ') ||
      'Location to be confirmed';
    return {
      now,
      all: content.activities,
      live: content.activities.filter((item) => isLive(item, now.stamp)),
      exceptions: content.activityExceptions,
      participations: content.participations,
      locations,
      campus,
      place,
    };
  }, [content, clockTick]);
}

/** Downloads an .ics file for one date or the whole series. */
export function AddToCalendar({
  activity,
  date,
  label,
}: {
  activity: Activity;
  date?: string;
  label?: string;
}) {
  const { exceptions, place } = useActivities();
  function download() {
    const ics = toIcs(activity, {
      exceptions,
      location: place(activity),
      date,
      url: `${window.location.origin}/events/${activity.slug}`,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: `${activity.slug}${date ? `-${date}` : ''}.ics`,
    });
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button type="button" className="button button-outline" onClick={download}>
      <CalendarPlus aria-hidden="true" size={16} />{' '}
      {label ?? (date ? 'Add to calendar' : 'Add all dates to calendar')}
    </button>
  );
}

/** Whether each campus has a service this coming Sunday. */
export function SundayStatus({ locationId }: { locationId?: string }) {
  const { live, exceptions, locations, now } = useActivities();
  const sunday = nextSunday(now.date);
  const services = occurrences(
    live.filter((item) => item.kind === 'service'),
    exceptions,
    sunday,
    sunday,
  );
  const campuses = locations.filter(
    (location) => !locationId || location.id === locationId,
  );
  return (
    <section className="sunday-status" aria-label="This Sunday">
      <p className="eyebrow">
        {sunday === now.date ? 'Today' : 'This Sunday'} ·{' '}
        {formatDate(sunday, true)}
      </p>
      <ul>
        {campuses.map((location) => {
          const here = services.filter(
            (item) => item.activity.locationId === location.id,
          );
          const on = here.filter((item) => !item.cancelled);
          return (
            <li key={location.id} className={on.length ? 'on' : 'off'}>
              <b>{location.name}</b>
              {on.length ? (
                <span>
                  {on
                    .map(
                      (item) =>
                        `Service at ${formatTime(item.startTime)}${item.changed && item.venue ? ` · ${item.venue}` : ''}`,
                    )
                    .join(' · ')}
                </span>
              ) : (
                <span>No service this Sunday</span>
              )}
              {here
                .filter((item) => item.note)
                .map((item) => (
                  <small key={item.key}>{item.note}</small>
                ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const filters: { label: string; kinds: ActivityKind[] }[] = [
  { label: 'All', kinds: ['service', 'event', 'group', 'study'] },
  { label: 'Services', kinds: ['service'] },
  { label: 'Events', kinds: ['event'] },
  { label: 'Groups & studies', kinds: ['group', 'study'] },
];

/** Month calendar of activity dates. Member mode adds the member's plans. */
export function ActivityCalendar({ member = false }: { member?: boolean }) {
  const { content } = useContent();
  const { data } = useSession();
  const { live, exceptions, participations, place, now } = useActivities();
  const [month, setMonth] = useState(now.date.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState(0);
  const [mine, setMine] = useState(false);
  const user =
    content.users.find((item) => item.email === data?.user?.email) ??
    (member ? content.users.find((item) => item.role === 'member') : undefined);
  const first = `${month}-01`;
  const last = addDays(`${addDays(first, 32).slice(0, 7)}-01`, -1);
  const isMine = (item: Occurrence) =>
    !!user &&
    participations.some(
      (entry) =>
        entry.userId === user.id &&
        entry.activityId === item.activity.id &&
        (!entry.date || entry.date === item.date),
    );
  const inMonth = useMemo(
    () =>
      occurrences(
        live.filter((item) => filters[filter]!.kinds.includes(item.kind)),
        exceptions,
        first,
        last,
      ),
    [live, exceptions, first, last, filter],
  );
  const shown = mine ? inMonth.filter(isMine) : inMonth;
  const assignments = member
    ? content.serviceAssignments.filter((item) => item.userId === user?.id)
    : [];
  const forDay = (date: string) => shown.filter((item) => item.date === date);
  const rosterForDay = (date: string) =>
    assignments.filter((item) => item.date === date);
  const days = Array.from(
    { length: +last.slice(8, 10) },
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`,
  );
  const cells = [...Array(weekdayOf(first)).fill(null), ...days] as (
    string | null
  )[];
  function move(offset: number) {
    const target = addDays(first, offset > 0 ? 32 : -1).slice(0, 7);
    setMonth(target);
    setSelected(null);
  }
  return (
    <section
      className="panel pastor-calendar member-calendar public-event-calendar"
      aria-label={member ? 'Your planner' : 'Church calendar'}
    >
      <header>
        <div>
          {member && <p className="eyebrow">Your planner</p>}
          <h2>
            {new Date(`${first}T12:00:00Z`).toLocaleDateString('en-NZ', {
              timeZone: 'UTC',
              month: 'long',
              year: 'numeric',
            })}
          </h2>
        </div>
        <span>
          <button aria-label="Previous month" onClick={() => move(-1)}>
            ‹
          </button>
          <button aria-label="Next month" onClick={() => move(1)}>
            ›
          </button>
        </span>
      </header>
      <div className="calendar-filters" role="group" aria-label="Show">
        {filters.map((item, index) => (
          <button
            key={item.label}
            aria-pressed={filter === index}
            className={filter === index ? 'active' : ''}
            onClick={() => setFilter(index)}
          >
            {item.label}
          </button>
        ))}
        {member && (
          <button
            aria-pressed={mine}
            className={mine ? 'active' : ''}
            onClick={() => setMine((value) => !value)}
          >
            My plans only
          </button>
        )}
      </div>
      <div className="pastor-week">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <b key={day}>{day}</b>
        ))}
      </div>
      <div className="pastor-calendar-grid">
        {cells.map((date, index) => {
          const count = date
            ? forDay(date).length + rosterForDay(date).length
            : 0;
          return (
            <button
              key={index}
              disabled={!date}
              aria-pressed={date === selected}
              className={[
                date === selected ? 'selected' : '',
                date === now.date ? 'today' : '',
              ].join(' ')}
              aria-label={
                date ? `${formatDate(date)}, ${count} items` : undefined
              }
              onClick={() => setSelected(date)}
            >
              {date ? +date.slice(8, 10) : ''}
              {count > 0 && <i />}
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="pastor-day-detail">
          <h3>{formatDate(selected, true)}</h3>
          {!forDay(selected).length && !rosterForDay(selected).length && (
            <p>Nothing on this day.</p>
          )}
          {forDay(selected).map((item) => (
            <p key={item.key} className={item.cancelled ? 'cancelled' : ''}>
              <Link href={`/events/${item.activity.slug}`}>
                {item.activity.title}
                <small>
                  {item.cancelled
                    ? 'Cancelled'
                    : `${formatTime(item.startTime)} · ${place(item.activity, item.venue)}`}
                  {item.note && ` — ${item.note}`}
                </small>
              </Link>
              <em>
                {isMine(item) ? 'You’re going' : kindLabels[item.activity.kind]}
              </em>
            </p>
          ))}
          {rosterForDay(selected).map((item) => (
            <p key={item.id}>
              <span>
                Serving: {item.title}
                <small>
                  {item.time} · {item.location}
                </small>
              </span>
              <em>{item.status}</em>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
