"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { AuthModal } from "@/components/auth/AuthModal";
import { BRAND } from "@/lib/brand";

/** Lucide-compatible inline SVG icons — no dependency on npm package */
function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}
function ActivityIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}
function DropletIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2C12 2 5 10.5 5 15.5a7 7 0 0 0 14 0C19 10.5 12 2 12 2Z"/>
    </svg>
  );
}

export function Navbar() {
  const { t, language, toggleLanguage, direction } = useLanguage();
  const { user, profile, signOut } = useAuth();
  const pathname = usePathname();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const isRTL = direction === "rtl";

  const openAuth = (mode: "login" | "register") => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const navLinkStyle = (href: string): React.CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "3px",
    fontSize: "0.7rem",
    fontWeight: 600,
    letterSpacing: "0.02em",
    color: isActive(href) ? "var(--primary)" : "var(--text-muted)",
    textDecoration: "none",
    minWidth: "56px",
    paddingTop: "6px",
    paddingBottom: "6px",
    transition: "color 0.15s ease",
    borderTop: isActive(href) ? "2px solid var(--primary)" : "2px solid transparent",
  });

  return (
    <>
      {/* ---- Top header (desktop & mobile) ---- */}
      <header
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          zIndex: 100,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          style={{
            maxWidth: "1120px",
            margin: "0 auto",
            padding: "0 1rem",
            height: "56px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexDirection: isRTL ? "row-reverse" : "row",
          }}
        >
          {/* Logo */}
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              textDecoration: "none",
            }}
          >
            <span
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFF",
                flexShrink: 0,
              }}
            >
              <DropletIcon size={16} />
            </span>
            <span
              style={{
                fontSize: "1.2rem",
                fontWeight: 800,
                color: "var(--primary)",
                letterSpacing: "-0.02em",
                fontFamily: isRTL ? "var(--font-urdu)" : "var(--font-sans)",
              }}
            >
              {isRTL ? BRAND.nameUrdu : BRAND.name}
            </span>
          </Link>

          {/* Desktop nav links */}
          <nav
            className="desktop-only"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1.5rem",
              flexDirection: isRTL ? "row-reverse" : "row",
            }}
          >
            {[
              { href: "/", label: t.nav.home },
              { href: "/requests/new", label: t.nav.request, red: true },
              { href: "/activity", label: t.nav.activity },
              { href: "/thalassemia", label: t.nav.thalassemia },
              { href: "/map", label: t.nav.map },
              { href: "/profile", label: t.nav.profile },
            ].map(({ href, label, red }) => (
              <Link
                key={href}
                href={href}
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: isActive(href)
                    ? "var(--primary)"
                    : red
                    ? "var(--emergency)"
                    : "var(--text-muted)",
                  textDecoration: "none",
                  paddingBottom: "2px",
                  borderBottom: isActive(href)
                    ? "2px solid var(--primary)"
                    : "2px solid transparent",
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {label}
              </Link>
            ))}
            {profile?.is_admin && (
              <Link
                href="/admin"
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  color: "var(--emergency)",
                  textDecoration: "none",
                }}
              >
                Admin
              </Link>
            )}
          </nav>

          {/* Right: language toggle + auth */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexDirection: isRTL ? "row-reverse" : "row",
            }}
          >
            <button
              onClick={toggleLanguage}
              className="btn btn-ghost btn-sm"
              title="Toggle language / زبان تبدیل کریں"
              style={{ fontSize: "0.8rem", fontWeight: 700, minHeight: "36px" }}
            >
              {language === "en" ? "اردو" : "English"}
            </button>

            {user ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  className="desktop-only"
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text-muted)",
                    maxWidth: "120px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {profile?.full_name || user.email?.split("@")[0]}
                </span>
                <button
                  onClick={() => signOut()}
                  className="btn btn-outline btn-sm desktop-only"
                >
                  {t.nav.logout}
                </button>
              </div>
            ) : (
              <div
                className="desktop-only"
                style={{ display: "flex", gap: "0.5rem" }}
              >
                <button
                  onClick={() => openAuth("login")}
                  className="btn btn-outline btn-sm"
                >
                  {t.nav.login}
                </button>
                <button
                  onClick={() => openAuth("register")}
                  className="btn btn-primary btn-sm"
                >
                  {t.nav.register}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ---- Mobile bottom nav (3 items) ---- */}
      <nav
        className="mobile-only"
        aria-label="Main navigation"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-around",
          zIndex: 99,
          boxShadow: "0 -2px 10px rgba(0,0,0,0.06)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <Link href="/" style={navLinkStyle("/")}>
          <HomeIcon />
          <span>{t.nav.home}</span>
        </Link>
        <Link href="/activity" style={navLinkStyle("/activity")}>
          <ActivityIcon />
          <span>{t.nav.activity}</span>
        </Link>
        <Link href="/profile" style={navLinkStyle("/profile")}>
          <UserIcon />
          <span>{t.nav.profile}</span>
        </Link>
      </nav>

      {/* Auth modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultMode={authMode}
      />
    </>
  );
}
