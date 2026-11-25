import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="state-page">
      <p className="eyebrow">Not found</p>
      <h1>This page isn’t here.</h1>
      <p>The product may have moved or is no longer available.</p>
      <Link className="button button-dark" href="/products">
        Return to the collection
      </Link>
    </main>
  );
}
