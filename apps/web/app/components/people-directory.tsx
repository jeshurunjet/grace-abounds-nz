'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  accountRoleLabels,
  accountStatusLabels,
  type PeoplePage,
  type PersonDetail,
  type PersonSummary,
} from '@grace-abounds/validation';
import { SidePanel } from './editor-kit/side-panel';
import { KitConfirm } from './editor-kit/confirm';
import { useToast } from './toast';
import { careDate } from './prayer-ui';
import { ReauthDialog } from './reauth-dialog';
import { hrefWithout, useUrlFilter } from '../lib/use-url-filter';
import { api, ApiError, errorMessage } from '../lib/api-client';

/*
 * People (Phase 4C): the staff directory of real accounts. Search and
 * filters run on the server (bounded pages with "Show more"); one person
 * opens in a side panel. Both staff roles may suspend or reactivate an
 * ordinary member with an explicit, confirmed action that sends the version
 * shown; a stale version reloads instead of overwriting, and the screen
 * changes only after the server confirms. Staff accounts are never changed
 * here. The Pastor also sees a member's prayer counts; Admin sees
 * appointment counts only (the server decides what each receives).
 *
 * Everything on screen belongs to one signed-in staff identity and role: a
 * different person, role change or sign-out starts a fresh screen, and
 * answers to anything asked before are ignored. Only the newest search
 * answer and the newest answer for the open person are shown.
 */

type StatusFilter = 'all' | 'active' | 'suspended';
type RoleFilter = 'all' | 'member' | 'staff';
const statusFilters: StatusFilter[] = ['all', 'active', 'suspended'];
const roleFilters: RoleFilter[] = ['all', 'member', 'staff'];
const displayName = (person: PersonSummary) => person.name || person.email;
const STAFF_NOTE =
  'Staff accounts are set up by the church’s operator and can’t be suspended or changed here.';

export function PeopleDirectory() {
  const { data: session } = useSession();
  const user = session?.user?.id ?? '';
  const role = session?.user?.role ?? '';
  if (!user || (role !== 'pastor' && role !== 'admin')) return null;
  return <PeopleFor key={`${user}:${role}`} pastor={role === 'pastor'} />;
}

