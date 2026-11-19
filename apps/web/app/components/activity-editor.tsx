'use client';

import { useEffect, useId, useState } from 'react';
import { RotateCcw, Trash, X } from 'lucide-react';
import {
  activityInput,
  addDays,
  blankActivity,
  formatDate,
  formatTime,
  kindLabels,
  nzNow,
  occurrences,
  weekdays,
  type ActivityException,
  type ActivityInput,
  type ActivityKind,
  type JoinMode,
  type Repeat,
  type StaffActivity,
} from '@grace-abounds/validation';
import { SidePanel } from './editor-kit/side-panel';
import { KitConfirm } from './editor-kit/confirm';
import { KitPhoto, KitText } from './editor-kit/parts';
import { HistoryButton, HistoryPanel } from './editor-kit/history-panel';
import { ActivityRoster } from './activity-roster';
import { CalendarSyncStatus } from './calendar-sync-status';
import { useToast } from './toast';
import { api, ApiError, errorMessage } from '../lib/api-client';

/*
 * The short staff editor for one activity (Phase 3A), opened from the Home
 * calendar and its list. Fields change a local draft only; Save writes the
 * record (with the version this editor loaded). Changing or cancelling one
 * date is a separate action with its own result, available once the
 * activity is saved and has no unsaved edits.
 */

const repeatLabels: Record<Repeat, string> = {
  once: 'One date',
  weekly: 'Every week',
  fortnightly: 'Every two weeks',
  monthly: 'Once a month',
  ongoing: 'Ongoing (no set dates)',
};
const joinLabels: Record<JoinMode, string> = {
  none: 'No sign-up',
  booking: 'People book a place for each date',
  membership: 'People join once (group or team)',
};
const monthWeeks: [number, string][] = [
  [1, 'First'],
  [2, 'Second'],
  [3, 'Third'],
  [4, 'Fourth'],
  [-1, 'Last'],
];

type Location = { id: string; name: string };
export type EditorTarget = {
  activity: StaffActivity | null;
  kind?: ActivityKind;
};

function blankInput(kind: ActivityKind = 'event'): ActivityInput {
  return { ...activityInput(blankActivity(kind)), title: '' };
}

