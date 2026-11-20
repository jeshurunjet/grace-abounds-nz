'use client';
import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  addDays,
  HOLD_MAX_REVIEW_DAYS,
  nzNow,
  retentionHoldReasonLabels,
  retentionHoldReasons,
  type RetentionHoldReason,
} from '@grace-abounds/validation';
import { useLayer } from './editor-kit/use-layer';

export type HoldInput = {
  reason: RetentionHoldReason;
  reference: string;
  basis: string;
  reviewBy: string;
};

/*
 * Placing a records hold on one person (Phase 5C): only for a legal
 * obligation, investigation or claim, with a short reference and basis
 * (never care details) and a review date within a year. The owner keeps
 * the draft (initial/onChange), so it survives confirm-it's-you, a failed
 * retry, and closing and reopening the dialog for the same person.
 */
export function HoldDialog({
  name,
  busy,
  error,
  initial,
  onChange,
  onCancel,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  error: string;
  /** A draft kept from before (confirm-it's-you, a failed try, Cancel). */
  initial?: HoldInput | null;
  /** Every edit, so the owner can keep the draft while this is closed. */
  onChange?: (input: HoldInput) => void;
  onCancel: () => void;
  onConfirm: (input: HoldInput) => void;
}) {
  const id = useId();
  const root = useRef<HTMLElement>(null);
  const today = nzNow().date;
  const [draft, setDraftState] = useState<HoldInput>(
    () =>
      initial ?? {
        reason: 'legal_obligation',
        reference: '',
        basis: '',
        reviewBy: addDays(today, 90),
      },
  );
  const setDraft = (next: HoldInput) => {
    setDraftState(next);
    onChange?.(next);
  };
  useLayer(true, root, () => {
    if (!busy) onCancel();
  });
  const ready =
    !busy &&
    draft.reference.trim().length >= 3 &&
    draft.basis.trim().length >= 3 &&
    !!draft.reviewBy;
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
        <h2 id={`${id}-title`}>Place a records hold for {name}</h2>
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready)
              onConfirm({
                ...draft,
                reference: draft.reference.trim(),
                basis: draft.basis.trim(),
              });
          }}
        >
          <p>
            Only when a legal obligation, investigation or claim needs this
            person’s records. Their records are kept out of every clean-up until
            the hold is released. Don’t include any care details.
          </p>
          <label className="care-field">
            <span>Reason</span>
            <select
              value={draft.reason}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  reason: event.target.value as RetentionHoldReason,
                })
              }
            >
              {retentionHoldReasons.map((reason) => (
                <option key={reason} value={reason}>
                  {retentionHoldReasonLabels[reason]}
                </option>
              ))}
            </select>
          </label>
          <label className="care-field">
            <span>Reference</span>
            <input
              value={draft.reference}
              maxLength={120}
              placeholder="For example, a case or claim number"
              onChange={(event) =>
                setDraft({ ...draft, reference: event.target.value })
              }
            />
          </label>
          <label className="care-field">
            <span>Why the records must be kept</span>
            <input
              value={draft.basis}
              maxLength={300}
              onChange={(event) =>
                setDraft({ ...draft, basis: event.target.value })
              }
            />
          </label>
          <label className="care-field">
            <span>Review by</span>
            <input
              type="date"
              min={addDays(today, 1)}
              max={addDays(today, HOLD_MAX_REVIEW_DAYS)}
              value={draft.reviewBy}
              onChange={(event) =>
                setDraft({ ...draft, reviewBy: event.target.value })
              }
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
              Cancel
            </button>
            <button className="button" disabled={!ready}>
              {busy ? 'Placing…' : 'Place hold'}
            </button>
          </footer>
        </form>
      </section>
    </>,
    document.body,
  );
}
