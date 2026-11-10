'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { accountApi, errorMessage } from '../lib/api-client';
import { CodeInputs, PasswordInput } from './forms';
import { useToast } from './toast';

const RESET_EMAIL_KEY = 'grace-reset-email';

/**
 * Password recovery with a six-digit emailed code.
 * forgot: request a code. reset: enter the code and a new password; on
 * success every session is signed out and the person signs in again.
 */
export function RecoveryForm({
  mode,
  footer,
}: {
  mode: 'forgot' | 'reset';
  footer: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (mode !== 'reset') return;
    try {
      setEmail(sessionStorage.getItem(RESET_EMAIL_KEY) ?? '');
    } catch {
      /* Storage unavailable: the person types the email. */
    }
  }, [mode]);

  async function requestCode() {
    setPending(true);
    setError('');
    try {
      const address = email.trim().toLowerCase();
      await accountApi('/password-reset', { email: address });
      try {
        sessionStorage.setItem(RESET_EMAIL_KEY, address);
      } catch {
        /* The reset page will ask for the email again. */
      }
      if (mode === 'forgot') router.push('/reset-password');
      else
        setNotice(
          `If ${address} has an account, a new six-digit code is on its way. It expires in 10 minutes.`,
        );
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === 'forgot') return requestCode();
    setPending(true);
    setError('');
    setFieldErrors({});
    try {
      await accountApi('/password-reset/confirm', {
        email: email.trim().toLowerCase(),
        code: code.join(''),
        password,
      });
      try {
        sessionStorage.removeItem(RESET_EMAIL_KEY);
      } catch {
        /* Nothing to clear. */
      }
      toast.push('Password changed. Please sign in again.', 'success');
      router.push('/login?reset=1');
    } catch (failure) {
      setError(errorMessage(failure));
      const fields = (failure as { fieldErrors?: Record<string, string> })
        .fieldErrors;
      if (fields) setFieldErrors(fields);
      setPending(false);
    }
  }

  return (
    <main className="auth-simple">
      <form onSubmit={submit}>
        <p className="eyebrow">Account security</p>
        <h1>
          {mode === 'forgot' ? 'Reset your password' : 'Choose a new password'}
        </h1>
        <p>
          {mode === 'forgot'
            ? 'Enter your account email and we’ll send a six-digit code.'
            : 'Enter the code we emailed you and choose a new password. Resetting signs you out on every device.'}
        </p>
        <label htmlFor="recovery-email">Email</label>
        <input
          id="recovery-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {mode === 'reset' && (
          <>
            <CodeInputs code={code} setCode={setCode} autoFocus={false} />
            {fieldErrors.code && (
              <p className="form-error">{fieldErrors.code}</p>
            )}
            <PasswordInput
              id="new-password"
              label="New password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
            />
            {fieldErrors.password && (
              <p className="form-error">{fieldErrors.password}</p>
            )}
          </>
        )}
        <button
          className="button"
          disabled={
            pending || (mode === 'reset' && code.some((digit) => !digit))
          }
        >
          {pending
            ? mode === 'forgot'
              ? 'Sending code…'
              : 'Saving…'
            : mode === 'forgot'
              ? 'Email me a code'
              : 'Change password'}
        </button>
        {mode === 'reset' && (
          <button
            type="button"
            className="auth-text-button"
            disabled={pending || !email}
            onClick={() => void requestCode()}
          >
            Send a new code
          </button>
        )}
        {notice && (
          <p className="notice-box" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer>{footer}</footer>
      </form>
    </main>
  );
}
