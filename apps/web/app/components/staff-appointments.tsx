'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  nzNow,
  preferredTimeLabels,
  terminalAppointmentStatuses,
  type AppointmentStatus,
  type StaffAppointment,
  type StaffAppointmentDetail,
} from '@grace-abounds/validation';
import { SidePanel } from './editor-kit/side-panel';
import { KitConfirm } from './editor-kit/confirm';
import { useToast } from './toast';
import { careDate } from './prayer-ui';
import {
  AppointmentBadge,
  AppointmentHistory,
  slotText,
} from './appointment-ui';
import { hrefWithout, useUrlFilter } from '../lib/use-url-filter';
import { api, ApiError, errorMessage } from '../lib/api-client';

/*
 * Appointments for staff (Phase 4B), shared by the Pastor (in Pastoral
 * care) and Admin (scheduling). The server decides what each sees: Admin
 * receives who, contact, time, place and status only; the Pastor also gets
 * the topic, message and private notes. Times are suggested (no
 * reservation) or confirmed (reserved; the server refuses overlaps).
 *
 * Same safeguards as the prayer list: the open appointment follows the
 * address (?appointment=); only the newest answer for the open one is
 * shown and actions go to the one on screen; a time or note being typed is
 * kept if the save finishes after more typing or after another is opened.
 *
 * Everything on screen belongs to one signed-in staff identity and role.
 * A different person, a role change or signing out starts a fresh screen
 * (list, open appointment, drafts, confirmations, busy state all gone), and
 * answers to anything the previous identity asked for (lists, details,
 * saves) are ignored: no state, toasts, draft clears or reloads. Only active
 * Pastor or Admin sessions fetch anything. Private fields are also shown
 * only to the Pastor, as a second line of defence behind the server.
 */

