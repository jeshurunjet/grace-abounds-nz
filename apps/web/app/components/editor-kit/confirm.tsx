'use client';
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLayer } from './use-layer';

/**
 * Confirmation over the page or over a side panel. The safe choice has
 * focus; Escape and the backdrop choose it.
 */
export function KitConfirm({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const root = useRef<HTMLElement>(null);
  useLayer(open, root, onCancel);
  if (!open) return null;
  return createPortal(
    <>
      <div
        className="kit-scrim kit-scrim-top"
        aria-hidden="true"
        onMouseDown={onCancel}
      />
      <section
        ref={root}
        className="kit-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={children ? `${id}-body` : undefined}
        tabIndex={-1}
      >
        <h2 id={`${id}-title`}>{title}</h2>
        {children && <div id={`${id}-body`}>{children}</div>}
        <footer>
          <button
            type="button"
            className="button button-outline"
            data-autofocus
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'button danger' : 'button'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </footer>
      </section>
    </>,
    document.body,
  );
}
