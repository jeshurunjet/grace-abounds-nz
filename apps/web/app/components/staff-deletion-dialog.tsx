'use client';
import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DELETION_RETENTION_DAYS } from '@grace-abounds/validation';
import { useLayer } from './editor-kit/use-layer';

/*
 * Staff deleting a member's account (Phase 5C), only when the member has
 * asked: the staff member confirms that, says how they asked, and types
 * DELETE. The member is always sent a notice. The draft stays while the
 * request is checked or retried.
 */
export function StaffDeletionDialog({
  name,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (requestNote: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLElement>(null);
  const [asked, setAsked] = useState(false);
  const [note, setNote] = useState('');
  const [typed, setTyped] = useState('');
  useLayer(true, root, () => {
    if (!busy) onCancel();
  });
  const ready = asked && note.trim().length >= 3 && typed === 'DELETE' && !busy;
  return createPortal(
    <>
      <div
        className="kit-scrim kit-scrim-top"
        aria-hidden="true"
        onMouseDown={() => {
          if (!busy) onCancel();
        }}
      />
      <section
        ref={root}
        className="kit-confirm reauth-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
      >
        <h2 id={`${id}-title`}>Delete {name}’s account?</h2>
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) onConfirm(note.trim());
          }}
        >
          <p>
            Only do this when the member has asked. It can’t be undone: they are
            signed out everywhere, their upcoming bookings are cancelled and
            open appointments closed. Their remaining records are kept as
            “Deleted user” for {DELETION_RETENTION_DAYS} days (longer if an
            appointment was booked for a later date), then removed. They are
            emailed a notice.
          </p>
          <label className="people-check">
            <input
              type="checkbox"
              checked={asked}
              onChange={(event) => setAsked(event.target.checked)}
            />
            <span>The member asked for their account to be deleted</span>
          </label>
          <label className="care-field">
            <span>How did they ask?</span>
            <input
              value={note}
              maxLength={200}
              placeholder="For example, phoned the office on 21 November"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
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
              Keep account
            </button>
            <button className="button danger" disabled={!ready}>
              {busy ? 'Deleting…' : 'Delete account'}
            </button>
          </footer>
        </form>
      </section>
    </>,
    document.body,
  );
}
