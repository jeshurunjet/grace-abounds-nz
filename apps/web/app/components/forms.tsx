'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
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
export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const [sent, setSent] = useState(false);
  const [show, setShow] = useState(false);
  const login = mode === 'login';
  function submit(e: FormEvent) {
    e.preventDefault();
    setSent(true);
  }
  return (
    <div className="auth-page">
      <aside>
        <Logo light />
        <blockquote>“His grace is sufficient for every season.”</blockquote>
        <p>2 Corinthians 12:9</p>
      </aside>
      <section>
        <div className="auth-wrap">
          <Logo />
          <h1>{login ? 'Welcome Back' : 'Join Us'}</h1>
          <p>{login ? 'Sign in to your account' : 'Create your account'}</p>
          <form className="form auth-card" onSubmit={submit}>
            {!login && (
              <>
                <label htmlFor="full-name">Full name</label>
                <input id="full-name" autoComplete="name" required />
              </>
            )}
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required />
            <label htmlFor="password">Password</label>
            <div className="password">
              <input
                id="password"
                type={show ? 'text' : 'password'}
                minLength={8}
                autoComplete={login ? 'current-password' : 'new-password'}
                required
              />
              <button type="button" onClick={() => setShow(!show)}>
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
            <button className="button" type="submit">
              {login ? 'Sign In' : 'Create Account'}
            </button>
            {sent && (
              <p className="form-note" role="status">
                This is a development preview. No{' '}
                {login ? 'sign-in occurred' : 'account was created'} and no
                details were saved.
              </p>
            )}
          </form>
          <p>
            {login ? "Don't have an account? " : 'Already have an account? '}
            <Link href={login ? '/signup' : '/login'}>
              {login ? 'Sign up' : 'Sign in'}
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
