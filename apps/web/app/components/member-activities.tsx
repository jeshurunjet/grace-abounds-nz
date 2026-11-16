'use client';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import { CalendarCheck, Search, Users } from 'lucide-react';
import { useToast } from './toast';
import { AddToCalendar, useActivities } from './activity-ui';
import {
  describeSchedule,
  formatDate,
  formatTime,
  kindLabels,
  placesLeft,
  placesTaken,
  upcoming,
  type Activity,
  type ActivityKind,
} from '../lib/activities';
import { errorMessage } from '../lib/api-client';
import {
  cancelPlan,
  joinActivity,
  loadPlans,
  useAvailability,
  usePlans,
} from '../lib/participation';

/*
 * The member's plans and the activities they can join or book (Phase 3B).
 * Every join, booking and cancellation is decided by the server, which
 * checks places, dates and cancellations; the page then shows the server's
 * plans and counts.
 */

/** The signed-in person's groups and bookings, with join/leave. */
export function useMemberPlans() {
  const { data: session } = useSession();
  const { push } = useToast();
  const { live, exceptions, place, now } = useActivities();
  const userId = session?.user?.id ?? '';
  const { plans, error } = usePlans(userId);
  const availability = useAvailability();
  const [busy, setBusy] = useState('');
  const mine = plans ?? [];
  const memberships = mine.filter((item) => !item.date);
  const bookings = mine
    .filter((item) => item.date && item.date >= now.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const loading = !!userId && plans === null && !error;
  const disabled = !userId || plans === null || !!busy;
  const byId = (id: string) => live.find((item) => item.id === id);

  async function join(activity: Activity, date = '') {
    if (disabled) return;
    setBusy(`${activity.id}:${date}`);
    try {
      await joinActivity(activity.id, date);
      push(
        date
          ? `You’re booked for ${activity.title} on ${formatDate(date)}.`
          : `You’ve joined ${activity.title}.`,
        'success',
      );
    } catch (failure) {
      push(errorMessage(failure), 'error');
    } finally {
      setBusy('');
    }
  }
  async function leave(id: string, message: string) {
    if (disabled) return;
    setBusy(id);
    try {
      await cancelPlan(id);
      push(message, 'info');
    } catch (failure) {
      push(errorMessage(failure), 'error');
    } finally {
      setBusy('');
    }
  }
  return {
    live,
    exceptions,
    availability,
    place,
    mine,
    memberships,
    bookings,
    loading,
    error,
    disabled,
    busy,
    byId,
    join,
    leave,
    retry: () => void loadPlans(userId),
  };
}

const SHOWN = 4;

/** What the member is going to and the groups they belong to. */
export function MyPlans({ onFind }: { onFind?: () => void }) {
  const {
    memberships,
    bookings,
    exceptions,
    place,
    byId,
    disabled,
    leave,
    loading,
    error,
    retry,
  } = useMemberPlans();
  const [all, setAll] = useState(false);
  const shownBookings = all ? bookings : bookings.slice(0, SHOWN);
  const empty = !loading && !error && !memberships.length && !bookings.length;
  return (
    <div className="plans">
      {loading && <p className="plans-note">Loading your plans…</p>}
      {error && (
        <p className="plans-note" role="alert">
          {error}{' '}
          <button type="button" className="plans-more" onClick={retry}>
            Try again
          </button>
        </p>
      )}
      {empty && (
        <div className="plans-empty">
          <CalendarCheck aria-hidden="true" size={28} />
          <p>
            <strong>Nothing planned yet.</strong> Book a place at an event or
            join a group, and it will show here.
          </p>
          {onFind && (
            <button type="button" className="button" onClick={onFind}>
              Find something to join
            </button>
          )}
        </div>
      )}
      {bookings.length > 0 && (
        <section className="plans-section" aria-labelledby="plans-coming-up">
          <h3 id="plans-coming-up">Coming up</h3>
          <ul className="plans-list">
            {shownBookings.map((entry) => {
              // An activity no longer published isn't in the public data;
              // the booking still shows (and can be cancelled).
              const activity = byId(entry.activityId);
              const occurrence = activity
                ? upcoming(activity, exceptions, 400).find(
                    (item) => item.date === entry.date,
                  )
                : undefined;
              const cancelled = entry.dateCancelled || !!occurrence?.cancelled;
              const [weekday, rest = ''] = formatDate(entry.date, true).split(
                ', ',
              );
              return (
                <li
                  key={entry.id}
                  className={`plans-item${cancelled || !activity ? ' is-cancelled' : ''}`}
                >
                  <span className="plans-date" aria-hidden="true">
                    <small>{weekday}</small>
                    <b>{rest.split(' ')[0]}</b>
                    <small>{rest.split(' ')[1]}</small>
                  </span>
                  <span className="plans-main">
                    {activity ? (
                      <Link href={`/events/${activity.slug}`}>
                        {activity.title}
                      </Link>
                    ) : (
                      <b>{entry.activity.title}</b>
                    )}
                    <span>
                      <span className="sr-only">
                        {formatDate(entry.date, true)} ·{' '}
                      </span>
                      {!activity
                        ? 'No longer running'
                        : cancelled
                          ? 'Cancelled by the church'
                          : occurrence
                            ? `${formatTime(occurrence.startTime)} · ${place(activity, occurrence.venue)}`
                            : ''}
                      {occurrence?.note && ` — ${occurrence.note}`}
                    </span>
                  </span>
                  <span className="plans-actions">
                    {activity && !cancelled && (
                      <AddToCalendar
                        activity={activity}
                        date={entry.date}
                        label="Add to my calendar"
                      />
                    )}
                    <button
                      type="button"
                      className="plans-leave"
                      disabled={disabled}
                      onClick={() =>
                        void leave(
                          entry.id,
                          `Your booking for ${entry.activity.title} on ${formatDate(entry.date)} is cancelled.`,
                        )
                      }
                    >
                      Cancel booking
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          {bookings.length > SHOWN && (
            <button
              type="button"
              className="plans-more"
              onClick={() => setAll((value) => !value)}
            >
              {all ? 'Show fewer' : `Show all ${bookings.length} bookings`}
            </button>
          )}
        </section>
      )}
      {memberships.length > 0 && (
        <section className="plans-section" aria-labelledby="plans-groups">
          <h3 id="plans-groups">Groups and teams I’m in</h3>
          <ul className="plans-list">
            {memberships.map((entry) => {
              const activity = byId(entry.activityId);
              const next = activity
                ? upcoming(activity, exceptions, 1)[0]
                : undefined;
              return (
                <li
                  key={entry.id}
                  className={`plans-item${activity ? '' : ' is-cancelled'}`}
                >
                  <span className="plans-icon" aria-hidden="true">
                    <Users size={18} />
                  </span>
                  <span className="plans-main">
                    {activity ? (
                      <Link href={`/events/${activity.slug}`}>
                        {activity.title}
                      </Link>
                    ) : (
                      <b>{entry.activity.title}</b>
                    )}
                    <span>
                      {activity
                        ? `${describeSchedule(activity.schedule)} · ${place(activity)}`
                        : 'No longer running'}
                      {next?.cancelled &&
                        ` · ${formatDate(next.date)} cancelled`}
                    </span>
                  </span>
                  <span className="plans-actions">
                    <button
                      type="button"
                      className="plans-leave"
                      disabled={disabled}
                      onClick={() =>
                        void leave(
                          entry.id,
                          `You’ve left ${entry.activity.title}.`,
                        )
                      }
                    >
                      Leave
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

const typeFilters: { label: string; kinds: ActivityKind[] }[] = [
  { label: 'All', kinds: ['service', 'event', 'group', 'study', 'ministry'] },
  { label: 'Events', kinds: ['event'] },
  { label: 'Services', kinds: ['service'] },
  { label: 'Groups & studies', kinds: ['group', 'study'] },
  { label: 'Ministry teams', kinds: ['ministry'] },
];
const PAGE = 6;

/** Activities the member can join or book, as searchable cards. */
export function JoinActivities({ focus = '' }: { focus?: string }) {
  const {
    live,
    exceptions,
    availability,
    place,
    mine,
    memberships,
    disabled,
    busy,
    join,
  } = useMemberPlans();
  const [query, setQuery] = useState('');
  const [type, setType] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const [dates, setDates] = useState<Record<string, string>>({});
  const matches = useMemo(() => {
    const words = query.trim().toLowerCase();
    const found = live.filter(
      (item) =>
        item.joinMode !== 'none' &&
        typeFilters[type]!.kinds.includes(item.kind) &&
        `${item.title} ${item.summary} ${item.leader} ${place(item)}`
          .toLowerCase()
          .includes(words),
    );
    // A linked activity comes first.
    return [
      ...found.filter((item) => item.id === focus),
      ...found.filter((item) => item.id !== focus),
    ];
  }, [live, type, query, place, focus]);
  const shown = matches.slice(0, limit);

  return (
    <div className="join">
      <div className="join-controls">
        <label className="join-search">
          <Search aria-hidden="true" size={16} />
          <span className="sr-only">Search activities</span>
          <input
            type="search"
            placeholder="Search by name, leader or place"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(PAGE);
            }}
          />
        </label>
        <div className="join-types" role="group" aria-label="Type">
          {typeFilters.map((item, index) => (
            <button
              key={item.label}
              type="button"
              className="cal-pill"
              aria-pressed={type === index}
              onClick={() => {
                setType(index);
                setLimit(PAGE);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <p className="join-count" aria-live="polite">
        {matches.length
          ? `${matches.length} ${matches.length === 1 ? 'activity' : 'activities'}`
          : 'No matching activities.'}
      </p>
      <div className="join-grid">
        {shown.map((activity) => {
          const membership = memberships.find(
            (item) => item.activityId === activity.id,
          );
          const options =
            activity.joinMode === 'booking'
              ? upcoming(activity, exceptions, 8).filter(
                  (item) => !item.cancelled,
                )
              : [];
          const date = dates[activity.id] ?? options[0]?.date ?? '';
          const booked = mine.some(
            (item) => item.activityId === activity.id && item.date === date,
          );
          const forDate = activity.joinMode === 'booking' ? date : '';
          const spots = placesLeft(activity, availability, forDate);
          const count = placesTaken(availability, activity.id, forDate);
          const saving = busy === `${activity.id}:${forDate}`;
          return (
            <article
              key={activity.id}
              id={`activity-${activity.id}`}
              className={`join-card cal-kind-${activity.kind}${activity.id === focus ? ' is-focus' : ''}`}
              aria-current={activity.id === focus ? 'true' : undefined}
            >
              <span className="join-kind">{kindLabels[activity.kind]}</span>
              <h3>
                <Link href={`/events/${activity.slug}`}>{activity.title}</Link>
              </h3>
              <p>{describeSchedule(activity.schedule)}</p>
              <p>{place(activity)}</p>
              <p className="join-spots">
                {spots == null
                  ? `${count} ${activity.joinMode === 'membership' ? 'joined' : 'going'}`
                  : spots
                    ? `${spots} of ${activity.capacity} places left`
                    : 'Full'}
              </p>
              <div className="join-action">
                {activity.joinMode === 'membership' ? (
                  membership ? (
                    <span className="join-done">You’re in this group</span>
                  ) : (
                    <button
                      type="button"
                      className="button"
                      disabled={disabled || spots === 0}
                      onClick={() => void join(activity)}
                    >
                      {spots === 0 ? 'Full' : saving ? 'Joining…' : 'Join'}
                    </button>
                  )
                ) : !options.length ? (
                  <span className="join-done">No upcoming dates</span>
                ) : (
                  <>
                    <label>
                      <span className="sr-only">Date for {activity.title}</span>
                      <select
                        value={date}
                        onChange={(event) =>
                          setDates((current) => ({
                            ...current,
                            [activity.id]: event.target.value,
                          }))
                        }
                      >
                        {options.map((item) => (
                          <option key={item.date} value={item.date}>
                            {formatDate(item.date)} ·{' '}
                            {formatTime(item.startTime)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {booked ? (
                      <span className="join-done">Booked</span>
                    ) : (
                      <button
                        type="button"
                        className="button"
                        disabled={disabled || spots === 0}
                        onClick={() => void join(activity, date)}
                      >
                        {spots === 0 ? 'Full' : saving ? 'Booking…' : 'Book'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {matches.length > limit && (
        <button
          type="button"
          className="button button-outline join-more"
          onClick={() => setLimit((value) => value + PAGE)}
        >
          Show more ({matches.length - limit} left)
        </button>
      )}
    </div>
  );
}
