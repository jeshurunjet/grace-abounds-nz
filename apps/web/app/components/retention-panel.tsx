'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import {
  addDays,
  HOLD_MAX_REVIEW_DAYS,
  nzNow,
  retentionHoldReasonLabels,
  type RetentionHoldItem,
  type RetentionPreview,
  type RetentionRunSummary,
} from '@grace-abounds/validation';
import { KitConfirm } from './editor-kit/confirm';
import { useLayer } from './editor-kit/use-layer';
import { ReauthDialog } from './reauth-dialog';
import { useToast } from './toast';
import { careDate } from './prayer-ui';
import { api, ApiError, errorMessage } from '../lib/api-client';

/*
 * Records & retention (Phase 5C) for both staff roles: what is due for
 * deletion (counts only), what records holds keep back, the holds
 * themselves (renew, release) and "Delete eligible records now", which
 * removes only what is due and never anything held. While clean-up isn't
 * switched on (owner walkthrough pending) the server refuses and this says
 * so. Belongs to one signed-in staff identity and role: a change starts
 * fresh and late answers (including a confirmation) are ignored.
 *
 * Each press of "Delete eligible records now" gets one request key, kept
 * until that run has finished: confirming it's you, or pressing again after
 * a failure, continues the same run instead of starting another.
 */

const newRequestKey = () =>
  (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  ).replace(/[^A-Za-z0-9_-]/g, '');

export function RetentionPanel() {
  const { data: session } = useSession();
  const user = session?.user?.id ?? '';
  const role = session?.user?.role ?? '';
  if (!user || (role !== 'pastor' && role !== 'admin')) return null;
  return <PanelFor key={`${user}:${role}`} />;
}

type Pending =
  | { kind: 'run'; requestKey: string }
  | { kind: 'renew'; hold: RetentionHoldItem; reviewBy: string }
  | { kind: 'release'; hold: RetentionHoldItem };