function PeopleFor({ pastor }: { pastor: boolean }) {
  const { push } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const linked = params?.get('person') ?? '';
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  // Filters live in the address (?status=&role=), so a Home count opens
  // exactly the list it counted, also when already on this page.
  const [status, setStatus] = useUrlFilter('status', statusFilters, 'all');
  const [roleFilter, setRoleFilter] = useUrlFilter('role', roleFilters, 'all');
  const [items, setItems] = useState<PersonSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [openId, setOpenId] = useState(linked);
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [confirming, setConfirming] = useState<'suspended' | 'active' | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  /** A change waiting for "Confirm it's you" (recent sign-in required). */
  const [reauth, setReauth] = useState<'suspended' | 'active' | null>(null);
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

  const search = useCallback(
    async (cursor = '') => {
      const ticket = ++latestList.current;
      const qs = new URLSearchParams({ q, status, role: roleFilter });
      if (cursor) qs.set('cursor', cursor);
      if (cursor) setLoadingMore(true);
      try {
        const page = (await api<PeoplePage>(`/staff/members?${qs}`)).data;
        if (!alive.current || ticket !== latestList.current) return;
        setItems((current) =>
          cursor ? [...(current ?? []), ...page.items] : page.items,
        );
        setNextCursor(page.nextCursor);
        setLoadError('');
      } catch (failure) {
        if (!alive.current || ticket !== latestList.current) return;
        setLoadError(errorMessage(failure));
      } finally {
        if (alive.current && ticket === latestList.current)
          setLoadingMore(false);
      }
    },
    [q, status, roleFilter],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    setItems(null);
    setNextCursor('');
    void search();
  }, [search]);

  const showDetail = useCallback(
    (ticket: number, id: string, data: PersonDetail) => {
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
          (await api<PersonDetail>(`/staff/members/${id}`)).data,
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
            ? 'This account isn’t available any more.'
            : errorMessage(failure),
        );
      }
    },
    [showDetail],
  );
  useEffect(() => {
    if (linked) setOpenId(linked);
  }, [linked]);
  useEffect(() => {
    setDetail(null);
    setConfirming(null);
    setReauth(null);
    if (openId) void loadDetail(openId);
    else latestDetail.current++;
  }, [openId, loadDetail]);
  function close() {
    setOpenId('');
    if (linked)
      router.replace(hrefWithout(pathname ?? '/admin/users', params, 'person'));
  }

  const current = detail && detail.id === openId ? detail : null;

  /** Suspend or reactivate the person on screen, with the version shown. */
  async function changeStatus(next: 'suspended' | 'active') {
    if (!current || busy) return;
    const { id, version } = current;
    setBusy(true);
    const ticket = ++latestDetail.current;
    try {
      const saved = (
        await api<PersonDetail>(`/staff/members/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: next }),
          version,
        })
      ).data;
      if (!alive.current) return;
      showDetail(ticket, id, saved);
      setItems(
        (list) =>
          list?.map((item) =>
            item.id === id
              ? { ...item, status: saved.status, version: saved.version }
              : item,
          ) ?? list,
      );
      push(
        next === 'suspended'
          ? `${displayName(saved)} is suspended and signed out everywhere.`
          : `${displayName(saved)} can sign in again.`,
        'success',
      );
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ApiError && failure.code === 'REAUTH_REQUIRED') {
        // Nothing changed; ask the person to confirm it's them, then retry.
        if (id === openRef.current) setReauth(next);
        return;
      }
      const stale =
        failure instanceof ApiError &&
        (failure.code === 'VERSION_CONFLICT' || failure.code === 'NO_CHANGE');
      push(
        stale
          ? 'This account changed since you opened it. It has been reloaded.'
          : errorMessage(failure),
        'error',
      );
      if (stale) {
        if (id === openRef.current) await loadDetail(id);
        void search();
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const care = pastor ? '/pastor/care' : '/admin/appointments';
  return (
    <section className="people" aria-labelledby="people-title">
      <h2 id="people-title" className="sr-only">
        People
      </h2>
      <div className="people-filters panel">
        <label className="care-field">
          <span>Search people</span>
          <input
            type="search"
            placeholder="Name or email"
            value={query}
            maxLength={120}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="care-field">
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <label className="care-field">
          <span>Account type</span>
          <select
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(event.target.value as RoleFilter)
            }
          >
            <option value="all">Everyone</option>
            <option value="member">Members</option>
            <option value="staff">Staff</option>
          </select>
        </label>
      </div>
      {loadError && (
        <p className="kit-error" role="alert">
          {loadError}{' '}
          <button
            type="button"
            className="button button-outline"
            onClick={() => void search()}
          >
            Try again
          </button>
        </p>
      )}
      {!items && !loadError && <p className="care-note">Loading…</p>}
      {items && !items.length && (
        <p className="care-note">
          No accounts match. Try another name or clear the filters.
        </p>
      )}
      <ul className="care-tasks people-list">
        {items?.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              className="care-task"
              aria-label={`Open ${displayName(person)}`}
              onClick={() => setOpenId(person.id)}
            >
              <span className="care-task-head">
                <b>{displayName(person)}</b>
                <span className={`care-badge is-${person.status}`}>
                  {accountStatusLabels[person.status]}
                </span>
              </span>
              <small>
                {person.name && `${person.email} · `}
                {accountRoleLabels[person.role]}
              </small>
            </button>
          </li>
        ))}
      </ul>
      {nextCursor && (
        <button
          type="button"
          className="button button-outline"
          disabled={loadingMore}
          onClick={() => void search(nextCursor)}
        >
          {loadingMore ? 'Loading…' : 'Show more'}
        </button>
      )}

      <SidePanel
        open={!!openId}
        title="Account"
        eyebrow="People"
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
                <b>{displayName(current)}</b>
                <small>{current.email}</small>
              </span>
              <span className={`care-badge is-${current.status}`}>
                {accountStatusLabels[current.status]}
              </span>
            </header>
            <dl className="people-facts">
              <dt>Account type</dt>
              <dd>{accountRoleLabels[current.role]}</dd>
              <dt>Phone</dt>
              <dd>{current.phone || 'Not given'}</dd>
              <dt>Email</dt>
              <dd>{current.emailVerified ? 'Verified' : 'Not verified yet'}</dd>
              <dt>Joined</dt>
              <dd>{careDate(current.createdAt, false)}</dd>
            </dl>

            <section className="people-counts" aria-label="Activity">
              <p>
                <b>Appointments:</b> {current.appointments.requested} needing a
                time, {current.appointments.proposed} time suggested,{' '}
                {current.appointments.confirmed} confirmed.{' '}
                <Link href={care}>Open appointments</Link>
              </p>
              {pastor && current.prayers && (
                <p>
                  <b>Prayer requests:</b> {current.prayers.submitted} new,{' '}
                  {current.prayers.praying} praying, {current.prayers.prayedFor}{' '}
                  prayed for.{' '}
                  <Link href="/pastor/care">Open prayer requests</Link>
                </p>
              )}
            </section>

            {current.manageable ? (
              <div className="care-actions">
                {current.status === 'active' ? (
                  <button
                    type="button"
                    className="button button-outline"
                    disabled={busy}
                    onClick={() => setConfirming('suspended')}
                  >
                    Suspend account
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => setConfirming('active')}
                  >
                    Reactivate account
                  </button>
                )}
              </div>
            ) : (
              <p className="care-note">
                {current.role === 'member'
                  ? 'This account is being deleted and can’t be changed here.'
                  : STAFF_NOTE}
              </p>
            )}
            <p className="care-note">
              Account deletion and data export aren’t available yet.
            </p>
          </div>
        )}
      </SidePanel>
      <KitConfirm
        open={!!confirming && !!current}
        title={
          confirming === 'suspended'
            ? 'Suspend this account?'
            : 'Reactivate this account?'
        }
        confirmLabel={confirming === 'suspended' ? 'Suspend' : 'Reactivate'}
        cancelLabel="Keep as is"
        tone={confirming === 'suspended' ? 'danger' : 'primary'}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const next = confirming;
          setConfirming(null);
          if (next) void changeStatus(next);
        }}
      >
        <p>
          {confirming === 'suspended'
            ? `${current ? displayName(current) : 'This person'} will be signed out on every device and can’t sign in until the account is reactivated.`
            : `${current ? displayName(current) : 'This person'} will be able to sign in again.`}
        </p>
      </KitConfirm>
      {reauth && current && (
        <ReauthDialog
          purpose="For your security, confirm it’s you before suspending or reactivating an account."
          onCancel={() => setReauth(null)}
          onConfirmed={() => {
            const next = reauth;
            setReauth(null);
            void changeStatus(next);
          }}
        />
      )}
    </section>
  );
}
