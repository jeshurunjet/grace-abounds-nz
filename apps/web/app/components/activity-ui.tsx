'use client';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, LayoutGrid, List, Pencil, Plus } from 'lucide-react';
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
  type ActivityException,
  type ActivityKind,
  type Occurrence,
  type StaffActivities,
  type StaffActivity,
} from '../lib/activities';
import { api, errorMessage } from '../lib/api-client';
import { ActivityEditor, type EditorTarget } from './activity-editor';

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
    // clockTick is intentional: it re-evaluates time-based status each minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

/**
 * Month calendar of activity dates, with an accessible list view of the same
 * records. Member mode adds the member's plans. In the workspace, Pastor and
 * Admin also see drafts and scheduled activities and get Create activity and
 * Edit from the same calendar and list (Phase 3A: one calendar, one editor).
 */
export function ActivityCalendar({ member = false }: { member?: boolean }) {
  const { content } = useContent();
  const { data } = useSession();
  const { live, exceptions, participations, place, now, locations } =
    useActivities();
  const role = data?.user?.role;
  const staff = member && (role === 'pastor' || role === 'admin');
  const [month, setMonth] = useState(now.date.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState(0);
  const [mine, setMine] = useState(false);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [staffData, setStaffData] = useState<StaffActivities | null>(null);
  const [staffError, setStaffError] = useState('');
  const [editing, setEditing] = useState<EditorTarget | null>(null);

  const loadStaff = useCallback(async () => {
    setStaffError('');
    try {
      setStaffData((await api<StaffActivities>('/staff/activities')).data);
    } catch (failure) {
      setStaffError(errorMessage(failure));
    }
  }, []);
  useEffect(() => {
    if (staff) void loadStaff();
  }, [staff, loadStaff]);

  // Staff see every activity that isn't archived (drafts and scheduled ones
  // marked); everyone else sees only published, live activities.
  const source: Activity[] =
    staff && staffData
      ? staffData.activities.filter((item) => item.status !== 'archived')
      : live;
  const sourceExceptions: ActivityException[] =
    staff && staffData ? staffData.exceptions : exceptions;
  const staffRecord = (id: string) =>
    staffData?.activities.find((item) => item.id === id) ?? null;

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
        source.filter((item) => filters[filter]!.kinds.includes(item.kind)),
        sourceExceptions,
        first,
        last,
      ),
    [source, sourceExceptions, first, last, filter],
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
  // Activities without dates (ongoing teams) and, for staff, ones whose
  // dates fall outside this month, are reachable from the list view.
  const undated = source.filter(
    (item) =>
      item.schedule.repeat === 'ongoing' &&
      (filter === 0 || filters[filter]!.kinds.includes(item.kind)),
  );
  const archived =
    staff && staffData
      ? staffData.activities.filter((item) => item.status === 'archived')
      : [];
  function move(offset: number) {
    const target = addDays(first, offset > 0 ? 32 : -1).slice(0, 7);
    setMonth(target);
    setSelected(null);
  }
  function saved(activity: StaffActivity, changed?: ActivityException[]) {
    setStaffData((state) => {
      const activities = state?.activities ?? [];
      const others = activities.filter((item) => item.id !== activity.id);
      return {
        activities: [...others, activity],
        exceptions: changed
          ? [
              ...(state?.exceptions ?? []).filter(
                (item) => item.activityId !== activity.id,
              ),
              ...changed,
            ]
          : (state?.exceptions ?? []),
      };
    });
  }
  const notLive = (activity: Activity) =>
    activity.status === 'draft'
      ? 'Draft'
      : activity.status === 'scheduled'
        ? `Goes live ${formatDate(activity.publishAt.slice(0, 10))}`
        : '';
  const edit = (activity: Activity) => {
    const record = staffRecord(activity.id);
    if (record) setEditing({ activity: record });
  };

  function entry(item: Occurrence) {
    const hidden = staff ? notLive(item.activity) : '';
    const title = (
      <>
        {item.activity.title}
        <small>
          {item.cancelled
            ? 'Cancelled'
            : `${formatTime(item.startTime)} · ${place(item.activity, item.venue)}`}
          {item.note && ` — ${item.note}`}
        </small>
      </>
    );
    return (
      <p key={item.key} className={item.cancelled ? 'cancelled' : ''}>
        {hidden ? (
          <span>{title}</span>
        ) : (
          <Link href={`/events/${item.activity.slug}`}>{title}</Link>
        )}
        <em>
          {hidden ||
            (isMine(item) ? 'You’re going' : kindLabels[item.activity.kind])}
        </em>
        {staff && staffRecord(item.activity.id) && (
          <button
            type="button"
            className="kit-icon-button"
            aria-label={`Edit ${item.activity.title}`}
            onClick={() => edit(item.activity)}
          >
            <Pencil aria-hidden="true" size={16} />
          </button>
        )}
      </p>
    );
  }

  return (
    <section
      id="calendar"
      className={`panel pastor-calendar member-calendar ${member ? 'workspace-calendar' : 'public-event-calendar'}`}
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
      <div className="calendar-toolbar">
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
        <div className="calendar-views" role="group" aria-label="View">
          <button
            type="button"
            className="kit-icon-button"
            aria-label="Calendar view"
            aria-pressed={view === 'calendar'}
            onClick={() => setView('calendar')}
          >
            <LayoutGrid aria-hidden="true" size={18} />
          </button>
          <button
            type="button"
            className="kit-icon-button"
            aria-label="List view"
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            <List aria-hidden="true" size={18} />
          </button>
          {staff && (
            <button
              type="button"
              className="button"
              disabled={!staffData}
              onClick={() => setEditing({ activity: null, kind: 'event' })}
            >
              <Plus aria-hidden="true" size={16} />
              Create activity
            </button>
          )}
        </div>
      </div>
      {staffError && (
        <div className="publishing-errors" role="alert">
          <p>Drafts couldn’t be loaded. {staffError}</p>
          <button
            type="button"
            className="button button-outline"
            onClick={() => void loadStaff()}
          >
            Try again
          </button>
        </div>
      )}
      {view === 'calendar' ? (
        <>
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
                  {date ? (
                    <span className="calendar-day-number">
                      {+date.slice(8, 10)}
                    </span>
                  ) : (
                    ''
                  )}
                  {count > 0 && <i />}
                  {/* Workspace calendar: up to three titles per day, Google-style. */}
                  {member && date && (
                    <span className="calendar-day-items" aria-hidden="true">
                      {forDay(date)
                        .slice(0, 3)
                        .map((item) => (
                          <span
                            key={item.key}
                            className={`calendar-chip calendar-chip-${item.activity.kind}${item.cancelled ? ' cancelled' : ''}${staff && notLive(item.activity) ? ' draft' : ''}`}
                          >
                            {formatTime(item.startTime)} {item.activity.title}
                          </span>
                        ))}
                      {count > Math.min(3, forDay(date).length) && (
                        <span className="calendar-more">
                          {count - Math.min(3, forDay(date).length)} more
                        </span>
                      )}
                    </span>
                  )}
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
              {forDay(selected).map(entry)}
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
        </>
      ) : (
        <div className="pastor-day-detail calendar-list">
          {!shown.length && <p>Nothing on the calendar this month.</p>}
          {days
            .filter((date) => forDay(date).length)
            .map((date) => (
              <section key={date} aria-label={formatDate(date, true)}>
                <h3>{formatDate(date, true)}</h3>
                {forDay(date).map(entry)}
              </section>
            ))}
          {!mine && undated.length > 0 && (
            <section aria-label="Ongoing">
              <h3>Ongoing</h3>
              {undated.map((activity) => (
                <p key={activity.id}>
                  {staff && notLive(activity) ? (
                    <span>{activity.title}</span>
                  ) : (
                    <Link href={`/events/${activity.slug}`}>
                      {activity.title}
                      <small>{place(activity)}</small>
                    </Link>
                  )}
                  <em>
                    {(staff && notLive(activity)) || kindLabels[activity.kind]}
                  </em>
                  {staff && staffRecord(activity.id) && (
                    <button
                      type="button"
                      className="kit-icon-button"
                      aria-label={`Edit ${activity.title}`}
                      onClick={() => edit(activity)}
                    >
                      <Pencil aria-hidden="true" size={16} />
                    </button>
                  )}
                </p>
              ))}
            </section>
          )}
          {archived.length > 0 && (
            <details className="calendar-archived">
              <summary>Archived ({archived.length})</summary>
              {archived.map((activity) => (
                <p key={activity.id}>
                  <span>{activity.title}</span>
                  <em>Archived</em>
                  <button
                    type="button"
                    className="kit-icon-button"
                    aria-label={`Edit ${activity.title}`}
                    onClick={() => edit(activity)}
                  >
                    <Pencil aria-hidden="true" size={16} />
                  </button>
                </p>
              ))}
            </details>
          )}
        </div>
      )}
      {staff && (
        <ActivityEditor
          target={editing}
          exceptions={staffData?.exceptions ?? []}
          locations={locations.map((item) => ({
            id: item.id,
            name: item.name,
          }))}
          onClose={() => setEditing(null)}
          onSaved={saved}
          onDeleted={(id) => {
            setEditing(null);
            setStaffData((state) =>
              state
                ? {
                    activities: state.activities.filter(
                      (item) => item.id !== id,
                    ),
                    exceptions: state.exceptions.filter(
                      (item) => item.activityId !== id,
                    ),
                  }
                : state,
            );
          }}
        />
      )}
    </section>
  );
}
