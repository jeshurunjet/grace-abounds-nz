'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { signOut, useSession } from 'next-auth/react';
import { DELETION_EFFECTS_NOTE } from '@grace-abounds/validation';
import { useLayer } from './editor-kit/use-layer';
import { ReauthDialog } from './reauth-dialog';
import { api, ApiError, errorMessage } from '../lib/api-client';

/*
 * "Delete your account" (Phase 5C). No grace period: the member reads what
 * happens, types DELETE and confirms it's them; the server then removes
 * access at once and signs them out. Staff accounts can't be deleted here.
 * While real deletion is still switched off, the server says so and this
 * shows that plainly. Belongs to one signed-in account and role.
 */

export function AccountDeletionPanel() {
  const { data: session } = useSession();
  const user = session?.user?.id ?? '';
  const role = session?.user?.role ?? '';
  if (!user) return null;
  // Keyed by account and role: a different sign-in or a role change drops
  // any open confirmation and ignores a late answer.
  return <DeletionFor key={`${user}:${role}`} member={role === 'member'} />;
}

function DeletionFor({ member }: { member: boolean }) {
  const [open, setOpen] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/me/deletion', {
        method: 'POST',
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      if (!alive.current) return;
      // Access is already gone on the server; leave the signed-in area.
      await signOut({ callbackUrl: '/login?deleted=1' });
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ApiError && failure.code === 'REAUTH_REQUIRED') {
        setOpen(false);
        setReauth(true);
        return;
      }
      setOpen(true);
      setError(errorMessage(failure));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <div className="preference-row">
      <span>
        <strong>Delete your account</strong>
        <small>
          {member
            ? 'Removes your access straight away. This can’t be undone.'
            : 'Staff accounts can’t be deleted here. They are managed by the church’s operator.'}
        </small>
      </span>
      <button
        type="button"
        className="text-danger"
        disabled={!member}
        onClick={() => {
          setTyped('');
          setError('');
          setOpen(true);
        }}
      >
        Delete account
      </button>
      {open && (
        <ConfirmDeletion
          typed={typed}
          setTyped={setTyped}
          busy={busy}
          error={error}
          onCancel={() => {
            if (!busy) setOpen(false);
          }}
          onConfirm={() => void remove()}
        />
      )}
      {reauth && (
        <ReauthDialog
          purpose="For your security, confirm it’s you before deleting your account."
          onCancel={() => setReauth(false)}
          onConfirmed={() => {
            setReauth(false);
            void remove();
          }}
        />
      )}
    </div>
  );
}

function ConfirmDeletion({
  typed,
  setTyped,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  typed: string;
  setTyped: (value: string) => void;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const id = useId();
  const root = useRef<HTMLElement>(null);
  useLayer(true, root, onCancel);
  return createPortal(
    <>
      <div
        className="kit-scrim kit-scrim-top"
        aria-hidden="true"
        onMouseDown={onCancel}
      />
      <section
        ref={root}
        className="kit-confirm reauth-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        tabIndex={-1}
      >
        <h2 id={`${id}-title`}>Delete your account?</h2>
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            if (typed === 'DELETE' && !busy) onConfirm();
          }}
        >
          <p id={`${id}-body`}>{DELETION_EFFECTS_NOTE}</p>
          <label className="care-field">
            <span>Type DELETE to confirm</span>
            <input
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button
              type="button"
              className="button button-outline"
              disabled={busy}
              onClick={onCancel}
            >
              Keep my account
            </button>
            <button
              className="button danger"
              disabled={typed !== 'DELETE' || busy}
            >
              {busy ? 'Deleting…' : 'Delete my account'}
            </button>
          </footer>
        </form>
      </section>
    </>,
    document.body,
  );
}
