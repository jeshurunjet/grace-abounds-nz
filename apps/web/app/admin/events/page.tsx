'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AdminShell } from '../../components/admin-shell';
import { useContent } from '../../components/content-provider';
import { useToast } from '../../components/toast';
import { useActivities } from '../../components/activity-ui';
import {
  blankActivity,
  describeSchedule,
  formatDate,
  formatTime,
  isLive,
  kindLabels,
  participants,
  upcoming,
  validateActivity,
  weekdays,
  type Activity,
  type ActivityException,
  type ActivityKind,
  type ActivitySchedule,
} from '../../lib/activities';
import type { ContentState } from '../../lib/content';

const statusLabels = {
  draft: 'Draft — hidden',
  scheduled: 'Scheduled — goes live later',
  published: 'Live on the website',
  archived: 'Archived — hidden',
};

/** One editor for services, groups, studies, events and ministries. */
export default function ActivitiesAdmin() {
  const { content, update, ready, storageError, retrySave } = useContent();
  const { push } = useToast();
  const { exceptions, participations, locations, place, now } = useActivities();
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<ActivityKind | 'all'>('all');
  const [newKind, setNewKind] = useState<ActivityKind>('event');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rosterDate, setRosterDate] = useState('');
  const activities = content.activities;
  const visible = activities.filter(
    (item) =>
      (kindFilter === 'all' || item.kind === kindFilter) &&
      `${item.title} ${item.status} ${kindLabels[item.kind]}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const current = activities.find((item) => item.id === selected) ?? visible[0];
  const scheduled = activities
    .filter((item) => item.status === 'scheduled')
    .sort((a, b) => a.publishAt.localeCompare(b.publishAt));
  const errors = current ? validateActivity(current, activities) : [];
  const disabled = !ready || !!storageError;

  async function save(
    recipe: (state: ContentState) => ContentState,
    success?: string,
  ) {
    const saved = await update(recipe);
    if (!saved)
      push(
        'This change could not be saved in this browser. Please try again.',
        'error',
      );
    else if (success) push(success, 'info');
    return saved;
  }
  function change(patch: Partial<Activity>) {
    if (!current) return;
    void save((state) => ({
      ...state,
      activities: state.activities.map((item) =>
        item.id === current.id ? { ...item, ...patch } : item,
      ),
    }));
  }
  function changeSchedule(patch: Partial<ActivitySchedule>) {
    if (current) change({ schedule: { ...current.schedule, ...patch } });
  }
  function setException(
    date: string,
    patch: Partial<ActivityException> | null,
  ) {
    if (!current) return;
    void save((state) => {
      const others = state.activityExceptions.filter(
        (item) => !(item.activityId === current.id && item.date === date),
      );
      const existing = state.activityExceptions.find(
        (item) => item.activityId === current.id && item.date === date,
      );
      return {
        ...state,
        activityExceptions: patch
          ? [
              ...others,
              {
                id: existing?.id ?? crypto.randomUUID(),
                activityId: current.id,
                date,
                kind: 'cancelled',
                note: '',
                startTime: '',
                endTime: '',
                venue: '',
                ...existing,
                ...patch,
              },
            ]
          : others,
      };
    });
  }
  async function create() {
    const activity = blankActivity(newKind);
    const saved = await save(
      (state) => ({ ...state, activities: [...state.activities, activity] }),
      `New ${kindLabels[newKind].toLowerCase()} created as a draft.`,
    );
    if (saved) {
      setSelected(activity.id);
      setKindFilter('all');
      setQuery('');
    }
  }
  async function remove() {
    if (!current) return;
    const saved = await save(
      (state) => ({
        ...state,
        activities: state.activities.filter((item) => item.id !== current.id),
        activityExceptions: state.activityExceptions.filter(
          (item) => item.activityId !== current.id,
        ),
        participations: state.participations.filter(
          (item) => item.activityId !== current.id,
        ),
      }),
      `${current.title} deleted.`,
    );
    if (saved) {
      setSelected('');
      setConfirmDelete(false);
    }
  }
  function removeParticipant(id: string, name: string) {
    void save(
      (state) => ({
        ...state,
        participations: state.participations.filter((item) => item.id !== id),
      }),
      `${name} removed.`,
    );
  }

  const dates = current ? upcoming(current, exceptions, 8) : [];
  const roster =
    current?.joinMode === 'booking'
      ? ((rosterDate && dates.some((item) => item.date === rosterDate)
          ? rosterDate
          : dates[0]?.date) ?? '')
      : '';
  const people = current ? participants(current, participations, roster) : [];
  const schedule = current?.schedule;

  return (
    <AdminShell>
      {storageError && (
        <div className="publishing-errors" role="alert">
          <p>{storageError}</p>
          <button className="button button-outline" onClick={retrySave}>
            Retry save
          </button>
        </div>
      )}
      <header className="workspace-header">
        <p className="eyebrow">Activities &amp; calendar</p>
        <h1>Manage activities</h1>
        <p>
          Services, connect groups, Bible studies, events and ministry teams.
          Changes go live immediately, or at the release time you schedule. This
          browser preview does not sync to Google or Outlook yet.
        </p>
        <div className="form-actions">
          <label>
            <span className="sr-only">Type of new activity</span>
            <select
              value={newKind}
              onChange={(event) =>
                setNewKind(event.target.value as ActivityKind)
              }
            >
              {Object.entries(kindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="button" disabled={disabled} onClick={create}>
            New activity
          </button>
        </div>
      </header>

      {scheduled.length > 0 && (
        <section
          className="panel scheduled-releases"
          aria-label="Scheduled releases"
        >
          <h2>Scheduled releases</h2>
          <ul>
            {scheduled.map((item) => (
              <li key={item.id}>
                <button
                  className="link-button"
                  onClick={() => setSelected(item.id)}
                >
                  <b>{item.title}</b>
                </button>
                <small>
                  {isLive(item, now.stamp)
                    ? 'Now live'
                    : item.publishAt
                      ? `Goes live ${formatDate(item.publishAt.slice(0, 10), true)} at ${formatTime(item.publishAt.slice(11))}`
                      : 'No release time set'}
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="editor-layout">
        <aside className="panel item-list">
          <input
            type="search"
            aria-label="Search activities"
            placeholder="Search activities"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            aria-label="Filter by type"
            value={kindFilter}
            onChange={(event) =>
              setKindFilter(event.target.value as ActivityKind | 'all')
            }
          >
            <option value="all">All types</option>
            {Object.entries(kindLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {!activities.length && (
            <p className="form-note">
              No activities yet. Create the first one above.
            </p>
          )}
          {activities.length > 0 && !visible.length && (
            <p className="form-note">No activities match.</p>
          )}
          {visible.map((item) => (
            <button
              className={current?.id === item.id ? 'active' : ''}
              key={item.id}
              onClick={() => {
                setSelected(item.id);
                setConfirmDelete(false);
              }}
            >
              <b>{item.title}</b>
              <small>
                {kindLabels[item.kind]} ·{' '}
                {item.status === 'scheduled' && isLive(item, now.stamp)
                  ? 'live (scheduled)'
                  : item.status}
              </small>
            </button>
          ))}
        </aside>

        {current && schedule && (
          <section className="panel cms-form">
            <h2>{current.title}</h2>
            <fieldset className="cms-fields" disabled={disabled}>
              {errors.length > 0 && (
                <div className="publishing-errors" role="status">
                  <strong>Check these details</strong>
                  <ul>
                    {errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <h3>Details</h3>
              <label>
                Type
                <select
                  value={current.kind}
                  onChange={(event) =>
                    change({ kind: event.target.value as ActivityKind })
                  }
                >
                  {Object.entries(kindLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  ['title', 'Title'],
                  ['slug', 'URL slug'],
                  ['leader', 'Leader (optional)'],
                  ['tag', 'Label shown on cards'],
                  ['image', 'Image URL or /images/ path'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    value={current[key]}
                    onChange={(event) => change({ [key]: event.target.value })}
                  />
                </label>
              ))}
              <label>
                Description
                <textarea
                  rows={4}
                  value={current.summary}
                  onChange={(event) => change({ summary: event.target.value })}
                />
              </label>
              <label>
                Campus
                <select
                  value={current.locationId}
                  onChange={(event) =>
                    change({ locationId: event.target.value })
                  }
                >
                  <option value="">Off-site / no campus</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Room or place (optional)
                <input
                  value={current.venue}
                  placeholder="e.g. Main Auditorium, Various cafés, Online"
                  onChange={(event) => change({ venue: event.target.value })}
                />
              </label>

              <h3>Schedule</h3>
              <label>
                Repeats
                <select
                  value={schedule.repeat}
                  onChange={(event) =>
                    changeSchedule({
                      repeat: event.target.value as ActivitySchedule['repeat'],
                    })
                  }
                >
                  <option value="once">One-off date</option>
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                  <option value="ongoing">
                    No fixed dates (team or ministry)
                  </option>
                </select>
              </label>
              {schedule.repeat !== 'ongoing' && (
                <>
                  <label>
                    {schedule.repeat === 'once' ? 'Date' : 'Starts from'}
                    <input
                      type="date"
                      value={schedule.date}
                      onChange={(event) =>
                        changeSchedule({ date: event.target.value })
                      }
                    />
                  </label>
                  {schedule.repeat !== 'once' && (
                    <label>
                      Ends on (optional)
                      <input
                        type="date"
                        value={schedule.until}
                        onChange={(event) =>
                          changeSchedule({ until: event.target.value })
                        }
                      />
                    </label>
                  )}
                  {['weekly', 'fortnightly'].includes(schedule.repeat) && (
                    <fieldset className="weekday-picker">
                      <legend>On</legend>
                      {weekdays.map((day, index) => (
                        <label key={day}>
                          <input
                            type="checkbox"
                            checked={schedule.days.includes(index)}
                            onChange={(event) =>
                              changeSchedule({
                                days: event.target.checked
                                  ? [...schedule.days, index].sort()
                                  : schedule.days.filter(
                                      (item) => item !== index,
                                    ),
                              })
                            }
                          />
                          {day.slice(0, 3)}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {schedule.repeat === 'monthly' && (
                    <div className="form-actions">
                      <label>
                        Week
                        <select
                          value={schedule.monthWeek}
                          onChange={(event) =>
                            changeSchedule({
                              monthWeek: Number(event.target.value),
                            })
                          }
                        >
                          <option value={1}>First</option>
                          <option value={2}>Second</option>
                          <option value={3}>Third</option>
                          <option value={4}>Fourth</option>
                          <option value={-1}>Last</option>
                        </select>
                      </label>
                      <label>
                        Day
                        <select
                          value={schedule.monthDay}
                          onChange={(event) =>
                            changeSchedule({
                              monthDay: Number(event.target.value),
                            })
                          }
                        >
                          {weekdays.map((day, index) => (
                            <option key={day} value={index}>
                              {day}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                  <div className="form-actions">
                    <label>
                      Starts
                      <input
                        type="time"
                        value={schedule.startTime}
                        onChange={(event) =>
                          changeSchedule({ startTime: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Ends
                      <input
                        type="time"
                        value={schedule.endTime}
                        onChange={(event) =>
                          changeSchedule({ endTime: event.target.value })
                        }
                      />
                    </label>
                  </div>
                </>
              )}
              <p className="form-note">
                {describeSchedule(schedule)} · {place(current)} · New Zealand
                time
              </p>

              <h3>Sign-ups</h3>
              <label>
                How members take part
                <select
                  value={current.joinMode}
                  onChange={(event) =>
                    change({
                      joinMode: event.target.value as Activity['joinMode'],
                    })
                  }
                >
                  <option value="membership">Join once (ongoing member)</option>
                  <option value="booking">Book a place for each date</option>
                  <option value="none">No sign-up</option>
                </select>
              </label>
              {current.joinMode !== 'none' && (
                <label>
                  {current.joinMode === 'booking'
                    ? 'Places per date (blank = no limit)'
                    : 'Maximum members (blank = no limit)'}
                  <input
                    type="number"
                    min={1}
                    value={current.capacity ?? ''}
                    onChange={(event) =>
                      change({
                        capacity:
                          event.target.value === ''
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  />
                </label>
              )}

              <h3>Visibility</h3>
              <label>
                Status
                <select
                  value={current.status}
                  onChange={(event) =>
                    change({ status: event.target.value as Activity['status'] })
                  }
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {current.status === 'scheduled' && (
                <>
                  <label>
                    Goes live at (New Zealand time)
                    <input
                      type="datetime-local"
                      value={current.publishAt}
                      onChange={(event) =>
                        change({ publishAt: event.target.value })
                      }
                    />
                  </label>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="button"
                      onClick={() =>
                        change({ status: 'published', publishAt: '' })
                      }
                    >
                      Publish now
                    </button>
                    <button
                      type="button"
                      className="button button-outline"
                      onClick={() => change({ status: 'draft' })}
                    >
                      Cancel schedule
                    </button>
                  </div>
                </>
              )}
              <p className="form-note">
                {isLive(current, now.stamp) ? (
                  <>
                    Live now.{' '}
                    <Link href={`/events/${current.slug}`}>
                      View public page
                    </Link>
                  </>
                ) : (
                  'Not visible on the website.'
                )}
              </p>
            </fieldset>

            {dates.length > 0 && schedule.repeat !== 'once' && (
              <>
                <h3>Upcoming dates</h3>
                <p className="form-note">
                  Cancel or change a single date. Members and the “This Sunday”
                  status update straight away.
                </p>
                <ul className="activity-dates editor-dates">
                  {dates.map((date) => {
                    const exception = exceptions.find(
                      (item) =>
                        item.activityId === current.id &&
                        item.date === date.date,
                    );
                    return (
                      <li
                        key={date.key}
                        className={date.cancelled ? 'cancelled' : ''}
                      >
                        <b>
                          {formatDate(date.date, true)} ·{' '}
                          {date.cancelled
                            ? 'Cancelled'
                            : formatTime(date.startTime)}
                        </b>
                        {exception ? (
                          <fieldset className="cms-fields" disabled={disabled}>
                            <label>
                              Note for members
                              <input
                                value={exception.note}
                                placeholder="e.g. Combined service at Manukau"
                                onChange={(event) =>
                                  setException(date.date, {
                                    note: event.target.value,
                                  })
                                }
                              />
                            </label>
                            {exception.kind === 'changed' && (
                              <div className="form-actions">
                                <label>
                                  New start
                                  <input
                                    type="time"
                                    value={exception.startTime}
                                    onChange={(event) =>
                                      setException(date.date, {
                                        startTime: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <label>
                                  New end
                                  <input
                                    type="time"
                                    value={exception.endTime}
                                    onChange={(event) =>
                                      setException(date.date, {
                                        endTime: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <label>
                                  New place
                                  <input
                                    value={exception.venue}
                                    onChange={(event) =>
                                      setException(date.date, {
                                        venue: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                              </div>
                            )}
                            <button
                              type="button"
                              className="button button-outline"
                              onClick={() => setException(date.date, null)}
                            >
                              Restore usual schedule
                            </button>
                          </fieldset>
                        ) : (
                          <div className="form-actions">
                            <button
                              type="button"
                              className="button button-outline"
                              disabled={disabled}
                              onClick={() =>
                                setException(date.date, { kind: 'cancelled' })
                              }
                            >
                              Cancel this date
                            </button>
                            <button
                              type="button"
                              className="button button-outline"
                              disabled={disabled}
                              onClick={() =>
                                setException(date.date, {
                                  kind: 'changed',
                                  startTime: current.schedule.startTime,
                                  endTime: current.schedule.endTime,
                                  venue: current.venue,
                                })
                              }
                            >
                              Change time or place
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {current.joinMode !== 'none' && (
              <>
                <h3>
                  {current.joinMode === 'booking' ? 'Bookings' : 'Members'} (
                  {people.length}
                  {current.capacity != null ? ` of ${current.capacity}` : ''})
                </h3>
                {current.joinMode === 'booking' && dates.length > 0 && (
                  <label>
                    Date
                    <select
                      value={roster}
                      onChange={(event) => setRosterDate(event.target.value)}
                    >
                      {dates.map((date) => (
                        <option key={date.date} value={date.date}>
                          {formatDate(date.date, true)}
                          {date.cancelled ? ' (cancelled)' : ''} ·{' '}
                          {
                            participants(current, participations, date.date)
                              .length
                          }{' '}
                          booked
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {!people.length && <p className="form-note">No one yet.</p>}
                <ul className="attendee-list">
                  {people.map((entry) => {
                    const user = content.users.find(
                      (item) => item.id === entry.userId,
                    );
                    const name = user?.name ?? 'Unknown member';
                    return (
                      <li key={entry.id}>
                        <Link href={`/profile/${entry.userId}`}>{name}</Link>
                        <small>
                          {user?.email} · since{' '}
                          {new Date(entry.createdAt).toLocaleDateString(
                            'en-NZ',
                          )}
                        </small>
                        <button
                          className="text-danger"
                          disabled={disabled}
                          onClick={() => removeParticipant(entry.id, name)}
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <div className="form-actions">
              {confirmDelete ? (
                <>
                  <button
                    className="button text-danger"
                    disabled={disabled}
                    onClick={remove}
                  >
                    Confirm delete — removes its dates, members and bookings
                  </button>
                  <button
                    className="button button-outline"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Keep activity
                  </button>
                </>
              ) : (
                <button
                  className="text-danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete activity
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
