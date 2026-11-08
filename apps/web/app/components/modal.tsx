'use client';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, type ReactNode } from 'react';
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const root = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(
        root.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((node) => node.getClientRects().length);
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (!first) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === root.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === root.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keys);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keys);
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="feature-modal"
        ref={root}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <header>
          <h2 id={id}>{title}</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}
