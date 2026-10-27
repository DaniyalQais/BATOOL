import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="help-page">
      <p className="eyebrow">404</p>
      <h1>A little lost?</h1>
      <p>This page isn’t part of the collection.</p>
      <Link className="button" href="/">
        Return to BATOOL →
      </Link>
    </main>
  );
}
