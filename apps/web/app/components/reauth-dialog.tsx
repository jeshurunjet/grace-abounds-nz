'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLayer } from './editor-kit/use-layer';
import { CodeInputs, PasswordInput } from './forms';
import { accountApi, api, errorMessage } from '../lib/api-client';

/*
 * "Confirm it's you" for sensitive staff actions (Phase 4C), using the same
 * re-authentication endpoint and steps as Settings: the current password,
 * or a six-digit code emailed to the account. Success records a fresh
 * sign-in time on this session only; the caller then retries its action
 * and the server checks again. Shown above whatever opened it. Answers that
 * arrive after the dialog is gone (cancelled, or a different person signed
 * in) are ignored, so they can never resume the action.
 */

type Mode = 'loading' | 'password' | 'code' | 'code-sent';
const blankCode = () => ['', '', '', '', '', ''];

export function ReauthDialog({
  purpose,
  onCancel,
  onConfirmed,
}: {
  purpose: string;
  onCancel: () => void;
  /** Called once the server accepted the proof. */
  onConfirmed: () => void;
}) {
  const id = useId();
  const root = useRef<HTMLElement>(null);
  const alive = useRef(true);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  const confirmed = useRef(onConfirmed);
  confirmed.current = onConfirmed;
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<Mode>('loading');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState(blankCode);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  busyRef.current = busy;
  useLayer(true, root, () => {
    if (!busyRef.current) cancel.current();
  });

  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        const data = (
          await api<{ email: string; hasPassword: boolean }>('/me/security')
        ).data;
        if (!alive.current) return;
        setEmail(data.email);
        setMode(data.hasPassword ? 'password' : 'code');
      } catch {
        if (alive.current) setMode('code');
      }
    })();
    return () => {
      alive.current = false;
    };
  }, []);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const result = await accountApi('/reauth', body);
      if (!alive.current) return;
      if (result.status === 202) {
        setCode(blankCode());
        setMode('code-sent');
        return;
      }
      confirmed.current();
    } catch (failure) {
      if (alive.current) setError(errorMessage(failure));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const ready =
    !busy &&
    mode !== 'loading' &&
    !(mode === 'password' && !password) &&
    !(mode === 'code-sent' && code.some((digit) => !digit));
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
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
      >
        <h2 id={`${id}-title`}>Confirm it’s you</h2>
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            if (mode === 'password')
              void send({ method: 'password', password });
            else if (mode === 'code-sent')
              void send({ method: 'code', code: code.join('') });
            else void send({ method: 'request-code' });
          }}
        >
          <p>{purpose}</p>
          {mode === 'loading' && <p className="care-note">Loading…</p>}
          {mode === 'password' && (
            <PasswordInput
              id={`${id}-password`}
              autoComplete="current-password"
              label="Current password"
              value={password}
              onChange={setPassword}
            />
          )}
          {mode === 'code' && (
            <p>
              We’ll email a six-digit code to{' '}
              {email || 'your sign-in email address'}.
            </p>
          )}
          {mode === 'code-sent' && (
            <>
              <p>
                Enter the code we sent to {email || 'your email'}. It expires in
                10 minutes.
              </p>
              <CodeInputs code={code} setCode={setCode} />
            </>
          )}
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
              {busy
                ? 'Checking…'
                : mode === 'code'
                  ? 'Email me a code'
                  : 'Confirm'}
            </button>
          </footer>
          {mode === 'password' && (
            <button
              type="button"
              className="auth-text-button"
              onClick={() => {
                setError('');
                setMode('code');
              }}
            >
              Use an email code instead
            </button>
          )}
          {mode === 'code-sent' && (
            <button
              type="button"
              className="auth-text-button"
              disabled={busy}
              onClick={() => void send({ method: 'request-code' })}
            >
              Send a new code
            </button>
          )}
        </form>
      </section>
    </>,
    document.body,
  );
}
