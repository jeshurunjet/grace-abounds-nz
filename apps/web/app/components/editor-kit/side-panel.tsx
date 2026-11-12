'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { KitConfirm } from './confirm';
import { useLayer } from './use-layer';

/**
 * The side panel every editor uses (owner decision: option A). Closing by
 * Cancel, Escape, the backdrop or the close button goes through one path:
 * a clean panel closes; a dirty one asks "Keep editing / Discard"; nothing
 * closes while it is busy saving. Focus returns to the trigger.
 */
export function SidePanel({
  open,
  title,
  eyebrow,
  dirty = false,
  busy = false,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  eyebrow?: string;
  dirty?: boolean;
  busy?: boolean;
  onClose: () => void;
  /** Receives the guarded close, for a Cancel button. */
  footer?: (requestClose: () => void) => ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  const root = useRef<HTMLElement>(null);
  const [guard, setGuard] = useState(false);
  const requestClose = () => {
    if (busy) return;
    if (dirty) setGuard(true);
    else onClose();
  };
  useLayer(open, root, requestClose);
  // Leaving the page (reload, closing the tab) also asks first.
  useEffect(() => {
    if (!open || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [open, dirty]);
  useEffect(() => {
    if (!open) setGuard(false);
  }, [open]);
  if (!open) return null;
  return createPortal(
    <>
      <div
        className="kit-scrim"
        aria-hidden="true"
        onMouseDown={requestClose}
      />
      <section
        ref={root}
        className="kit-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <header className="kit-panel-head">
          <div>
            {eyebrow && <p className="kit-eyebrow">{eyebrow}</p>}
            <h2 id={id}>{title}</h2>
          </div>
          <button
            type="button"
            className="kit-icon-button"
            aria-label="Close panel"
            onClick={requestClose}
            disabled={busy}
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <div className="kit-panel-body">{children}</div>
        {footer && (
          <footer className="kit-panel-foot">{footer(requestClose)}</footer>
        )}
      </section>
      <KitConfirm
        open={guard}
        title="Discard your changes?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onCancel={() => setGuard(false)}
        onConfirm={() => {
          setGuard(false);
          onClose();
        }}
      >
        <p>The edits in this panel haven’t been applied.</p>
      </KitConfirm>
    </>,
    document.body,
  );
}
