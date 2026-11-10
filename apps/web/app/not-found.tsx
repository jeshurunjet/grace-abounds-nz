import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="state-page">
      <p className="eyebrow">404</p>
      <h1>We couldn’t find that page.</h1>
      <p>The page may have moved, or the content may not be published yet.</p>
      <Link className="button" href="/">
        Return home
      </Link>
    </main>
  );
}
