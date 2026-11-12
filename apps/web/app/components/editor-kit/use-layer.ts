'use client';
import { useEffect, useRef, type RefObject } from 'react';

/**
 * Open dialogs, newest last. Only the topmost one reacts to Escape and owns
 * the focus trap, so a confirmation opened over a panel closes first.
 */
const stack: symbol[] = [];
const FOCUSABLE =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

/**
 * Modal layer behaviour: moves focus in on open (first field, else the
 * container), traps Tab inside, routes Escape to the topmost layer only and
 * returns focus to whatever opened it on close.
 */
export function useLayer(
  open: boolean,
  root: RefObject<HTMLElement | null>,
  onEscape: () => void,
) {
  const escape = useRef(onEscape);
  escape.current = onEscape;
  useEffect(() => {
    if (!open) return;
    const id = Symbol('layer');
    stack.push(id);
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = root.current?.querySelector<HTMLElement>(
      '[data-autofocus], input:not(:disabled), textarea:not(:disabled), select:not(:disabled)',
    );
    (first ?? root.current)?.focus();
    const keys = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        escape.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(
        root.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter(
        // jsdom has no layout; in browsers skip elements that aren't rendered.
        (node) =>
          node.getClientRects().length > 0 || process.env.NODE_ENV === 'test',
      );
      const head = nodes[0];
      const tail = nodes[nodes.length - 1];
      if (!head || !tail) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey && (active === head || active === root.current)) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && active === tail) {
        event.preventDefault();
        head.focus();
      }
    };
    document.addEventListener('keydown', keys);
    return () => {
      document.removeEventListener('keydown', keys);
      stack.splice(stack.indexOf(id), 1);
      if (!stack.length) document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open, root]);
}
