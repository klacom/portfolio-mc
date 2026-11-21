import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: "24px 16px", background: "linear-gradient(#0c0e16, #05060a)", color: "#f2f3fb" }}>
      <div
        style={{
          maxWidth: 520,
          padding: "32px",
          display: "grid",
          gap: 16,
          background: "rgb(22 24 34)",
          boxShadow: "0 -4px 0 0 #1a1622, 0 4px 0 0 #1a1622, -4px 0 0 0 #1a1622, 4px 0 0 0 #1a1622",
        }}
      >
        <h1 style={{ fontSize: "2.5rem" }}>Nothing here</h1>
        <p>This page doesn&apos;t exist. The link may be old, or the project was renamed.</p>
        <p>
          <Link href="/" className="pixel-button" data-variant="primary">
            Back to the portfolio
          </Link>
        </p>
      </div>
    </main>
  );
}
