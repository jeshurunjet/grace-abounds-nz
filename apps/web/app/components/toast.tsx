'use client';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; kind: ToastKind };
const ToastContext = createContext<{
  push: (message: string, kind?: ToastKind) => void;
} | null>(null);

/** Most toasts shown at once; older ones are dropped first. */
const MAX_TOASTS = 4;
let nextToastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: ToastKind = 'success') => {
    // A counter, not a timestamp: two toasts in the same millisecond must
    // not share an id.
    const id = ++nextToastId;
    setToasts((items) => [
      ...items
        .filter((item) => item.message !== message)
        .slice(-(MAX_TOASTS - 1)),
      { id, message, kind },
    ]);
    // Errors stay longer; recovery controls stay inline on the form itself.
    window.setTimeout(
      () => setToasts((items) => items.filter((item) => item.id !== id)),
      kind === 'error' ? 8000 : 4200,
    );
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>
            <span>
              {toast.kind === 'success'
                ? '✓'
                : toast.kind === 'error'
                  ? '!'
                  : 'i'}
            </span>
            {toast.message}
            <button
              onClick={() =>
                setToasts((items) =>
                  items.filter((item) => item.id !== toast.id),
                )
              }
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  return value ?? { push: () => {} };
}
