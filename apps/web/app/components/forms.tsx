'use client';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useContent } from './content-provider';
import { KeyRound, Mail, ArrowLeft } from 'lucide-react';
import { Logo } from './logo';
export function PrayerForm() {
  const [sent, setSent] = useState(false);
  function submit(e: FormEvent) {
    e.preventDefault();
    setSent(true);
  }
  return (
    <form className="form prayer-form" onSubmit={submit}>
      <label htmlFor="prayer-name">Your name</label>
      <input id="prayer-name" name="name" required />
      <label htmlFor="prayer-request">How can we pray for you?</label>
      <textarea id="prayer-request" name="request" rows={5} required />
      <button className="button" type="submit">
        Send prayer request
      </button>
      {sent && (
        <p className="form-note" role="status">
          Thank you. This development preview has not sent or saved your
          request.
        </p>
      )}
    </form>
  );
}
function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.6 17.74 9.5 24 9.5Z"
        transform="translate(0 4)"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.77 7.18l7.73 6C44.4 37.93 46.98 31.8 46.98 24.55Z"
        transform="translate(0 0)"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.97 23.97 0 0 0 0 21.56l7.98-6.19Z"
        transform="translate(0 4)"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6c-2.14 1.45-4.88 2.3-8.17 2.3-6.26 0-11.57-4.1-13.46-9.72l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
        transform="translate(0 -4)"
      />
    </svg>
  );
}

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const login = mode === 'login';
  const [step, setStep] = useState<'start' | 'code' | 'password' | 'demo'>(
    'start',
  );
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [role, setRole] = useState<'member' | 'pastor' | 'admin'>('member');
  const digits = useRef<(HTMLInputElement | null)[]>([]);
  const { content } = useContent();
  const verses = useMemo(
    () =>
      content.site.authVerses.split('\n').map((line) => {
        const [text, reference] = line.split('|');
        return { text, reference };
      }),
    [content.site.authVerses],
  );
  const [verseIndex, setVerseIndex] = useState(0);
  useEffect(() => {
    if (
      verses.length < 2 ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const timer = window.setInterval(
      () => setVerseIndex((value) => (value + 1) % verses.length),
      6000,
    );
    return () => window.clearInterval(timer);
  }, [verses.length]);
  useEffect(() => {
    if (step === 'code') digits.current[0]?.focus();
  }, [step]);
  function navigate(next: typeof step) {
    setStep(next);
    setNotice('');
    setError('');
    setShow(false);
  }
  function fillDigits(value: string, start: number) {
    const numbers = value.replace(/\D/g, '').slice(0, 6 - start);
    if (!numbers) return;
    setCode((current) =>
      current.map((digit, index) =>
        index >= start && index < start + numbers.length
          ? numbers[index - start]!
          : digit,
      ),
    );
    digits.current[Math.min(start + numbers.length, 5)]?.focus();
    setError('');
  }
  async function demo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const result = await signIn('credentials', {
        email: `${role}@example.org`,
        password: String(new FormData(event.currentTarget).get('password')),
        redirect: false,
      });
      if (!result || result.error) {
        setError('Demo sign-in failed. Use the development demo password.');
        return;
      }
      const next = new URLSearchParams(window.location.search).get(
        'callbackUrl',
      );
      const safe =
        next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\');
      window.location.assign(
        safe
          ? next!
          : role === 'pastor'
            ? '/pastor'
            : role === 'admin'
              ? '/admin'
              : '/members',
      );
    } catch {
      setError('The sign-in service could not be reached. Please try again.');
    } finally {
      setPending(false);
    }
  }
  const verse = verses[verseIndex] ?? verses[0];
  return (
    <div className="auth-page">
      <aside>
        <Logo light />
        <div className="auth-verse-gallery">
          <blockquote>“{verse?.text}”</blockquote>
          <p>{verse?.reference}</p>
          <div>
            {verses.map((item, index) => (
              <button
                type="button"
                key={index}
                className={index === verseIndex ? 'active' : ''}
                onClick={() => setVerseIndex(index)}
                aria-label={`Show verse ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </aside>
      <section>
        <div className="auth-wrap">
          <Logo />
          {step !== 'start' && (
            <button className="auth-back" onClick={() => navigate('start')}>
              <ArrowLeft size={16} /> All sign-in options
            </button>
          )}
          <p className="eyebrow">
            {step === 'code'
              ? 'Email verification'
              : step === 'demo'
                ? 'Development preview'
                : 'Your church community'}
          </p>
          <h1>
            {step === 'code'
              ? 'Enter your code'
              : login
                ? 'Welcome Back'
                : 'Join Us'}
          </h1>
          <p>
            {step === 'code'
              ? `Six-digit verification for ${email}`
              : login
                ? 'Sign in to your church account.'
                : 'Find your place in the Grace Abounds community.'}
          </p>
          <div className="auth-card form">
            {step === 'start' && (
              <>
                <form
                  className="form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setCode(['', '', '', '', '', '']);
                    setStep('code');
                    setNotice(
                      'Email verification is not connected. No code has been sent; you are viewing the verification screen.',
                    );
                  }}
                >
                  {!login && (
                    <label>
                      Full name
                      <input name="fullName" autoComplete="name" required />
                    </label>
                  )}
                  <label>
                    Email
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </label>
                  <button className="button">
                    <Mail size={17} /> Continue with email
                  </button>
                </form>
                <div className="auth-divider">or</div>
                <button
                  type="button"
                  className="auth-provider"
                  onClick={() =>
                    setNotice(
                      'Google sign-in is not connected. No Google account has been authenticated.',
                    )
                  }
                >
                  <GoogleMark /> Continue with Google
                </button>
                <button
                  type="button"
                  className="auth-provider"
                  onClick={() =>
                    setNotice(
                      'Passkey sign-in is not connected. No device prompt or authentication has occurred.',
                    )
                  }
                >
                  <KeyRound size={19} /> Continue with a passkey
                </button>
                <p className="form-note">
                  Use your device screen lock with a registered passkey when
                  account services are available.
                </p>
                <button
                  className="auth-text-button"
                  onClick={() => navigate('password')}
                >
                  Use a password instead
                </button>
              </>
            )}
            {step === 'code' && (
              <form
                className="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  setError(
                    'Code verification is unavailable until authentication services are connected. No sign-in has occurred.',
                  );
                }}
              >
                <fieldset className="otp-fieldset">
                  <legend>Six-digit verification code</legend>
                  <div className="otp-inputs">
                    {code.map((digit, index) => (
                      <input
                        key={index}
                        ref={(node) => {
                          digits.current[index] = node;
                        }}
                        aria-label={`Verification code digit ${index + 1}`}
                        inputMode="numeric"
                        autoComplete={index === 0 ? 'one-time-code' : 'off'}
                        pattern="[0-9]"
                        required
                        value={digit}
                        onChange={(event) => {
                          if (!event.target.value)
                            setCode((current) =>
                              current.map((item, i) =>
                                i === index ? '' : item,
                              ),
                            );
                          else fillDigits(event.target.value, index);
                        }}
                        onPaste={(event) => {
                          event.preventDefault();
                          fillDigits(
                            event.clipboardData.getData('text'),
                            index,
                          );
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Backspace' && !digit && index > 0)
                            digits.current[index - 1]?.focus();
                          if (event.key === 'ArrowLeft') {
                            event.preventDefault();
                            digits.current[Math.max(0, index - 1)]?.focus();
                          }
                          if (event.key === 'ArrowRight') {
                            event.preventDefault();
                            digits.current[Math.min(5, index + 1)]?.focus();
                          }
                        }}
                      />
                    ))}
                  </div>
                </fieldset>
                <button
                  className="button"
                  disabled={code.some((digit) => !digit)}
                >
                  Verify code
                </button>
                <button
                  type="button"
                  className="auth-text-button"
                  onClick={() =>
                    setNotice(
                      'Resending is unavailable. No code has been sent.',
                    )
                  }
                >
                  Resend code
                </button>
                <button
                  type="button"
                  className="auth-text-button"
                  onClick={() => navigate('start')}
                >
                  Change email
                </button>
              </form>
            )}
            {(step === 'password' || step === 'demo') && (
              <form
                className="form"
                onSubmit={
                  step === 'demo'
                    ? demo
                    : (event) => {
                        event.preventDefault();
                        setNotice(
                          'Password authentication is not connected for church accounts. No sign-in has occurred.',
                        );
                      }
                }
              >
                {step === 'demo' ? (
                  <label>
                    Demo role
                    <select
                      value={role}
                      onChange={(event) =>
                        setRole(event.target.value as typeof role)
                      }
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      <option value="pastor">Pastor</option>
                    </select>
                  </label>
                ) : (
                  <label>
                    Email
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </label>
                )}
                <label htmlFor="auth-password">Password</label>
                <div className="password">
                  <input
                    id="auth-password"
                    name="password"
                    type={show ? 'text' : 'password'}
                    autoComplete="current-password"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow((value) => !value)}
                  >
                    {show ? 'Hide' : 'Show'}
                  </button>
                </div>
                <button className="button" disabled={pending}>
                  {pending
                    ? 'Signing in…'
                    : step === 'demo'
                      ? 'Enter demo workspace'
                      : 'Sign in with password'}
                </button>
                <Link href="/forgot-password">Forgot password?</Link>
              </form>
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
          </div>
          <p>
            {login ? "Don't have an account? " : 'Already have an account? '}
            <Link href={login ? '/signup' : '/login'}>
              {login ? 'Sign up' : 'Sign in'}
            </Link>
          </p>
          <p className="form-note">
            By continuing, you agree to our <Link href="/terms">Terms</Link> and{' '}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
          <p className="form-note">
            Church account services are not connected yet.
          </p>
          {process.env.NODE_ENV !== 'production' && (
            <details className="demo-access">
              <summary>Developer demo access</summary>
              <p>
                Seeded test accounts only. This does not create a church
                account.
              </p>
              <button
                type="button"
                className="button button-outline"
                onClick={() => navigate('demo')}
              >
                Open demo sign-in
              </button>
            </details>
          )}
        </div>
      </section>
    </div>
  );
}