export function ActivityEditor({
  target,
  exceptions,
  locations,
  onClose,
  onSaved,
  onDeleted,
}: {
  target: EditorTarget | null;
  exceptions: ActivityException[];
  locations: Location[];
  onClose: () => void;
  onSaved: (saved: StaffActivity, exceptions?: ActivityException[]) => void;
  onDeleted: (id: string) => void;
}) {
  const toast = useToast();
  const ids = useId();
  const [value, setValue] = useState<ActivityInput>(blankInput());
  const [original, setOriginal] = useState<ActivityInput>(blankInput());
  const [current, setCurrent] = useState<StaffActivity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [history, setHistory] = useState(false);
  const [dateForm, setDateForm] = useState<{
    date: string;
    mode: 'cancel' | 'change';
    note: string;
    startTime: string;
    endTime: string;
    venue: string;
  } | null>(null);

  // A new target (or a reopened one) starts a fresh draft.
  useEffect(() => {
    if (!target) return;
    const start = target.activity
      ? activityInput(target.activity)
      : blankInput(target.kind);
    setValue(start);
    setOriginal(start);
    setCurrent(target.activity);
    setError('');
    setFieldErrors({});
    setConflict(false);
    setDateForm(null);
  }, [target]);

  const dirty = JSON.stringify(value) !== JSON.stringify(original);
  const set = <K extends keyof ActivityInput>(key: K, next: ActivityInput[K]) =>
    setValue((state) => ({ ...state, [key]: next }));
  const setSchedule = (patch: Partial<ActivityInput['schedule']>) =>
    setValue((state) => ({
      ...state,
      schedule: { ...state.schedule, ...patch },
    }));
  const err = (key: string) => fieldErrors[key];

  function fail(failure: unknown) {
    if (failure instanceof ApiError && failure.code === 'VERSION_CONFLICT') {
      setConflict(true);
      setError(
        'Someone else changed this activity since you opened it. Your edits are still here.',
      );
      return;
    }
    if (failure instanceof ApiError && failure.fieldErrors)
      setFieldErrors(failure.fieldErrors);
    setError(errorMessage(failure));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      const body = JSON.stringify(value);
      const result = current
        ? await api<StaffActivity>(`/staff/activities/${current.id}`, {
            method: 'PATCH',
            version: current.version,
            body,
          })
        : await api<StaffActivity>('/staff/activities', {
            method: 'POST',
            body,
          });
      const saved = result.data;
      setCurrent(saved);
      const next = activityInput(saved);
      setValue(next);
      setOriginal(next);
      onSaved(saved);
      toast.push(
        saved.status === 'published'
          ? `${saved.title} saved. It’s on the calendar for everyone.`
          : saved.status === 'scheduled'
            ? `${saved.title} saved. It goes live on ${formatDate(saved.publishAt.slice(0, 10), true)}.`
            : `${saved.title} saved as ${saved.status === 'archived' ? 'archived' : 'a draft'}. Only staff can see it.`,
        'success',
      );
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }

  async function reloadLatest() {
    if (!current) return;
    try {
      const { activities } = (
        await api<{ activities: StaffActivity[] }>('/staff/activities')
      ).data;
      const latest = activities.find((item) => item.id === current.id);
      if (!latest) {
        toast.push('That activity was deleted by someone else.', 'info');
        onClose();
        return;
      }
      // Keep the editor's values; the next Save replaces the latest version.
      setCurrent(latest);
      setOriginal(activityInput(latest));
      setConflict(false);
      setError('Loaded the latest version. Check your changes, then Save.');
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  async function remove() {
    if (!current) return;
    setConfirmDelete(false);
    setBusy(true);
    try {
      await api(`/staff/activities/${current.id}`, {
        method: 'DELETE',
        version: current.version,
      });
      toast.push(`${current.title} deleted.`, 'success');
      onDeleted(current.id);
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }

  async function dateAction(date: string, body: object | null) {
    if (!current) return;
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      const result = await api<StaffActivity>(
        `/staff/activities/${current.id}/exceptions/${date}`,
        {
          method: body ? 'PUT' : 'DELETE',
          version: current.version,
          ...(body && { body: JSON.stringify(body) }),
        },
      );
      const { data, exceptions: changed } = result as typeof result & {
        exceptions?: ActivityException[];
      };
      setCurrent(data);
      setOriginal(activityInput(data));
      setValue(activityInput(data));
      setDateForm(null);
      onSaved(data, changed);
      toast.push(
        `${formatDate(date, true)} ${body ? ((body as { kind: string }).kind === 'cancelled' ? 'cancelled' : 'changed') : 'back to the usual schedule'}.`,
        'success',
      );
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }

  const today = nzNow().date;
  const mine = current
    ? exceptions.filter((item) => item.activityId === current.id)
    : [];
  const dates = current
    ? occurrences([current], mine, today, addDays(today, 400)).slice(0, 8)
    : [];
  // Changed or cancelled dates in the past stay listed only while upcoming.
  const repeat = value.schedule.repeat;
  const dated = repeat !== 'ongoing';

  return (
    <>
      <SidePanel
        open={!!target}
        title={current ? 'Edit activity' : 'Create activity'}
        eyebrow="Calendar"
        dirty={dirty}
        busy={busy}
        onClose={onClose}
        footer={(requestClose) => (
          <>
            {current &&
              current.status !== 'published' &&
              current.status !== 'scheduled' && (
                <button
                  type="button"
                  className="kit-remove"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash aria-hidden="true" size={16} />
                  Delete
                </button>
              )}
            <button
              type="button"
              className="button button-outline"
              onClick={requestClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button"
              disabled={busy || (!dirty && !!current)}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      >
        {!current && (
          <p className="kit-note">
            Nothing is created until you select Save. Keep it as a draft until
            it’s ready; only published activities appear for members and the
            public.
          </p>
        )}
        {current && <HistoryButton onClick={() => setHistory(true)} />}

        <div className="kit-field">
          <label htmlFor={`${ids}-kind`}>Type</label>
          <select
            id={`${ids}-kind`}
            value={value.kind}
            onChange={(event) =>
              set('kind', event.target.value as ActivityKind)
            }
          >
            {Object.entries(kindLabels).map(([kind, label]) => (
              <option key={kind} value={kind}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <KitText
          label="Title"
          value={value.title}
          error={err('title')}
          onChange={(next) => set('title', next)}
        />
        <KitText
          label="Description"
          multiline
          rows={3}
          value={value.summary}
          error={err('summary')}
          onChange={(next) => set('summary', next)}
        />
        <div className="kit-field">
          <label htmlFor={`${ids}-campus`}>Campus</label>
          <select
            id={`${ids}-campus`}
            value={value.locationId}
            aria-invalid={err('locationId') ? true : undefined}
            onChange={(event) => set('locationId', event.target.value)}
          >
            <option value="">Off-site or several places</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
            {value.locationId &&
              !locations.some(
                (location) => location.id === value.locationId,
              ) && <option value={value.locationId}>{value.locationId}</option>}
          </select>
          {err('locationId') && (
            <small className="kit-error">{err('locationId')}</small>
          )}
        </div>
        <KitText
          label="Room or place"
          hint="For example Main Auditorium, or a café for groups that move around."
          value={value.venue}
          error={err('venue')}
          onChange={(next) => set('venue', next)}
        />

        <fieldset className="kit-fieldset">
          <legend>When</legend>
          <div className="kit-field">
            <label htmlFor={`${ids}-repeat`}>Repeats</label>
            <select
              id={`${ids}-repeat`}
              value={repeat}
              onChange={(event) =>
                setSchedule({ repeat: event.target.value as Repeat })
              }
            >
              {Object.entries(repeatLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="kit-pair">
            <div className="kit-field">
              <label htmlFor={`${ids}-date`}>
                {repeat === 'once' ? 'Date' : 'Starts on'}
              </label>
              <input
                id={`${ids}-date`}
                type="date"
                value={value.schedule.date}
                aria-invalid={err('schedule.date') ? true : undefined}
                onChange={(event) => setSchedule({ date: event.target.value })}
              />
              {err('schedule.date') && (
                <small className="kit-error">{err('schedule.date')}</small>
              )}
            </div>
            {repeat !== 'once' && (
              <div className="kit-field">
                <label htmlFor={`${ids}-until`}>Last date (optional)</label>
                <input
                  id={`${ids}-until`}
                  type="date"
                  value={value.schedule.until}
                  aria-invalid={err('schedule.until') ? true : undefined}
                  onChange={(event) =>
                    setSchedule({ until: event.target.value })
                  }
                />
                {err('schedule.until') && (
                  <small className="kit-error">{err('schedule.until')}</small>
                )}
              </div>
            )}
          </div>
          {(repeat === 'weekly' || repeat === 'fortnightly') && (
            <fieldset className="kit-days">
              <legend>On</legend>
              {weekdays.map((day, index) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={value.schedule.days.includes(index)}
                    onChange={(event) =>
                      setSchedule({
                        days: event.target.checked
                          ? [...value.schedule.days, index].sort()
                          : value.schedule.days.filter(
                              (item) => item !== index,
                            ),
                      })
                    }
                  />
                  {day.slice(0, 3)}
                </label>
              ))}
              {err('schedule.days') && (
                <small className="kit-error">{err('schedule.days')}</small>
              )}
            </fieldset>
          )}
          {repeat === 'monthly' && (
            <div className="kit-pair">
              <div className="kit-field">
                <label htmlFor={`${ids}-week`}>Week</label>
                <select
                  id={`${ids}-week`}
                  value={value.schedule.monthWeek}
                  onChange={(event) =>
                    setSchedule({ monthWeek: Number(event.target.value) })
                  }
                >
                  {monthWeeks.map(([week, label]) => (
                    <option key={week} value={week}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="kit-field">
                <label htmlFor={`${ids}-day`}>Day</label>
                <select
                  id={`${ids}-day`}
                  value={value.schedule.monthDay}
                  onChange={(event) =>
                    setSchedule({ monthDay: Number(event.target.value) })
                  }
                >
                  {weekdays.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="kit-pair">
            <div className="kit-field">
              <label htmlFor={`${ids}-start`}>
                Start time{dated ? '' : ' (optional)'}
              </label>
              <input
                id={`${ids}-start`}
                type="time"
                value={value.schedule.startTime}
                aria-invalid={err('schedule.startTime') ? true : undefined}
                onChange={(event) =>
                  setSchedule({ startTime: event.target.value })
                }
              />
              {err('schedule.startTime') && (
                <small className="kit-error">{err('schedule.startTime')}</small>
              )}
            </div>
            <div className="kit-field">
              <label htmlFor={`${ids}-end`}>End time (optional)</label>
              <input
                id={`${ids}-end`}
                type="time"
                value={value.schedule.endTime}
                aria-invalid={err('schedule.endTime') ? true : undefined}
                onChange={(event) =>
                  setSchedule({ endTime: event.target.value })
                }
              />
              {err('schedule.endTime') && (
                <small className="kit-error">{err('schedule.endTime')}</small>
              )}
            </div>
          </div>
          <small className="kit-hint">New Zealand time.</small>
        </fieldset>

        <fieldset className="kit-fieldset">
          <legend>Joining</legend>
          <div className="kit-field">
            <label htmlFor={`${ids}-join`}>Sign-up</label>
            <select
              id={`${ids}-join`}
              value={value.joinMode}
              onChange={(event) => {
                const joinMode = event.target.value as JoinMode;
                setValue((state) => ({
                  ...state,
                  joinMode,
                  capacity: joinMode === 'none' ? null : state.capacity,
                }));
              }}
            >
              {Object.entries(joinLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {value.joinMode !== 'none' && (
            <div className="kit-field">
              <label htmlFor={`${ids}-capacity`}>Places (optional)</label>
              <small id={`${ids}-capacity-hint`} className="kit-hint">
                {value.joinMode === 'booking'
                  ? 'Places for each date. Leave blank for no limit.'
                  : 'Members in the group. Leave blank for no limit.'}
              </small>
              <input
                id={`${ids}-capacity`}
                type="number"
                min={1}
                inputMode="numeric"
                aria-describedby={`${ids}-capacity-hint`}
                aria-invalid={err('capacity') ? true : undefined}
                value={value.capacity ?? ''}
                onChange={(event) =>
                  set(
                    'capacity',
                    event.target.value === ''
                      ? null
                      : Number(event.target.value),
                  )
                }
              />
              {err('capacity') && (
                <small className="kit-error">{err('capacity')}</small>
              )}
            </div>
          )}
        </fieldset>

        <KitPhoto
          label="Photo"
          value={value.image}
          onChange={(next) => set('image', next)}
        />
        <KitText
          label="Leader (optional)"
          value={value.leader}
          error={err('leader')}
          onChange={(next) => set('leader', next)}
        />

        <div className="kit-field">
          <label htmlFor={`${ids}-status`}>Visibility</label>
          <select
            id={`${ids}-status`}
            value={value.status}
            onChange={(event) => {
              const status = event.target.value as ActivityInput['status'];
              setValue((state) => ({
                ...state,
                status,
                publishAt: status === 'published' ? state.publishAt : '',
              }));
            }}
          >
            <option value="draft">Draft — only staff can see it</option>
            <option value="published">
              Published — on the calendar for everyone
            </option>
            <option value="archived">
              Archived — hidden, kept for records
            </option>
          </select>
          {value.status === 'published' && value.publishAt && (
            <p className="kit-hint">
              Goes live on {formatDate(value.publishAt.slice(0, 10), true)} at{' '}
              {formatTime(value.publishAt.slice(11))}.{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => set('publishAt', '')}
              >
                Publish as soon as I save
              </button>
            </p>
          )}
        </div>

        {current && dated && (
          <section
            className="activity-dates-editor"
            aria-label="Upcoming dates"
          >
            <h3>Upcoming dates</h3>
            <p className="kit-hint">
              {dirty
                ? 'Save your changes before changing a single date.'
                : 'Change or cancel one date without changing the others.'}
            </p>
            {!dates.length && <p className="kit-hint">No upcoming dates.</p>}
            <ul>
              {dates.map((item) => {
                const open = dateForm?.date === item.date;
                return (
                  <li key={item.key}>
                    <span className={item.cancelled ? 'cancelled' : ''}>
                      <strong>{formatDate(item.date, true)}</strong>{' '}
                      {item.cancelled
                        ? 'Cancelled'
                        : `${formatTime(item.startTime)}${item.changed ? ' · changed' : ''}`}
                      {item.note && <small> — {item.note}</small>}
                    </span>
                    <span className="activity-date-actions">
                      {item.cancelled || item.changed ? (
                        <button
                          type="button"
                          className="button button-outline"
                          disabled={busy || dirty}
                          onClick={() => void dateAction(item.date, null)}
                        >
                          <RotateCcw aria-hidden="true" size={14} />
                          Back to usual
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="button button-outline"
                            disabled={busy || dirty}
                            onClick={() =>
                              setDateForm({
                                date: item.date,
                                mode: 'change',
                                note: '',
                                startTime: '',
                                endTime: '',
                                venue: '',
                              })
                            }
                          >
                            Change
                          </button>
                          <button
                            type="button"
                            className="button button-outline"
                            disabled={busy || dirty}
                            onClick={() =>
                              setDateForm({
                                date: item.date,
                                mode: 'cancel',
                                note: '',
                                startTime: '',
                                endTime: '',
                                venue: '',
                              })
                            }
                          >
                            Cancel date
                          </button>
                        </>
                      )}
                    </span>
                    {open && dateForm && (
                      <div className="activity-date-form">
                        {dateForm.mode === 'change' && (
                          <div className="kit-pair">
                            <div className="kit-field">
                              <label htmlFor={`${ids}-dstart`}>
                                Start time
                              </label>
                              <input
                                id={`${ids}-dstart`}
                                type="time"
                                value={dateForm.startTime}
                                onChange={(event) =>
                                  setDateForm({
                                    ...dateForm,
                                    startTime: event.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="kit-field">
                              <label htmlFor={`${ids}-dend`}>End time</label>
                              <input
                                id={`${ids}-dend`}
                                type="time"
                                value={dateForm.endTime}
                                onChange={(event) =>
                                  setDateForm({
                                    ...dateForm,
                                    endTime: event.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>
                        )}
                        {dateForm.mode === 'change' && (
                          <KitText
                            label="Room or place for this date"
                            value={dateForm.venue}
                            onChange={(venue) =>
                              setDateForm({ ...dateForm, venue })
                            }
                          />
                        )}
                        <KitText
                          label={
                            dateForm.mode === 'cancel'
                              ? 'Note for people (optional)'
                              : 'Note (optional)'
                          }
                          hint={
                            dateForm.mode === 'cancel'
                              ? 'For example: Join the combined service at Manukau.'
                              : undefined
                          }
                          value={dateForm.note}
                          error={err('startTime') || err('endTime')}
                          onChange={(note) =>
                            setDateForm({ ...dateForm, note })
                          }
                        />
                        <div className="activity-date-form-actions">
                          <button
                            type="button"
                            className="button"
                            disabled={busy}
                            onClick={() =>
                              void dateAction(item.date, {
                                kind:
                                  dateForm.mode === 'cancel'
                                    ? 'cancelled'
                                    : 'changed',
                                note: dateForm.note,
                                startTime: dateForm.startTime,
                                endTime: dateForm.endTime,
                                venue: dateForm.venue,
                              })
                            }
                          >
                            {dateForm.mode === 'cancel'
                              ? `Cancel ${formatDate(item.date)}`
                              : 'Save this date'}
                          </button>
                          <button
                            type="button"
                            className="kit-icon-button"
                            aria-label="Close"
                            onClick={() => setDateForm(null)}
                          >
                            <X aria-hidden="true" size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {current && (
          <ActivityRoster activity={current} exceptions={exceptions} />
        )}

        {current && (
          <CalendarSyncStatus
            activityId={current.id}
            isPublic={current.status === 'published'}
            version={current.version}
          />
        )}

        {error && (
          <div className="publishing-errors" role="alert">
            <p>{error}</p>
            {conflict && (
              <button
                type="button"
                className="button button-outline"
                onClick={() => void reloadLatest()}
              >
                Load latest version
              </button>
            )}
          </div>
        )}
      </SidePanel>
      <KitConfirm
        open={confirmDelete}
        title={`Delete “${current?.title ?? ''}”?`}
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
      >
        <p>
          This can’t be undone. Its saved history stays in the audit log.
          Published activities are archived instead.
        </p>
      </KitConfirm>
      {current && (
        <HistoryPanel
          open={history}
          targets={[
            {
              label: current.title,
              entityType: 'activities',
              entityKey: current.id,
              version: current.version,
              blocked: dirty
                ? 'Save or discard your changes first.'
                : undefined,
              restoreNote:
                'The activity’s details go back to that version as a new save. Its visibility and changed dates stay as they are now.',
            },
          ]}
          onClose={() => setHistory(false)}
          onRestored={async () => {
            const { activities, exceptions: all } = (
              await api<{
                activities: StaffActivity[];
                exceptions: ActivityException[];
              }>('/staff/activities')
            ).data;
            const latest = activities.find((item) => item.id === current.id);
            if (latest) {
              setCurrent(latest);
              setValue(activityInput(latest));
              setOriginal(activityInput(latest));
              onSaved(
                latest,
                all.filter((item) => item.activityId === latest.id),
              );
            }
          }}
        />
      )}
    </>
  );
}
