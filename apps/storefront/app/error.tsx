'use client';

export default function StorefrontError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="state-page">
      <p className="eyebrow">A moment, please</p>
      <h1>We couldn’t load the storefront.</h1>
      <p>Check that the Commerce API is running, then try again.</p>
      <button className="button button-dark" onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
