'use client';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { signIn as passkeySignIn } from 'next-auth/webauthn';
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

const errorMessages: Record<string, string> = {
  Verification: 'That code is wrong or has expired. Request a new code.',
  TooManyAttempts: 'Too many attempts. Request a new code and try again.',
  AccessDenied:
    'This account can’t sign in right now. Contact the church office if you need help.',
  OAuthAccountNotLinked:
    'That email already has an account. Sign in with an email code first.',
};

/** Only same-site paths are accepted as a post-sign-in destination. */
function safeCallback() {
  const next = new URLSearchParams(window.location.search).get('callbackUrl');
  return next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
    ? next
    : '/members';
}

export function AuthForm({
  mode,
  googleEnabled = false,
}: {
  mode: 'login' | 'signup';
  googleEnabled?: boolean;
}) {
  const login = mode === 'login';
  const [step, setStep] = useState<'start' | 'code'>('start');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
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
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('error');
    if (code)
      setError(errorMessages[code] ?? 'Sign-in failed. Please try again.');
    const saved = sessionStorage.getItem('grace-sign-in-email');
    if (code && saved) {
      setEmail(saved);
      if (code === 'Verification') setStep('code');
    }
  }, []);
  function navigate(next: typeof step) {
    setStep(next);
    setNotice('');
    setError('');
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
  async function requestCode(fullName?: string) {
    setPending(true);
    setError('');
    try {
      const address = email.trim().toLowerCase();
      sessionStorage.setItem('grace-sign-in-email', address);
      if (fullName?.trim())
        sessionStorage.setItem('grace-pending-name', fullName.trim());
      const result = await signIn('email-code', {
        email: address,
        redirect: false,
        callbackUrl: safeCallback(),
      });
      if (!result || result.error) {
        setError('We couldn’t send a code. Check the address and try again.');
        return false;
      }
      setCode(['', '', '', '', '', '']);
      setNotice(
        `If ${address} can receive email, a six-digit code is on its way. It expires in 10 minutes.`,
      );
      return true;
    } catch {
      setError('The sign-in service could not be reached. Please try again.');
      return false;
    } finally {
      setPending(false);
    }
  }
  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const params = new URLSearchParams({
      email: email.trim().toLowerCase(),
      token: code.join(''),
      callbackUrl: safeCallback(),
    });
    window.location.assign(`/api/auth/callback/email-code?${params}`);
  }
  async function usePasskey() {
    setError('');
    try {
      await passkeySignIn('passkey', { callbackUrl: safeCallback() });
    } catch {
      setError(
        'No passkey was used. Sign in with an email code, then add a passkey in Settings.',
      );
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
            {step === 'code' ? 'Email verification' : 'Your church community'}
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
              ? `Enter the six-digit code we sent to ${email}.`
              : login
                ? 'Sign in to your church account. No password needed.'
                : 'Create your member account with your email or Google.'}
          </p>
          <div className="auth-card form">
            {step === 'start' && (
              <>
                <form
                  className="form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const name = new FormData(event.currentTarget).get(
                      'fullName',
                    );
                    if (await requestCode(name ? String(name) : undefined))
                      setStep('code');
                  }}
                >
                  {!login && (
                    <label>
                      Full name
                      <input
                        name="fullName"
                        autoComplete="name"
                        required
                        maxLength={80}
                      />
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
                  <button className="button" disabled={pending}>
                    <Mail size={17} />{' '}
                    {pending ? 'Sending code…' : 'Email me a code'}
                  </button>
                </form>
                {(googleEnabled || login) && (
                  <div className="auth-divider">or</div>
                )}
                {googleEnabled && (
                  <button
                    type="button"
                    className="auth-provider"
                    onClick={() => {
                      const name = document.querySelector<HTMLInputElement>(
                        'input[name="fullName"]',
                      )?.value;
                      if (name?.trim())
                        sessionStorage.setItem(
                          'grace-pending-name',
                          name.trim(),
                        );
                      void signIn('google', { callbackUrl: safeCallback() });
                    }}
                  >
                    <GoogleMark /> Continue with Google
                  </button>
                )}
                {login && (
                  <>
                    <button
                      type="button"
                      className="auth-provider"
                      onClick={usePasskey}
                    >
                      <KeyRound size={19} /> Sign in with a passkey
                    </button>
                    <p className="form-note">
                      Passkeys use your phone or computer’s screen lock. Add one
                      in Settings after you sign in.
                    </p>
                  </>
                )}
              </>
            )}
            {step === 'code' && (
              <form className="form" onSubmit={verify}>
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
                  disabled={pending || code.some((digit) => !digit)}
                >
                  {pending ? 'Checking…' : 'Verify code'}
                </button>
                <button
                  type="button"
                  className="auth-text-button"
                  disabled={pending}
                  onClick={() => void requestCode()}
                >
                  Send a new code
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
        </div>
      </section>
    </div>
  );
}