function PanelFor() {
  const { push } = useToast();
  const [preview, setPreview] = useState<RetentionPreview | null>(null);
  const [holds, setHolds] = useState<RetentionHoldItem[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RetentionRunSummary | null>(null);
  const [confirmRun, setConfirmRun] = useState(false);
  const [releasing, setReleasing] = useState<RetentionHoldItem | null>(null);
  const [renewing, setRenewing] = useState<RetentionHoldItem | null>(null);
  const [reauth, setReauth] = useState<Pending | null>(null);
  /** The unfinished run's key (reused until that run is done). */
  const runKey = useRef<string | null>(null);
  const alive = useRef(true);
  const latest = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const ticket = ++latest.current;
    try {
      const [summary, list] = await Promise.all([
        api<RetentionPreview>('/staff/retention'),
        api<RetentionHoldItem[]>('/staff/holds'),
      ]);
      if (!alive.current || ticket !== latest.current) return;
      setPreview(summary.data);
      setHolds(list.data);
      setLoadError('');
    } catch (failure) {
      if (alive.current && ticket === latest.current)
        setLoadError(errorMessage(failure));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function perform(action: Pending) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (action.kind === 'run') {
        const summary = (
          await api<RetentionRunSummary>('/staff/retention/run', {
            method: 'POST',
            body: JSON.stringify({ requestKey: action.requestKey }),
          })
        ).data;
        if (!alive.current) return;
        if (runKey.current === action.requestKey) runKey.current = null;
        setResult(summary);
        push('Eligible records were deleted.', 'success');
      } else if (action.kind === 'renew') {
        await api(`/staff/holds/${action.hold.id}/renew`, {
          method: 'POST',
          body: JSON.stringify({ reviewBy: action.reviewBy }),
          version: action.hold.version,
        });
        if (!alive.current) return;
        setRenewing(null);
        push('The hold’s review date was changed.', 'success');
      } else {
        await api(`/staff/holds/${action.hold.id}/release`, {
          method: 'POST',
          body: '{}',
          version: action.hold.version,
        });
        if (!alive.current) return;
        push('The hold was released.', 'success');
      }
      await load();
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ApiError && failure.code === 'REAUTH_REQUIRED') {
        setRenewing(null);
        setReauth(action);
        return;
      }
      const conflict =
        failure instanceof ApiError && failure.code === 'VERSION_CONFLICT';
      setError(
        conflict
          ? 'This hold changed since you opened the page. It has been reloaded.'
          : action.kind === 'run'
            ? `${errorMessage(failure)} Anything already deleted is shown below; pressing the button again continues the same clean-up.`
            : errorMessage(failure),
      );
      // A run that stopped part-way: show exactly what it did.
      if (conflict || action.kind === 'run') {
        setResult(null);
        await load();
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const due = preview?.due;
  const total = due
    ? due.deletedAccounts + due.auditEvents + due.deletionRecords
    : 0;
  return (
    <div className="retention">
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
      {!preview && !loadError && <p className="care-note">Loading…</p>}
      {preview && (
        <section className="panel" aria-labelledby="retention-due">
          <h2 id="retention-due">Due for deletion</h2>
          <ul className="retention-counts">
            <li>
              <strong>{preview.due.deletedAccounts}</strong> deleted accounts
              past their 30 days
            </li>
            <li>
              <strong>{preview.due.auditEvents}</strong> activity records past
              their retention
            </li>
            <li>
              <strong>{preview.due.deletionRecords}</strong> old deletion
              records
            </li>
          </ul>
          <p className="care-note">
            {preview.auditRule} Records made before{' '}
            {careDate(preview.auditCutoff, false)} are eligible now.
          </p>
          {(preview.held.deletedAccounts > 0 ||
            preview.held.auditEvents > 0) && (
            <p className="care-note">
              Kept back by records holds: {preview.held.deletedAccounts} deleted
              accounts and {preview.held.auditEvents} activity records.
            </p>
          )}
          {!preview.enabled && (
            <p className="notice-box">
              Deleting records isn’t switched on yet. Nothing is deleted until
              the church has approved it.
            </p>
          )}
          <button
            type="button"
            className="button danger"
            disabled={busy || !preview.enabled || total === 0}
            onClick={() => setConfirmRun(true)}
          >
            Delete eligible records now
          </button>
          {result && (
            <div className="retention-result" role="status">
              <p>
                Deleted {result.removed.deletedAccounts} accounts,{' '}
                {result.removed.auditEvents} activity records and{' '}
                {result.removed.deletionRecords} deletion records. Kept back by
                holds: {result.held.deletedAccounts} accounts and{' '}
                {result.held.auditEvents} activity records.
              </p>
              {result.more && (
                <p>More records are due. Run it again to continue.</p>
              )}
              <p className="care-note">
                Stored files of deleted accounts are removed shortly after.
              </p>
            </div>
          )}
          {preview.lastRun && !result && (
            <p className="care-note">
              Last run: {preview.lastRun.status} on{' '}
              {careDate(preview.lastRun.startedAt)}. It deleted{' '}
              {preview.lastRun.removed.deletedAccounts} accounts,{' '}
              {preview.lastRun.removed.auditEvents} activity records and{' '}
              {preview.lastRun.removed.deletionRecords} deletion records.
            </p>
          )}
        </section>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {holds && (
        <section className="panel" aria-labelledby="retention-holds">
          <h2 id="retention-holds">Records holds</h2>
          <p className="care-note">
            A hold keeps one person’s records out of every clean-up while a
            legal obligation, investigation or claim needs them. Place one from
            that person’s page in People. Each hold has a review date within a
            year and keeps protecting until it is released.
          </p>
          {!holds.length && <p className="care-note">No holds.</p>}
          <ul className="care-tasks">
            {holds.map((hold) => (
              <li key={hold.id} className="care-task retention-hold">
                <span className="care-task-head">
                  <b>{hold.subject}</b>
                  <span
                    className={`care-badge ${hold.overdue ? 'is-suspended' : 'is-active'}`}
                  >
                    {hold.overdue ? 'Review overdue' : 'Active'}
                  </span>
                </span>
                <span>
                  {retentionHoldReasonLabels[hold.reason]} · {hold.reference}
                </span>
                <small>{hold.basis}</small>
                <small>
                  Review by {careDate(`${hold.reviewBy}T00:00:00Z`, false)}
                </small>
                <span className="care-actions">
                  <button
                    type="button"
                    className="button button-outline"
                    disabled={busy}
                    onClick={() => setRenewing(hold)}
                  >
                    New review date
                  </button>
                  <button
                    type="button"
                    className="text-danger"
                    disabled={busy}
                    onClick={() => setReleasing(hold)}
                  >
                    Release
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <KitConfirm
        open={confirmRun && !!preview}
        title="Delete eligible records now?"
        confirmLabel="Delete eligible records"
        cancelLabel="Not now"
        onCancel={() => setConfirmRun(false)}
        onConfirm={() => {
          setConfirmRun(false);
          runKey.current ??= newRequestKey();
          void perform({ kind: 'run', requestKey: runKey.current });
        }}
      >
        <p>
          This permanently deletes only records that are already due:{' '}
          {due?.deletedAccounts ?? 0} deleted accounts, {due?.auditEvents ?? 0}{' '}
          activity records and {due?.deletionRecords ?? 0} deletion records.
          Anything under a hold is kept. It can’t be undone.
        </p>
      </KitConfirm>
      <KitConfirm
        open={!!releasing}
        title="Release this hold?"
        confirmLabel="Release hold"
        cancelLabel="Keep it"
        onCancel={() => setReleasing(null)}
        onConfirm={() => {
          const hold = releasing;
          setReleasing(null);
          if (hold) void perform({ kind: 'release', hold });
        }}
      >
        <p>
          The person’s records then follow the usual retention again and may be
          deleted when due.
        </p>
      </KitConfirm>
      {renewing && (
        <RenewDialog
          hold={renewing}
          busy={busy}
          onCancel={() => setRenewing(null)}
          onConfirm={(reviewBy) =>
            void perform({ kind: 'renew', hold: renewing, reviewBy })
          }
        />
      )}
      {reauth && (
        <ReauthDialog
          purpose="For your security, confirm it’s you before changing records retention."
          onCancel={() => setReauth(null)}
          onConfirmed={() => {
            const action = reauth;
            setReauth(null);
            void perform(action);
          }}
        />
      )}
    </div>
  );
}

function RenewDialog({
  hold,
  busy,
  onCancel,
  onConfirm,
}: {
  hold: RetentionHoldItem;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reviewBy: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLElement>(null);
  const today = nzNow().date;
  const [reviewBy, setReviewBy] = useState(addDays(today, 90));
  useLayer(true, root, () => {
    if (!busy) onCancel();
  });
  return createPortal(
    <>
      <div className="kit-scrim kit-scrim-top" aria-hidden="true" />
      <section
        ref={root}
        className="kit-confirm reauth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
      >
        <h2 id={`${id}-title`}>New review date for {hold.subject}</h2>
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) onConfirm(reviewBy);
          }}
        >
          <label className="care-field">
            <span>Review by</span>
            <input
              type="date"
              min={addDays(today, 1)}
              max={addDays(today, HOLD_MAX_REVIEW_DAYS)}
              value={reviewBy}
              onChange={(event) => setReviewBy(event.target.value)}
            />
          </label>
          <footer>
            <button
              type="button"
              className="button button-outline"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button className="button" disabled={busy || !reviewBy}>
              Save review date
            </button>
          </footer>
        </form>
      </section>
    </>,
    document.body,
  );
}