type Filter = 'requested' | 'proposed' | 'upcoming' | 'closed' | 'all';
const filters: { id: Filter; label: string }[] = [
  { id: 'requested', label: 'Needs a time' },
  { id: 'proposed', label: 'Time suggested' },
  { id: 'upcoming', label: 'Confirmed' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
];
const isClosed = (status: AppointmentStatus) =>
  terminalAppointmentStatuses.includes(status);
const matches = (filter: Filter, item: StaffAppointment) =>
  filter === 'all' ||
  (filter === 'closed'
    ? isClosed(item.status)
    : filter === 'upcoming'
      ? item.status === 'confirmed'
      : item.status === filter);

type Slot = { date: string; time: string; minutes: number; location: string };
const blankSlot = (): Slot => ({
  date: '',
  time: '',
  minutes: 30,
  location: '',
});
const sameSlot = (a: Slot, b: Slot) =>
  a.date === b.date &&
  a.time === b.time &&
  a.minutes === b.minutes &&
  a.location === b.location;

export function StaffAppointments() {
  const { data: session } = useSession();
  const user = session?.user?.id ?? '';
  const role = session?.user?.role ?? '';
  if (!user || (role !== 'pastor' && role !== 'admin')) return null;
  // A new identity or role remounts the screen: nothing carries over.
  return <AppointmentsFor key={`${user}:${role}`} pastor={role === 'pastor'} />;
}

function AppointmentsFor({ pastor }: { pastor: boolean }) {
  const { push } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const linked = params?.get('appointment') ?? '';
  const [items, setItems] = useState<StaffAppointment[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useUrlFilter<Filter>(
    'appointments',
    filters.map((item) => item.id),
    'requested',
  );
  const [openId, setOpenId] = useState(linked);
  const [detail, setDetail] = useState<StaffAppointmentDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [slot, setSlot] = useState<Slot>(blankSlot);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<'cancel' | 'decline' | null>(
    null,
  );
  const openRef = useRef(openId);
  openRef.current = openId;
  const latestList = useRef(0);
  const latestDetail = useRef(0);
  /** False once this identity's screen is gone; late answers are dropped. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    // Every late answer (list, detail, save) checks this flag, so it alone
    // fences the old screen; the tickets only order answers within it.
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const ticket = ++latestList.current;
    try {
      const data = (await api<StaffAppointment[]>('/staff/appointments')).data;
      if (alive.current && ticket === latestList.current) {
        setItems(data);
        setLoadError('');
      }
    } catch (failure) {
      if (alive.current && ticket === latestList.current)
        setLoadError(errorMessage(failure));
    }
  }, []);
  const showDetail = useCallback(
    (ticket: number, id: string, data: StaffAppointmentDetail) => {
      if (
        !alive.current ||
        ticket !== latestDetail.current ||
        id !== openRef.current
      )
        return;
      setDetail(data);
      setDetailError('');
    },
    [],
  );
  const loadDetail = useCallback(
    async (id: string) => {
      const ticket = ++latestDetail.current;
      setDetailError('');
      try {
        showDetail(
          ticket,
          id,
          (await api<StaffAppointmentDetail>(`/staff/appointments/${id}`)).data,
        );
      } catch (failure) {
        if (
          !alive.current ||
          ticket !== latestDetail.current ||
          id !== openRef.current
        )
          return;
        setDetail(null);
        setDetailError(
          failure instanceof ApiError && failure.status === 404
            ? 'This appointment isn’t available any more.'
            : errorMessage(failure),
        );
      }
    },
    [showDetail],
  );

  useEffect(() => {
    if (linked) setOpenId(linked);
  }, [linked]);
  function close() {
    setOpenId('');
    if (linked)
      router.replace(
        hrefWithout(pathname ?? '/pastor/care', params, 'appointment'),
      );
  }
  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState !== 'hidden') void load();
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);
  useEffect(() => {
    setDetail(null);
    setNote('');
    setSlot(blankSlot());
    setConfirming(null);
    if (openId) void loadDetail(openId);
    else latestDetail.current++;
  }, [openId, loadDetail]);

  const current = detail && detail.id === openId ? detail : null;

  /** One action on the appointment on screen; true if it went through. */
  async function act(path: string, body: object, done: string) {
    if (!current || busy) return false;
    const { id, version } = current;
    setBusy(true);
    const ticket = ++latestDetail.current;
    try {
      const saved = (
        await api<StaffAppointmentDetail>(`/staff/appointments/${id}/${path}`, {
          method: 'POST',
          body: JSON.stringify(body),
          version,
        })
      ).data;
      if (!alive.current) return false;
      showDetail(ticket, id, saved);
      if (id === openRef.current) push(done, 'success');
      await load();
      return true;
    } catch (failure) {
      if (!alive.current) return false;
      if (failure instanceof ApiError && failure.code === 'VERSION_CONFLICT') {
        push(
          'This appointment changed since you opened it. It has been reloaded.',
          'error',
        );
        if (id === openRef.current) await loadDetail(id);
      } else push(errorMessage(failure), 'error');
      return false;
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  /** Saves a time; clears the form only if nothing changed meanwhile. */
  async function sendSlot(path: 'propose' | 'confirm', done: string) {
    if (!current) return;
    const id = current.id;
    const sent = { ...slot };
    const ok = await act(
      path,
      path === 'propose' ? sent : { slot: sent },
      done,
    );
    if (ok && alive.current && id === openRef.current)
      setSlot((draft) => (sameSlot(draft, sent) ? blankSlot() : draft));
  }

  const counts = (id: Filter) =>
    items?.filter((item) => matches(id, item)).length ?? 0;
  const shown = (items?.filter((item) => matches(filter, item)) ?? []).sort(
    (a, b) =>
      filter === 'upcoming'
        ? a.startsAt.localeCompare(b.startsAt)
        : b.createdAt.localeCompare(a.createdAt),
  );
  const slotReady = !!slot.date && !!slot.time;
  const open = current && !isClosed(current.status);
  return (
    <section className="panel care-pastor" aria-labelledby="care-appointments">
      <h2 id="care-appointments">Appointments</h2>
      {!pastor && (
        <p className="care-note">
          You can see who asked, their contact details and the time and status.
          Topics, messages and the pastor’s notes stay private to the pastor.
        </p>
      )}
      <div className="care-filters" role="group" aria-label="Show">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            className="cal-pill"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label} <span className="care-count">{counts(item.id)}</span>
          </button>
        ))}
      </div>
      {loadError && (
        <p className="kit-error" role="alert">
          {loadError}{' '}
          <button
            type="button"
            className="button button-outline"
            onClick={() => void load()}
          >
            Try again
          </button>
        </p>
      )}
      {!items && !loadError && <p className="care-note">Loading…</p>}
      {items && !shown.length && (
        <p className="care-note">Nothing here right now.</p>
      )}
      <ul className="care-tasks">
        {shown.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="care-task"
              onClick={() => setOpenId(item.id)}
              aria-label={`Open appointment with ${item.member.name}`}
            >
              <span className="care-task-head">
                <b>{item.member.name}</b>
                <AppointmentBadge status={item.status} />
              </span>
              {pastor && item.topic && (
                <span className="care-task-text">{item.topic}</span>
              )}
              <small>
                {item.startsAt
                  ? slotText(item.startsAt, item.endsAt)
                  : `Asked ${careDate(item.createdAt)}`}
              </small>
            </button>
          </li>
        ))}
      </ul>

      <SidePanel
        open={!!openId}
        title="Appointment"
        eyebrow={pastor ? 'Pastoral care' : 'Scheduling'}
        dirty={!!note.trim() || slotReady}
        busy={busy}
        onClose={close}
      >
        {detailError && (
          <p className="kit-error" role="alert">
            {detailError}
          </p>
        )}
        {!current && !detailError && <p className="care-note">Loading…</p>}
        {current && (
          <div className="care-detail">
            <header>
              <span>
                <b>{current.member.name}</b>
                <small>
                  {current.member.email}
                  {current.member.phone && ` · ${current.member.phone}`}
                </small>
              </span>
              <AppointmentBadge status={current.status} />
            </header>
            {pastor && current.topic !== undefined && (
              <div>
                <h3 className="care-topic">{current.topic}</h3>
                {current.reason ? (
                  <p className="care-text">{current.reason}</p>
                ) : (
                  <p className="care-note">No message.</p>
                )}
              </div>
            )}
            <p className="care-note">
              Asked for{' '}
              {current.preferredDate
                ? careDate(`${current.preferredDate}T00:00:00Z`, false)
                : 'any day'}
              , {preferredTimeLabels[current.preferredTime].toLowerCase()}.
            </p>
            {current.startsAt && (
              <p className="care-slot">
                <b>
                  {current.status === 'proposed' ? 'Suggested: ' : 'Time: '}
                </b>
                {slotText(current.startsAt, current.endsAt)}
                {current.location && ` · ${current.location}`}
              </p>
            )}
            <AppointmentHistory history={current.history} />
            {current.deleteAfter && (
              <small className="care-note">
                Normally due for deletion with its notes from{' '}
                {careDate(current.deleteAfter, false)}. A records hold keeps
                what it covers until reviewed and released. .
              </small>
            )}

            {open && (
              <fieldset className="care-slot-form" disabled={busy}>
                <legend>
                  {current.status === 'confirmed'
                    ? 'Move to another time'
                    : 'Suggest or confirm a time'}
                </legend>
                <div className="care-pair">
                  <label className="care-field">
                    <span>Date</span>
                    <input
                      type="date"
                      min={nzNow().date}
                      value={slot.date}
                      onChange={(event) =>
                        setSlot({ ...slot, date: event.target.value })
                      }
                    />
                  </label>
                  <label className="care-field">
                    <span>Start</span>
                    <input
                      type="time"
                      step={300}
                      value={slot.time}
                      onChange={(event) =>
                        setSlot({ ...slot, time: event.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="care-pair">
                  <label className="care-field">
                    <span>Length</span>
                    <select
                      value={slot.minutes}
                      onChange={(event) =>
                        setSlot({
                          ...slot,
                          minutes: Number(event.target.value),
                        })
                      }
                    >
                      {[15, 30, 45, 60, 90, 120].map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutes < 60
                            ? `${minutes} minutes`
                            : `${minutes / 60} hour${minutes > 60 ? 's' : ''}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="care-field">
                    <span>Place</span>
                    <input
                      type="text"
                      maxLength={160}
                      placeholder="Church office, phone call…"
                      value={slot.location}
                      onChange={(event) =>
                        setSlot({ ...slot, location: event.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="care-actions">
                  <button
                    type="button"
                    className="button button-outline"
                    disabled={!slotReady}
                    onClick={() =>
                      void sendSlot(
                        'propose',
                        'Time suggested. The member has been told.',
                      )
                    }
                  >
                    Suggest this time
                  </button>
                  {current.status !== 'confirmed' && (
                    <button
                      type="button"
                      className="button"
                      disabled={!slotReady}
                      onClick={() =>
                        void sendSlot(
                          'confirm',
                          'Appointment confirmed. The member has been told.',
                        )
                      }
                    >
                      Confirm this time
                    </button>
                  )}
                </div>
              </fieldset>
            )}

            {open && (
              <div className="care-actions">
                {current.status === 'proposed' && (
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        'confirm',
                        {},
                        'Appointment confirmed. The member has been told.',
                      )
                    }
                  >
                    Confirm the suggested time
                  </button>
                )}
                {current.status === 'confirmed' && (
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void act('complete', {}, 'Marked as completed.')
                    }
                  >
                    Mark as completed
                  </button>
                )}
                {pastor && current.status !== 'confirmed' && (
                  <button
                    type="button"
                    className="button button-outline"
                    disabled={busy}
                    onClick={() => setConfirming('decline')}
                  >
                    Decline request
                  </button>
                )}
                <button
                  type="button"
                  className="button button-outline"
                  disabled={busy}
                  onClick={() => setConfirming('cancel')}
                >
                  Cancel appointment
                </button>
              </div>
            )}

            {pastor && current.notes && (
              <section
                className="care-notes"
                aria-labelledby="appt-notes-title"
              >
                <h3 id="appt-notes-title">Private notes</h3>
                <p className="care-note">
                  Only you can see these. The member and the admin team can’t.
                </p>
                {current.notes.length > 0 && (
                  <ul>
                    {current.notes.map((item) => (
                      <li key={item.id}>
                        <p>{item.text}</p>
                        <small>
                          {item.author} · {careDate(item.createdAt)}
                        </small>
                      </li>
                    ))}
                  </ul>
                )}
                <label className="care-field">
                  <span>Add a note</span>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="button button-outline"
                  disabled={busy || !note.trim()}
                  onClick={async () => {
                    const id = current.id;
                    const sent = note;
                    if (
                      (await act('notes', { text: sent }, 'Note added.')) &&
                      alive.current &&
                      id === openRef.current
                    )
                      setNote((draft) => (draft === sent ? '' : draft));
                  }}
                >
                  Add note
                </button>
              </section>
            )}
          </div>
        )}
      </SidePanel>
      <KitConfirm
        open={!!confirming && !!current}
        title={
          confirming === 'decline'
            ? 'Decline this request?'
            : 'Cancel this appointment?'
        }
        confirmLabel={
          confirming === 'decline' ? 'Decline' : 'Cancel appointment'
        }
        cancelLabel="Keep it"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const action = confirming;
          setConfirming(null);
          if (action)
            void act(
              action,
              {},
              action === 'decline'
                ? 'Request declined. The member has been told.'
                : 'Appointment cancelled. The member has been told.',
            );
        }}
      >
        <p>The member is told. This can’t be undone.</p>
      </KitConfirm>
    </section>
  );
}
