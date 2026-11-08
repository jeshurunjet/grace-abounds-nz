'use client';
import { useState, type FormEvent, type ReactNode } from 'react';
export function RecoveryForm({
  mode,
  footer,
}: {
  mode: 'forgot' | 'reset';
  footer: ReactNode;
}) {
  const [notice, setNotice] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(
      mode === 'forgot'
        ? 'Password recovery is unavailable until account services are connected. No email has been sent.'
        : 'Secure password reset is not connected. No password has been changed.',
    );
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
            ? 'Password recovery requires the connected account service.'
            : 'A verified, unexpired reset challenge is required before changing a password.'}
        </p>
        {mode === 'forgot' ? (
          <>
            <label htmlFor="recovery-email">Email</label>
            <input
              id="recovery-email"
              type="email"
              autoComplete="email"
              required
            />
          </>
        ) : (
          <>
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </>
        )}
        <button className="button">Check availability</button>
        {notice && (
          <p className="notice-box" role="status">
            {notice}
          </p>
        )}
        <footer>{footer}</footer>
      </form>
    </main>
  );
}
