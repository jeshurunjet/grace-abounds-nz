'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="state-page">
      <p className="eyebrow">Something went wrong</p>
      <h1>This page needs another moment.</h1>
      <p>Please try again. No information has been lost.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
