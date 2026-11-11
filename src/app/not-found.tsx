import Link from "next/link";

export default function NotFound() {
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
      <div
        style={{
          width: "80px",
          height: "80px",
          borderRadius: "50%",
          background: "#FFF5F5",
          border: "2px solid #F5D5D5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "1.5rem",
          fontSize: "2rem",
        }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="#8B1A1A" stroke="none">
          <path d="M12 2C12 2 5 10.5 5 15.5a7 7 0 0 0 14 0C19 10.5 12 2 12 2Z"/>
        </svg>
      </div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1A1A1A", marginBottom: "0.5rem" }}>
        Page not found
      </h1>
      <p style={{ color: "#6B6B6B", marginBottom: "1.5rem", maxWidth: "340px" }}>
        The page you are looking for does not exist. If you followed a link, it may have moved.
      </p>
      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.75rem 1.5rem",
          background: "#8B1A1A",
          color: "#FFF",
          borderRadius: "12px",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Go home
      </Link>
    </div>
  );
}

