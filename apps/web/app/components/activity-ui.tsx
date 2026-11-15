'use client';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  X,
} from 'lucide-react';
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
 * The church calendar: a month grid with the chosen day's agenda beside it,
 * or a plain list of the month. Members see published activities and their
 * own plans; in the workspace, Pastor and Admin also see drafts and
 * scheduled activities and get Create activity and Edit from the same
 * calendar and list (Phase 3A: one calendar, one editor). Its own `cal-`
 * styles (calendar.css) so older calendar rules can't leak in.
 */
export function ActivityCalendar({ member = false }: { member?: boolean }) {
  const { content } = useContent();
  const { data } = useSession();
  const { live, exceptions, participations, place, now, locations } =
    useActivities();
  const role = data?.user?.role;
  const staff = member && (role === 'pastor' || role === 'admin');
  const [month, setMonth] = useState(now.date.slice(0, 7));
  // The day whose card is open, floating beside the date that was clicked.
  const [selected, setSelected] = useState<string | null>(null);
  const [cardStyle, setCardStyle] = useState<CSSProperties>({});
  const monthRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [filter, setFilter] = useState(0);
  const [mine, setMine] = useState(false);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [showEarlier, setShowEarlier] = useState(false);
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
  const leading = [...Array(weekdayOf(first)).fill(null), ...days];
  // Complete the last week so the grid has no ragged edge.
  const cells = [
    ...leading,
    ...Array((7 - (leading.length % 7)) % 7).fill(null),
  ] as (string | null)[];
  // In this month's list, earlier days are tucked away until asked for.
  const thisMonth = month === now.date.slice(0, 7);
  const listDays = days.filter(
    (date) => forDay(date).length || rosterForDay(date).length,
  );
  const earlier =
    thisMonth && !showEarlier ? listDays.filter((date) => date < now.date) : [];
  // Activities without dates (ongoing teams) are reachable from the list.
  const undated = source.filter(
    (item) =>
      item.schedule.repeat === 'ongoing' &&
      (filter === 0 || filters[filter]!.kinds.includes(item.kind)),
  );
  const archived =
    staff && staffData
      ? staffData.activities.filter((item) => item.status === 'archived')
      : [];
  const monthName = new Date(`${first}T12:00:00Z`).toLocaleDateString('en-NZ', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });

  function showMonth(target: string) {
    setMonth(target);
    setShowEarlier(false);
    setSelected(null);
  }

  function openDay(date: string, cell: HTMLButtonElement) {
    if (date === selected) return closeDay();
    anchorRef.current = cell;
    setSelected(date);
  }
  function closeDay(returnFocus = false) {
    setSelected(null);
    if (returnFocus) anchorRef.current?.focus();
  }

  // Place the day card beside its date: to the right when there is room,
  // otherwise to the left, otherwise just below; it opens upward from the
  // lower rows. On phones calendar.css shows it under the grid instead.
  const placeCard = useCallback(() => {
    const box = monthRef.current?.getBoundingClientRect();
    const cell = anchorRef.current?.getBoundingClientRect();
    if (!box || !cell) return;
    const gap = 8;
    const width = Math.min(384, box.width);
    const style: CSSProperties = { width };
    const right = cell.right - box.left + gap;
    const left = cell.left - box.left - gap - width;
    if (right + width <= box.width) style.left = right;
    else if (left >= 0) style.left = left;
    else
      style.left = Math.max(
        0,
        Math.min(cell.left - box.left, box.width - width),
      );
    const below = style.left !== right && style.left !== left;
    const lower = cell.top - box.top > box.height / 2;
    if (below) {
      if (lower) style.bottom = box.bottom - cell.top + gap;
      else style.top = cell.bottom - box.top + gap;
    } else if (lower) style.bottom = box.bottom - cell.bottom;
    else style.top = cell.top - box.top;
    setCardStyle(style);
  }, []);
  useLayoutEffect(() => {
    if (!selected) return;
    placeCard();
    // Focus the card without jumping the page; on phones, where it sits
    // under the grid, bring it into view.
    cardRef.current?.focus({ preventScroll: true });
    if (window.matchMedia?.('(max-width: 720px)').matches)
      cardRef.current?.scrollIntoView?.({
        block: 'nearest',
        behavior: 'smooth',
      });
  }, [selected, placeCard]);
  useEffect(() => {
    if (!selected) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || editing) return;
      setSelected(null);
      anchorRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        cardRef.current?.contains(target) ||
        anchorRef.current?.contains(target) ||
        (target instanceof Element && target.closest('[role="dialog"]'))
      )
        return;
      setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', placeCard);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', placeCard);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [selected, placeCard, editing]);
  const move = (offset: number) =>
    showMonth(addDays(first, offset > 0 ? 32 : -1).slice(0, 7));
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
  const editButton = (activity: Activity) =>
    staff && staffRecord(activity.id) ? (
      <button
        type="button"
        className="cal-edit"
        aria-label={`Edit ${activity.title}`}
        onClick={() => edit(activity)}
      >
        <Pencil aria-hidden="true" size={16} />
      </button>
    ) : null;

  /** One activity on one date: time, title, place and its status. */
  function entry(item: Occurrence) {
    const hidden = staff ? notLive(item.activity) : '';
    const tag =
      hidden ||
      (item.cancelled
        ? 'Cancelled'
        : isMine(item)
          ? 'You’re going'
          : kindLabels[item.activity.kind]);
    return (
      <li
        key={item.key}
        className={`cal-entry cal-kind-${item.activity.kind}${item.cancelled ? ' is-cancelled' : ''}${hidden ? ' is-draft' : ''}`}
      >
        <span className="cal-entry-time">
          {item.startTime ? formatTime(item.startTime) : 'All day'}
        </span>
        <span className="cal-entry-main">
          {hidden ? (
            <span className="cal-entry-title">{item.activity.title}</span>
          ) : (
            <Link
              className="cal-entry-title"
              href={`/events/${item.activity.slug}`}
            >
              {item.activity.title}
            </Link>
          )}
          <span className="cal-entry-meta">
            {place(item.activity, item.venue)}
            {item.note && ` — ${item.note}`}
          </span>
        </span>
        <span className={`cal-tag${isMine(item) && !hidden ? ' is-mine' : ''}`}>
          {tag}
        </span>
        {editButton(item.activity)}
      </li>
    );
  }
  const roster = (date: string) =>
    rosterForDay(date).map((item) => (
      <li key={item.id} className="cal-entry cal-kind-roster">
        <span className="cal-entry-time">{item.time}</span>
        <span className="cal-entry-main">
          <span className="cal-entry-title">Serving: {item.title}</span>
          <span className="cal-entry-meta">{item.location}</span>
        </span>
        <span className="cal-tag">{item.status}</span>
      </li>
    ));

  return (
    <section
      id="calendar"
      className={`cal ${member ? 'cal-workspace' : 'cal-public'}`}
      aria-label={member ? 'Church calendar and your plans' : 'Church calendar'}
    >
      <div className="cal-top">
        <div className="cal-month-nav">
          <button
            type="button"
            className="cal-round"
            aria-label="Previous month"
            onClick={() => move(-1)}
          >
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <h2>{monthName}</h2>
          <button
            type="button"
            className="cal-round"
            aria-label="Next month"
            onClick={() => move(1)}
          >
            <ChevronRight aria-hidden="true" size={18} />
          </button>
          {month !== now.date.slice(0, 7) && (
            <button
              type="button"
              className="cal-pill"
              onClick={() => showMonth(now.date.slice(0, 7))}
            >
              Today
            </button>
          )}
        </div>
        <div className="cal-actions">
          <div className="cal-switch" role="group" aria-label="View">
            <button
              type="button"
              aria-label="Calendar view"
              aria-pressed={view === 'calendar'}
              onClick={() => setView('calendar')}
            >
              <LayoutGrid aria-hidden="true" size={16} />
              <span aria-hidden="true">Month</span>
            </button>
            <button
              type="button"
              aria-label="List view"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              <List aria-hidden="true" size={16} />
              <span aria-hidden="true">List</span>
            </button>
          </div>
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

      <div className="cal-filters" role="group" aria-label="Show">
        {filters.map((item, index) => (
          <button
            key={item.label}
            type="button"
            className="cal-pill"
            aria-pressed={filter === index}
            onClick={() => setFilter(index)}
          >
            {item.label}
          </button>
        ))}
        {member && (
          <button
            type="button"
            className="cal-pill"
            aria-pressed={mine}
            onClick={() => setMine((value) => !value)}
          >
            My plans only
          </button>
        )}
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
        <div className="cal-body">
          <div className="cal-month" ref={monthRef}>
            <div className="cal-weekdays" aria-hidden="true">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="cal-grid">
              {cells.map((date, index) => {
                if (!date)
                  return (
                    <span
                      key={index}
                      className="cal-cell is-empty"
                      aria-hidden="true"
                    />
                  );
                const items = forDay(date);
                const count = items.length + rosterForDay(date).length;
                return (
                  <button
                    key={date}
                    type="button"
                    className={[
                      'cal-cell',
                      date === selected ? 'is-selected' : '',
                      date === now.date ? 'is-today' : '',
                      date < now.date ? 'is-past' : '',
                    ].join(' ')}
                    aria-expanded={date === selected}
                    aria-haspopup="dialog"
                    aria-label={`${formatDate(date)}, ${count} ${count === 1 ? 'item' : 'items'}`}
                    onClick={(event) => openDay(date, event.currentTarget)}
                  >
                    <span className="cal-day">{+date.slice(8, 10)}</span>
                    {member && (
                      <span className="cal-chips" aria-hidden="true">
                        {items.slice(0, 2).map((item) => (
                          <span
                            key={item.key}
                            className={`cal-chip cal-kind-${item.activity.kind}${item.cancelled ? ' is-cancelled' : ''}${staff && notLive(item.activity) ? ' is-draft' : ''}`}
                          >
                            {item.activity.title}
                          </span>
                        ))}
                        {count > Math.min(2, items.length) && (
                          <span className="cal-more">
                            +{count - Math.min(2, items.length)} more
                          </span>
                        )}
                      </span>
                    )}
                    {count > 0 && (
                      <span className="cal-dots" aria-hidden="true">
                        {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                          <i key={i} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {selected && (
              <div
                ref={cardRef}
                className="cal-day-card"
                role="dialog"
                aria-labelledby="cal-day-card-title"
                tabIndex={-1}
                style={cardStyle}
              >
                <div className="cal-day-card-head">
                  <h3 id="cal-day-card-title">
                    {selected === now.date ? 'Today · ' : ''}
                    {formatDate(selected, true)}
                  </h3>
                  <button
                    type="button"
                    className="cal-day-card-close"
                    aria-label="Close"
                    onClick={() => closeDay(true)}
                  >
                    <X aria-hidden="true" size={18} />
                  </button>
                </div>
                {!forDay(selected).length && !rosterForDay(selected).length ? (
                  <p className="cal-empty">Nothing on this day.</p>
                ) : (
                  <ul className="cal-entries">
                    {forDay(selected).map(entry)}
                    {roster(selected)}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="cal-list">
          {!shown.length && (
            <p className="cal-empty">Nothing on the calendar this month.</p>
          )}
          {earlier.length > 0 && (
            <button
              type="button"
              className="cal-earlier"
              onClick={() => setShowEarlier(true)}
            >
              Show earlier this month ({earlier.length}{' '}
              {earlier.length === 1 ? 'day' : 'days'})
            </button>
          )}
          {listDays
            .filter((date) => !earlier.includes(date))
            .map((date) => (
              <section
                key={date}
                className={`cal-list-day${date === now.date ? ' is-today' : ''}${date < now.date ? ' is-past' : ''}`}
                aria-label={formatDate(date, true)}
              >
                <h3>
                  <span className="cal-list-weekday">
                    {formatDate(date).split(',')[0]}
                  </span>
                  <span className="cal-list-date">
                    {formatDate(date, true).split(', ')[1]}
                  </span>
                  {date === now.date && (
                    <span className="cal-list-today">Today</span>
                  )}
                </h3>
                <ul className="cal-entries">
                  {forDay(date).map(entry)}
                  {roster(date)}
                </ul>
              </section>
            ))}
          {!mine && undated.length > 0 && (
            <section className="cal-list-day" aria-label="Ongoing">
              <h3>
                <span className="cal-list-weekday">Ongoing</span>
                <span className="cal-list-date">
                  Times arranged with the team
                </span>
              </h3>
              <ul className="cal-entries">
                {undated.map((activity) => {
                  const hidden = staff ? notLive(activity) : '';
                  return (
                    <li
                      key={activity.id}
                      className={`cal-entry cal-kind-${activity.kind}${hidden ? ' is-draft' : ''}`}
                    >
                      <span className="cal-entry-time">—</span>
                      <span className="cal-entry-main">
                        {hidden ? (
                          <span className="cal-entry-title">
                            {activity.title}
                          </span>
                        ) : (
                          <Link
                            className="cal-entry-title"
                            href={`/events/${activity.slug}`}
                          >
                            {activity.title}
                          </Link>
                        )}
                        <span className="cal-entry-meta">
                          {place(activity)}
                        </span>
                      </span>
                      <span className="cal-tag">
                        {hidden || kindLabels[activity.kind]}
                      </span>
                      {editButton(activity)}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {archived.length > 0 && (
            <details className="cal-archived">
              <summary>Archived activities ({archived.length})</summary>
              <ul className="cal-entries">
                {archived.map((activity) => (
                  <li key={activity.id} className="cal-entry is-draft">
                    <span className="cal-entry-time">—</span>
                    <span className="cal-entry-main">
                      <span className="cal-entry-title">{activity.title}</span>
                    </span>
                    <span className="cal-tag">Archived</span>
                    {editButton(activity)}
                  </li>
                ))}
              </ul>
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
