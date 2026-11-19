'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  APPOINTMENT_PRIVACY_NOTE,
  appointmentTopics,
  nzNow,
  preferredTimeLabels,
  preferredTimes,
  type MemberAppointment,
  type PreferredTime,
} from '@grace-abounds/validation';
import { MemberShell } from '../../components/member-shell';
import { KitConfirm } from '../../components/editor-kit/confirm';
import { useToast } from '../../components/toast';
import { careDate } from '../../components/prayer-ui';
import {
  AppointmentBadge,
  AppointmentHistory,
  slotText,
} from '../../components/appointment-ui';
import { api, ApiError, errorMessage } from '../../lib/api-client';

/*
 * A member's private appointments (Phase 4B): ask for one, then accept a
 * suggested time, ask for another, or cancel. Only the member's own are
 * listed (the server decides). The privacy and retention wording is shown
 * before asking.
 *
 * Same confidential-screen rules as Prayer: a different sign-in clears
 * everything and late answers for anyone else are ignored; only the newest
 * list answer is used; each request's key is tied to its exact details; the
 * appointment to show (?appointment=) follows the address.
 */

type Draft = {
  topic: string;
  reason: string;
  preferredDate: string;
  preferredTime: PreferredTime;
};
const blank: Draft = {
  topic: '',
  reason: '',
  preferredDate: '',
  preferredTime: 'any',
};
const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const sameDraft = (a: Draft, b: Draft) =>
  a.topic === b.topic &&
  a.reason.trim() === b.reason.trim() &&
  a.preferredDate === b.preferredDate &&
  a.preferredTime === b.preferredTime;

