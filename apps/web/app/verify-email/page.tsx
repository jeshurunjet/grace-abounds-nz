import Link from 'next/link';
export default function VerifyEmailPage() {
  return (
    <main className="auth-simple">
      <div>
        <p className="eyebrow">Email verification</p>
        <h1>Verify your email</h1>
        <p>
          Start with your email address to view the six-digit verification
          screen. Email delivery and code verification are not connected yet; no
          code has been sent.
        </p>
        <Link className="button" href="/signup">
          Continue with email
        </Link>
      </div>
    </main>
  );
}
