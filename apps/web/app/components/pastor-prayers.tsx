'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  nextPrayerStatuses,
  prayerStatusLabels,
  type PastorPrayer,
  type PastorPrayerDetail,
  type PrayerStatus,
} from '@grace-abounds/validation';
import { SidePanel } from './editor-kit/side-panel';
import { useToast } from './toast';
import { careDate, PrayerBadge, PrayerHistory } from './prayer-ui';
import { api, ApiError, errorMessage } from '../lib/api-client';

/*
 * The Pastor's prayer requests (Phase 4A): a task list with filters, and a
 * detail panel with explicit actions (Praying, Prayed for) and private
 * notes. Every action is a confirmed server write with the version the
 * panel loaded; no autosaving dropdowns.
 *
 * - The open request follows the address (?prayer=), including when a
 *   notification for another request is opened on this same page.
 * - Only the newest answer for the request open now is shown: a slow
 *   answer for one opened earlier can't replace it, and actions always go
 *   to the request on screen.
 * - Only the newest list answer is used; one sent before a change can't
 *   bring back an older state.
 */

type Filter = 'open' | PrayerStatus | 'all';
const filters: { id: Filter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'praying', label: 'Praying' },
  { id: 'prayed_for', label: 'Prayed for' },
  { id: 'all', label: 'All' },
];
const matches = (filter: Filter, item: PastorPrayer) =>
  filter === 'all' ||
  (filter === 'open' ? item.status !== 'prayed_for' : item.status === filter);
const actionLabels: Record<PrayerStatus, string> = {
  submitted: '',
  praying: 'Mark as praying',
  prayed_for: 'Mark as prayed for',
};

export function PastorPrayers() {
  const { push } = useToast();
  const [prayers, setPrayers] = useState<PastorPrayer[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const router = useRouter();
  const pathname = usePathname();
  const linked = useSearchParams()?.get('prayer') ?? '';
  const [openId, setOpenId] = useState(linked);
  const openRef = useRef(openId);
  openRef.current = openId;
  const latestList = useRef(0);
  const latestDetail = useRef(0);
  const [detail, setDetail] = useState<PastorPrayerDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const ticket = ++latestList.current;
    try {
      const data = (await api<PastorPrayer[]>('/pastor/prayers')).data;
      if (ticket === latestList.current) {
        setPrayers(data);
        setLoadError('');
      }
    } catch (failure) {
      if (ticket === latestList.current) setLoadError(errorMessage(failure));
    }
  }, []);
  /** Shows a detail only if it is the newest answer for the open request. */
  const showDetail = useCallback(
    (ticket: number, id: string, data: PastorPrayerDetail) => {
      if (ticket !== latestDetail.current || id !== openRef.current) return;
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
          (await api<PastorPrayerDetail>(`/pastor/prayers/${id}`)).data,
        );
      } catch (failure) {
        if (ticket !== latestDetail.current || id !== openRef.current) return;
        setDetail(null);
        setDetailError(
          failure instanceof ApiError && failure.status === 404
            ? 'This prayer request isn’t available any more.'
            : errorMessage(failure),
        );
      }
    },
    [showDetail],
  );

  // A notification link opened on this page retargets the panel.
  useEffect(() => {
    if (linked) setOpenId(linked);
  }, [linked]);
  function close() {
    setOpenId('');
    // Forget the link, so the same notification can open it again.
    if (linked) router.replace(pathname ?? '/pastor/care');
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
    openRef.current = openId;
    setDetail(null);
    setNote('');
    if (openId) void loadDetail(openId);
    else latestDetail.current++;
  }, [openId, loadDetail]);

  // The detail on screen, only if it is the request that is open.
  const current = detail && detail.id === openId ? detail : null;

  async function write(path: string, body: object, done: string) {
    if (!current || busy) return false;
    const { id, version } = current;
    setBusy(true);
    // Any answer already on its way is older than this change.
    const ticket = ++latestDetail.current;
    try {
      const saved = (
        await api<PastorPrayerDetail>(`/pastor/prayers/${id}${path}`, {
          method: 'POST',
          body: JSON.stringify(body),
          version,
        })
      ).data;
      showDetail(ticket, id, saved);
      // Said only while that request is still the one on screen.
      if (id === openRef.current) push(done, 'success');
      await load();
      return true;
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'VERSION_CONFLICT') {
        push(
          'This request changed since you opened it. It has been reloaded.',
          'error',
        );
        if (id === openRef.current) await loadDetail(id);
      } else push(errorMessage(failure), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const counts = (id: Filter) =>
    prayers?.filter((item) => matches(id, item)).length ?? 0;
  const shown = prayers?.filter((item) => matches(filter, item)) ?? [];
  return (
    <section className="panel care-pastor" aria-labelledby="care-prayers">
      <h2 id="care-prayers">Prayer requests</h2>
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
      {!prayers && !loadError && <p className="care-note">Loading…</p>}
      {prayers && !shown.length && (
        <p className="care-note">Nothing here right now.</p>
      )}
      <ul className="care-tasks">
        {shown.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="care-task"
              onClick={() => setOpenId(item.id)}
              aria-label={`Open prayer request from ${item.member.name}`}
            >
              <span className="care-task-head">
                <b>{item.member.name}</b>
                <PrayerBadge status={item.status} />
              </span>
              <span className="care-task-text">{item.text}</span>
              <small>
                Received {careDate(item.createdAt)}
                {item.noteCount > 0 &&
                  ` · ${item.noteCount} ${item.noteCount === 1 ? 'note' : 'notes'}`}
              </small>
            </button>
          </li>
        ))}
      </ul>

      <SidePanel
        open={!!openId}
        title="Prayer request"
        eyebrow="Pastoral care"
        dirty={!!note.trim()}
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
                <small>{current.member.email}</small>
              </span>
              <PrayerBadge status={current.status} />
            </header>
            <p className="care-text">{current.text}</p>
            <PrayerHistory history={current.history} />
            {current.deleteAfter && (
              <small className="care-note">
                Deleted with its notes on {careDate(current.deleteAfter, false)}
                .
              </small>
            )}
            {nextPrayerStatuses[current.status].length > 0 && (
              <div className="care-actions">
                {nextPrayerStatuses[current.status].map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={
                      status === 'prayed_for'
                        ? 'button'
                        : 'button button-outline'
                    }
                    disabled={busy}
                    onClick={() =>
                      void write(
                        '/status',
                        { status },
                        `Marked as ${prayerStatusLabels[status].toLowerCase()}. The member has been told.`,
                      )
                    }
                  >
                    {actionLabels[status]}
                  </button>
                ))}
              </div>
            )}
            <section className="care-notes" aria-labelledby="care-notes-title">
              <h3 id="care-notes-title">Private notes</h3>
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
                  // Clear only the words that were saved, and only if that
                  // request is still open: anything typed meanwhile, or a
                  // draft for a request opened since, is kept.
                  const id = current.id;
                  const sent = note;
                  if (
                    (await write('/notes', { text: sent }, 'Note added.')) &&
                    id === openRef.current
                  )
                    setNote((draft) => (draft === sent ? '' : draft));
                }}
              >
                Add note
              </button>
            </section>
          </div>
        )}
      </SidePanel>
    </section>
  );
}
