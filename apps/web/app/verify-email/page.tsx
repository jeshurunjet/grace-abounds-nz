import Link from 'next/link';
export default function VerifyEmailPage() {
  return (
    <main className="auth-simple">
      <div>
        <p className="eyebrow">Email verification</p>
        <h1>Check your email</h1>
        <p>
          We sent a six-digit sign-in code. Enter it on the sign-in page within
          10 minutes. If it doesn’t arrive, check your spam folder or request a
          new code.
        </p>
        <Link className="button" href="/login">
          Enter your code
        </Link>
      </div>
    </main>
  );
}
