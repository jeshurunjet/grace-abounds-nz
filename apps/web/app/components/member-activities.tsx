'use client';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useContent } from './content-provider';
import { useToast } from './toast';
import { AddToCalendar, useActivities } from './activity-ui';
import {
  describeSchedule,
  formatDate,
  formatTime,
  kindLabels,
  participants,
  spotsLeft,
  upcoming,
  type Activity,
  type ActivityKind,
} from '../lib/activities';

/** Join ongoing activities, book dated ones, and back out of either. */
export function MemberActivities() {
  const { content, update, ready, storageError } = useContent();
  const { data: session } = useSession();
  const { push } = useToast();
  const { live, exceptions, participations, place, now } = useActivities();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ActivityKind | 'all'>('all');
  const [focus, setFocus] = useState('');
  const [dates, setDates] = useState<Record<string, string>>({});
  const user =
    content.users.find((item) => item.email === session?.user?.email) ??
    content.users.find((item) => item.role === 'member');
  const userId = user?.id ?? session?.user?.id ?? 'anonymous-member';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // ?join=<title> links from older pages still resolve to the activity.
    const id =
      params.get('activity') ??
      live.find((item) => item.title === params.get('join'))?.id;
    if (!id) return;
    setFocus(id);
    requestAnimationFrame(() =>
      document
        .getElementById(`activity-${id}`)
        ?.scrollIntoView({ block: 'center' }),
    );
    // Run once on arrival; live is stable after the content store loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.length]);

  const mine = participations.filter((item) => item.userId === userId);
  const memberships = mine.filter((item) => !item.date);
  const bookings = mine
    .filter((item) => item.date && item.date >= now.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const joinable = live.filter(
    (item) =>
      item.joinMode !== 'none' &&
      (kind === 'all' || item.kind === kind) &&
      `${item.title} ${item.summary} ${item.leader} ${place(item)}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const ordered = [
    ...joinable.filter((item) => item.id === focus),
    ...joinable.filter((item) => item.id !== focus),
  ];
  const byId = (id: string) =>
    content.activities.find((item) => item.id === id);
  const disabled = !ready || !!storageError || !user;

  async function join(activity: Activity, date = '') {
    if (disabled) return;
    if (spotsLeft(activity, participations, date) === 0) {
      push(
        `${activity.title} is full${date ? ` on ${formatDate(date)}` : ''}.`,
        'error',
      );
      return;
    }
    const saved = await update((state) => ({
      ...state,
      participations: [
        ...state.participations,
        {
          id: crypto.randomUUID(),
          activityId: activity.id,
          userId,
          date,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    push(
      saved
        ? date
          ? `You’re booked for ${activity.title} on ${formatDate(date)}.`
          : `You’ve joined ${activity.title}.`
        : 'This could not be saved in this browser. Please try again.',
      saved ? 'success' : 'error',
    );
  }
  async function leave(id: string, message: string) {
    if (disabled) return;
    const saved = await update((state) => ({
      ...state,
      participations: state.participations.filter((item) => item.id !== id),
    }));
    push(
      saved
        ? message
        : 'This could not be saved in this browser. Please try again.',
      saved ? 'info' : 'error',
    );
  }

  return (
    <section className="panel member-activities" id="activities">
      <span id="attendance" />
      <div className="member-section-heading">
        <span>
          <Users aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Get involved</p>
          <h2>Activities &amp; bookings</h2>
        </div>
      </div>

      <h3>My activities</h3>
      {!memberships.length && !bookings.length && (
        <p className="form-note">
          You haven’t joined anything yet. Choose a group, study, ministry or
          event below.
        </p>
      )}
      <ul className="member-activity-list">
        {memberships.map((entry) => {
          const activity = byId(entry.activityId);
          if (!activity) return null;
          const next = upcoming(activity, exceptions, 1)[0];
          return (
            <li key={entry.id}>
              <div>
                <Link href={`/events/${activity.slug}`}>
                  <b>{activity.title}</b>
                </Link>
                <small>
                  {describeSchedule(activity.schedule)} · {place(activity)}
                  {next?.cancelled && ` · ${formatDate(next.date)} cancelled`}
                </small>
              </div>
              <div className="form-actions">
                {activity.schedule.repeat !== 'ongoing' && (
                  <AddToCalendar activity={activity} label="Add to calendar" />
                )}
                <button
                  className="text-danger"
                  disabled={disabled}
                  onClick={() =>
                    leave(entry.id, `You’ve left ${activity.title}.`)
                  }
                >
                  Leave
                </button>
              </div>
            </li>
          );
        })}
        {bookings.map((entry) => {
          const activity = byId(entry.activityId);
          if (!activity) return null;
          const occurrence = upcoming(activity, exceptions, 400).find(
            (item) => item.date === entry.date,
          );
          return (
            <li
              key={entry.id}
              className={occurrence?.cancelled ? 'cancelled' : ''}
            >
              <div>
                <Link href={`/events/${activity.slug}`}>
                  <b>{activity.title}</b>
                </Link>
                <small>
                  {formatDate(entry.date, true)}
                  {occurrence?.cancelled
                    ? ' · Cancelled by the church'
                    : occurrence
                      ? ` · ${formatTime(occurrence.startTime)} · ${place(activity, occurrence.venue)}`
                      : ''}
                  {occurrence?.note && ` — ${occurrence.note}`}
                </small>
              </div>
              <div className="form-actions">
                {!occurrence?.cancelled && (
                  <AddToCalendar activity={activity} date={entry.date} />
                )}
                <button
                  className="text-danger"
                  disabled={disabled}
                  onClick={() =>
                    leave(
                      entry.id,
                      `Your booking for ${activity.title} on ${formatDate(entry.date)} is cancelled.`,
                    )
                  }
                >
                  Cancel booking
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <h3>Find an activity</h3>
      <div className="member-join-controls">
        <label>
          <span className="sr-only">Search activities</span>
          <input
            type="search"
            placeholder="Search by name, leader or place"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Type</span>
          <select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as ActivityKind | 'all')
            }
          >
            <option value="all">All types</option>
            {Object.entries(kindLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!ordered.length && <p>No matching activities.</p>}
      <div className="member-rsvp-list">
        {ordered.map((activity) => {
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
          const spots = spotsLeft(
            activity,
            participations,
            activity.joinMode === 'booking' ? date : '',
          );
          const count = participants(
            activity,
            participations,
            activity.joinMode === 'booking' ? date : '',
          ).length;
          return (
            <article
              key={activity.id}
              id={`activity-${activity.id}`}
              className={activity.id === focus ? 'active' : undefined}
              aria-current={activity.id === focus ? 'true' : undefined}
            >
              <div>
                <b>{activity.title}</b>
                <small>
                  {kindLabels[activity.kind]} ·{' '}
                  {describeSchedule(activity.schedule)} · {place(activity)}
                </small>
                <small>
                  {spots == null
                    ? `${count} ${activity.joinMode === 'membership' ? 'joined' : 'going'}`
                    : spots
                      ? `${spots} of ${activity.capacity} places left`
                      : 'Full'}
                </small>
              </div>
              {activity.joinMode === 'membership' ? (
                membership ? (
                  <em>Joined</em>
                ) : (
                  <button
                    className="button"
                    disabled={disabled || spots === 0}
                    onClick={() => join(activity)}
                  >
                    {spots === 0 ? 'Full' : 'Join'}
                  </button>
                )
              ) : !options.length ? (
                <em>No upcoming dates</em>
              ) : (
                <div className="form-actions">
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
                          {formatDate(item.date, true)} ·{' '}
                          {formatTime(item.startTime)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {booked ? (
                    <em>Booked</em>
                  ) : (
                    <button
                      className="button"
                      disabled={disabled || spots === 0}
                      onClick={() => join(activity, date)}
                    >
                      {spots === 0 ? 'Full' : 'Book'}
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <p className="form-note">
        Joining and bookings are saved in this browser preview and appear in the
        church team’s attendance lists.
      </p>
    </section>
  );
}
