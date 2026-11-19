'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  PRAYER_PRIVACY_NOTE,
  type MemberPrayer,
} from '@grace-abounds/validation';
import { MemberShell } from '../../components/member-shell';
import { useToast } from '../../components/toast';
import {
  careDate,
  PrayerBadge,
  PrayerHistory,
} from '../../components/prayer-ui';
import { api, ApiError, errorMessage } from '../../lib/api-client';

/*
 * A member's prayer requests (Phase 4A): send one to the pastor and follow
 * it. Only the member's own requests are listed (the server decides). The
 * privacy and retention wording is shown before sending.
 *
 * Confidential screen rules:
 * - Everything shown belongs to the signed-in person: a different sign-in
 *   (or signing out) clears the list, the draft and any errors, and answers
 *   that arrive for the previous person are ignored.
 * - Only the newest list answer is used; an older one arriving late can't
 *   replace it.
 * - Each send has a key tied to its exact words. Retrying the same words
 *   reuses the key (the server makes one request); changing the words after
 *   a failure makes a new key, so nothing is lost or passed off as sent.
 * - The request to show (?request=) follows the address, including when a
 *   notification for another request is opened on this same page.
 */

const MAX = 2000;
const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export default function PrayerPage() {
  const { push } = useToast();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? '';
  const focus = useSearchParams()?.get('request') ?? '';
  const [prayers, setPrayers] = useState<MemberPrayer[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const owner = useRef(userId);
  owner.current = userId;
  const latestLoad = useRef(0);
  // The words last sent and their key, until they go through.
  const attempt = useRef<{ key: string; text: string } | null>(null);

  const load = useCallback(async () => {
    const forUser = owner.current;
    if (!forUser) return;
    const ticket = ++latestLoad.current;
    try {
      const data = (await api<MemberPrayer[]>('/member/prayers')).data;
      if (ticket === latestLoad.current && forUser === owner.current) {
        setPrayers(data);
        setLoadError('');
      }
    } catch (failure) {
      if (ticket === latestLoad.current && forUser === owner.current)
        setLoadError(errorMessage(failure));
    }
  }, []);

  // A new person (or none): start clean, then load theirs.
  useEffect(() => {
    latestLoad.current++;
    attempt.current = null;
    setPrayers(null);
    setText('');
    setFieldError('');
    setLoadError('');
    setBusy(false);
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
    if (focus && prayers?.some((item) => item.id === focus))
      document
        .getElementById(`prayer-${focus}`)
        ?.scrollIntoView?.({ block: 'center' });
  }, [focus, prayers]);

  async function send() {
    const words = text.trim();
    if (busy || !words || !userId) return;
    const forUser = userId;
    if (attempt.current?.text !== words)
      attempt.current = { key: newKey(), text: words };
    const { key } = attempt.current;
    setBusy(true);
    setFieldError('');
    try {
      await api<MemberPrayer>('/member/prayers', {
        method: 'POST',
        body: JSON.stringify({ text: words, clientKey: key }),
      });
      // Signed out or switched meanwhile: nothing here is theirs.
      if (forUser !== owner.current) return;
      if (attempt.current?.key === key) attempt.current = null;
      // Clear only if the box still holds what was sent.
      setText((current) => (current.trim() === words ? '' : current));
      push('Your prayer request was sent to the pastor.', 'success');
      await load();
    } catch (failure) {
      if (forUser !== owner.current) return;
      if (
        failure instanceof ApiError &&
        failure.code === 'IDEMPOTENCY_CONFLICT'
      )
        attempt.current = null; // the next send is a new request
      if (failure instanceof ApiError && failure.fieldErrors?.text)
        setFieldError(failure.fieldErrors.text);
      // The words stay so the member can try again.
      push(errorMessage(failure), 'error');
    } finally {
      if (forUser === owner.current) setBusy(false);
    }
  }

  const missing =
    focus && prayers && !prayers.some((item) => item.id === focus);
  return (
    <MemberShell>
      <header className="workspace-header">
        <p className="eyebrow">Pastoral care</p>
        <h1>Prayer</h1>
        <p>Share a prayer request with the pastor and see how it’s going.</p>
      </header>
      <div className="care-layout">
        <section className="care-card care-compose" aria-labelledby="care-new">
          <h2 id="care-new">New prayer request</h2>
          <p className="care-privacy" id="care-privacy">
            {PRAYER_PRIVACY_NOTE}
          </p>
          <label className="care-field">
            <span>Your prayer request</span>
            <textarea
              rows={6}
              maxLength={MAX}
              value={text}
              aria-describedby="care-privacy"
              aria-invalid={fieldError ? true : undefined}
              placeholder="How can the pastor pray with you?"
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          {fieldError && <small className="kit-error">{fieldError}</small>}
          <div className="care-compose-actions">
            <small>
              {text.length.toLocaleString('en-NZ')}/
              {MAX.toLocaleString('en-NZ')}
            </small>
            <button
              type="button"
              className="button"
              disabled={busy || !text.trim() || !userId}
              onClick={() => void send()}
            >
              {busy ? 'Sending…' : 'Send to the pastor'}
            </button>
          </div>
        </section>

        <section className="care-list" aria-labelledby="care-mine">
          <h2 id="care-mine">My prayer requests</h2>
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
              That request isn’t available any more.
            </p>
          )}
          {!prayers && !loadError && <p className="care-note">Loading…</p>}
          {prayers?.length === 0 && (
            <p className="care-note">You haven’t sent a prayer request yet.</p>
          )}
          <ul>
            {prayers?.map((item) => (
              <li key={item.id}>
                <article
                  id={`prayer-${item.id}`}
                  className={`care-item${item.id === focus ? ' is-focus' : ''}`}
                  aria-current={item.id === focus ? 'true' : undefined}
                >
                  <header>
                    <PrayerBadge status={item.status} />
                    <small>Sent {careDate(item.createdAt, false)}</small>
                  </header>
                  <p className="care-text">{item.text}</p>
                  <PrayerHistory history={item.history} />
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
    </MemberShell>
  );
}
