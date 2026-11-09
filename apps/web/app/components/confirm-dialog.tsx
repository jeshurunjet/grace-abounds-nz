'use client';
import { useEffect } from 'react';

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Archive',
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.currentTarget === event.target && onClose()}
    >
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <p className="eyebrow">Please confirm</p>
        <h2 id="dialog-title">{title}</h2>
        <div>{children}</div>
        <footer>
          <button className="button button-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
