'use client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; kind: ToastKind };
const ToastContext = createContext<{ push: (message: string, kind?: ToastKind) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now();
    setToasts(items => [...items, { id, message, kind }]);
    window.setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), 4200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return <ToastContext.Provider value={value}>{children}<div className="toast-viewport" aria-live="polite">{toasts.map(toast => <div key={toast.id} className={`toast ${toast.kind}`}><span>{toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '!' : 'i'}</span>{toast.message}<button onClick={() => setToasts(items => items.filter(item => item.id !== toast.id))} aria-label="Dismiss notification">×</button></div>)}</div></ToastContext.Provider>;
}

export function useToast() {
  const value = useContext(ToastContext);
  return value ?? { push: () => {} };
}