export default function AppointmentsPage() {
  const { push } = useToast();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? '';
  const focus = useSearchParams()?.get('appointment') ?? '';
  const [items, setItems] = useState<MemberAppointment[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState<Draft>(blank);
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState('');
  const [cancelling, setCancelling] = useState<MemberAppointment | null>(null);
  const owner = useRef(userId);
  owner.current = userId;
  const latestLoad = useRef(0);
  const attempt = useRef<{ key: string; draft: Draft } | null>(null);

  const load = useCallback(async () => {
    const forUser = owner.current;
    if (!forUser) return;
    const ticket = ++latestLoad.current;
    try {
      const data = (await api<MemberAppointment[]>('/member/appointments'))
        .data;
      if (ticket === latestLoad.current && forUser === owner.current) {
        setItems(data);
        setLoadError('');
      }
    } catch (failure) {
      if (ticket === latestLoad.current && forUser === owner.current)
        setLoadError(errorMessage(failure));
    }
  }, []);

  useEffect(() => {
    latestLoad.current++;
    attempt.current = null;
    setItems(null);
    setDraft(blank);
    setLoadError('');
    setSending(false);
    setActing('');
    setCancelling(null);
    if (!userId) return;
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
  }, [userId, load]);

  useEffect(() => {
    if (focus && items?.some((item) => item.id === focus))
      document
        .getElementById(`appointment-${focus}`)
        ?.scrollIntoView?.({ block: 'center' });
  }, [focus, items]);

  async function ask() {
    if (sending || !draft.topic || !userId) return;
    const forUser = userId;
    const sent = { ...draft, reason: draft.reason.trim() };
    if (!attempt.current || !sameDraft(attempt.current.draft, sent))
      attempt.current = { key: newKey(), draft: sent };
    const { key } = attempt.current;
    setSending(true);
    try {
      await api<MemberAppointment>('/member/appointments', {
        method: 'POST',
        body: JSON.stringify({ ...sent, clientKey: key }),
      });
      if (forUser !== owner.current) return;
      if (attempt.current?.key === key) attempt.current = null;
      setDraft((current) => (sameDraft(current, sent) ? blank : current));
      push('Your appointment request was sent.', 'success');
      await load();
    } catch (failure) {
      if (forUser !== owner.current) return;
      if (
        failure instanceof ApiError &&
        failure.code === 'IDEMPOTENCY_CONFLICT'
      )
        attempt.current = null;
      push(errorMessage(failure), 'error');
    } finally {
      if (forUser === owner.current) setSending(false);
    }
  }

  async function act(
    item: MemberAppointment,
    action: 'accept' | 'another-time' | 'cancel',
    done: string,
  ) {
    if (acting) return;
    const forUser = userId;
    setActing(item.id);
    try {
      await api(`/member/appointments/${item.id}/${action}`, {
        method: 'POST',
        body: '{}',
        version: item.version,
      });
      if (forUser !== owner.current) return;
      push(done, 'success');
    } catch (failure) {
      if (forUser !== owner.current) return;
      push(
        failure instanceof ApiError && failure.code === 'VERSION_CONFLICT'
          ? 'This appointment changed since you opened the page. It has been refreshed.'
          : errorMessage(failure),
        'error',
      );
    } finally {
      if (forUser === owner.current) {
        setActing('');
        await load();
      }
    }
  }

  const today = nzNow().date;
  const missing = focus && items && !items.some((item) => item.id === focus);
  return (
    <MemberShell>
      <header className="workspace-header">
        <p className="eyebrow">Pastoral care</p>
        <h1>Appointments</h1>
        <p>Ask to meet with the pastor and keep track of your appointments.</p>
      </header>
      <div className="care-layout">
        <section className="care-card care-compose" aria-labelledby="appt-new">
          <h2 id="appt-new">Ask for an appointment</h2>
          <p className="care-privacy" id="appt-privacy">
            {APPOINTMENT_PRIVACY_NOTE}
          </p>
          <label className="care-field">
            <span>Topic</span>
            <select
              value={draft.topic}
              aria-describedby="appt-privacy"
              onChange={(event) =>
                setDraft({ ...draft, topic: event.target.value })
              }
            >
              <option value="" disabled>
                Choose a topic
              </option>
              {appointmentTopics.map((topic) => (
                <option key={topic}>{topic}</option>
              ))}
            </select>
          </label>
          <label className="care-field">
            <span>Message (optional)</span>
            <textarea
              rows={4}
              maxLength={2000}
              value={draft.reason}
              placeholder="Anything you’d like the pastor to know?"
              onChange={(event) =>
                setDraft({ ...draft, reason: event.target.value })
              }
            />
          </label>
          <div className="care-pair">
            <label className="care-field">
              <span>Preferred date (optional)</span>
              <input
                type="date"
                min={today}
                value={draft.preferredDate}
                onChange={(event) =>
                  setDraft({ ...draft, preferredDate: event.target.value })
                }
              />
            </label>
            <label className="care-field">
              <span>Best time</span>
              <select
                value={draft.preferredTime}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    preferredTime: event.target.value as PreferredTime,
                  })
                }
              >
                {preferredTimes.map((time) => (
                  <option key={time} value={time}>
                    {preferredTimeLabels[time]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="care-compose-actions">
            <span />
            <button
              type="button"
              className="button"
              disabled={sending || !draft.topic || !userId}
              onClick={() => void ask()}
            >
              {sending ? 'Sending…' : 'Ask for an appointment'}
            </button>
          </div>
        </section>

        <section className="care-list" aria-labelledby="appt-mine">
          <h2 id="appt-mine">My appointments</h2>
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
          {missing && (
            <p className="care-note" role="status">
              That appointment isn’t available any more.
            </p>
          )}
          {!items && !loadError && <p className="care-note">Loading…</p>}
          {items?.length === 0 && (
            <p className="care-note">
              You haven’t asked for an appointment yet.
            </p>
          )}
          <ul>
            {items?.map((item) => (
              <li key={item.id}>
                <article
                  id={`appointment-${item.id}`}
                  className={`care-item${item.id === focus ? ' is-focus' : ''}`}
                  aria-current={item.id === focus ? 'true' : undefined}
                >
                  <header>
                    <AppointmentBadge status={item.status} />
                    <small>Asked {careDate(item.createdAt, false)}</small>
                  </header>
                  <h3 className="care-topic">{item.topic}</h3>
                  {item.reason && <p className="care-text">{item.reason}</p>}
                  {item.startsAt ? (
                    <p className="care-slot">
                      <b>
                        {item.status === 'proposed'
                          ? 'Suggested time: '
                          : 'Time: '}
                      </b>
                      {slotText(item.startsAt, item.endsAt)}
                      {item.location && ` · ${item.location}`}
                    </p>
                  ) : (
                    item.status === 'requested' && (
                      <p className="care-note">
                        You asked for{' '}
                        {item.preferredDate
                          ? careDate(`${item.preferredDate}T00:00:00Z`, false)
                          : 'any day'}
                        ,{' '}
                        {preferredTimeLabels[item.preferredTime].toLowerCase()}.
                        The church will suggest a time.
                      </p>
                    )
                  )}
                  {['requested', 'proposed', 'confirmed'].includes(
                    item.status,
                  ) && (
                    <div className="care-actions">
                      {item.status === 'proposed' && (
                        <>
                          <button
                            type="button"
                            className="button"
                            disabled={!!acting}
                            onClick={() =>
                              void act(
                                item,
                                'accept',
                                'Your appointment is confirmed.',
                              )
                            }
                          >
                            Accept this time
                          </button>
                          <button
                            type="button"
                            className="button button-outline"
                            disabled={!!acting}
                            onClick={() =>
                              void act(
                                item,
                                'another-time',
                                'We’ll suggest another time.',
                              )
                            }
                          >
                            Ask for another time
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="button button-outline"
                        disabled={!!acting}
                        onClick={() => setCancelling(item)}
                      >
                        Cancel appointment
                      </button>
                    </div>
                  )}
                  <AppointmentHistory history={item.history} />
                  {item.deleteAfter && (
                    <small className="care-note">
                      Kept until {careDate(item.deleteAfter, false)}, then
                      deleted.
                    </small>
                  )}
                </article>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <KitConfirm
        open={!!cancelling}
        title="Cancel this appointment?"
        confirmLabel="Cancel appointment"
        cancelLabel="Keep it"
        onCancel={() => setCancelling(null)}
        onConfirm={() => {
          const item = cancelling;
          setCancelling(null);
          if (item) void act(item, 'cancel', 'Your appointment was cancelled.');
        }}
      >
        <p>The church is told. You can ask for a new appointment any time.</p>
      </KitConfirm>
    </MemberShell>
  );
}
