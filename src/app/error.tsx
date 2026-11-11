"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error reporting service in production
    console.error("[Raabta] Unhandled error:", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#1A1A1A", marginBottom: "0.5rem" }}>
        Something went wrong
      </h1>
      <p style={{ color: "#6B6B6B", marginBottom: "1.5rem", maxWidth: "380px" }}>
        An unexpected error occurred. Please try again or go back to the home page.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={reset}
          style={{
            padding: "0.75rem 1.5rem",
            background: "#8B1A1A",
            color: "#FFF",
            borderRadius: "12px",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        <Link
          href="/"
          style={{
            padding: "0.75rem 1.5rem",
            background: "transparent",
            color: "#1A1A1A",
            borderRadius: "12px",
            fontWeight: 600,
            border: "1.5px solid #C8C0B8",
            textDecoration: "none",
          }}
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

