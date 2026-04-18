"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "JetBrains Mono",
        padding: "20px",
        textAlign: "center",
      }}
    >
      <h1 style={{ color: "var(--ore)", fontSize: "1.5rem", marginBottom: "8px" }}>
        ⚠️ Something went wrong
      </h1>
      <p style={{ color: "var(--text2)", fontSize: "0.85rem", marginBottom: "16px" }}>
        {error.message || "An unexpected error occurred"}
      </p>
      <button
        onClick={() => reset()}
        style={{
          padding: "8px 16px",
          background: "var(--acid)",
          color: "var(--bg)",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontFamily: "JetBrains Mono",
          fontSize: "0.75rem",
          fontWeight: 700,
        }}
      >
        Try Again
      </button>
    </div>
  );
}
