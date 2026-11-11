"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { AuthModal } from "@/components/auth/AuthModal";

function HeartIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  );
}

function DropIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2C12 2 5 10.5 5 15.5a7 7 0 0 0 14 0C19 10.5 12 2 12 2Z"/>
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}

function AlertTriangleIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { direction } = useLanguage();
  const { user } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [showReceiveModal, setShowReceiveModal] = useState(false);

  const isRTL = direction === "rtl";
  const ArrowIcon = isRTL ? ArrowLeftIcon : ArrowRightIcon;

  const handleDonateClick = () => {
    if (!user) {
      setAuthMode("register");
      setAuthModalOpen(true);
      return;
    }
    router.push("/profile");
  };

  const handleReceiveClick = () => {
    if (!user) {
      setAuthMode("register");
      setAuthModalOpen(true);
      return;
    }
    setShowReceiveModal(true);
  };

  return (
    <div
      style={{
        minHeight: "calc(100vh - 120px)",
        maxWidth: "460px",
        margin: "0 auto",
        padding: "1.25rem 1rem",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {/* App Header Branding Badge */}
      <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.35rem 0.85rem",
            background: "#FFF5F5",
            border: "1px solid #F5D5D5",
            borderRadius: "2rem",
            fontSize: "0.8rem",
            fontWeight: 700,
            color: "var(--primary)",
          }}
        >
          <span>🩸</span>
          <span>{isRTL ? "فوری ایمرجنسی بلڈ نیٹ ورک" : "Emergency Blood Network"}</span>
        </div>
      </div>

      {/* Screen 4: Two Large Hero Action Cards (inDrive App-Style) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", flex: 1, justifyContent: "center" }}>
        
        {/* CARD 1: DONATE BLOOD */}
        <button
          onClick={handleDonateClick}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.75rem 1.5rem",
            background: "var(--primary)",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "1.25rem",
            boxShadow: "0 8px 24px rgba(139, 26, 26, 0.25)",
            cursor: "pointer",
            textAlign: isRTL ? "right" : "left",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
            position: "relative",
            overflow: "hidden",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flex: 1 }}>
            <div
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                background: "rgba(255, 255, 255, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <HeartIcon />
            </div>
            <div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
                {isRTL ? "خون کا عطیہ دیں" : "DONATE BLOOD"}
              </div>
              <div style={{ fontSize: "0.92rem", opacity: 0.9, marginTop: "4px" }}>
                {isRTL ? "کسی کی امید بنیں" : "Become someone's hope."}
              </div>
            </div>
          </div>
          <div style={{ opacity: 0.85, paddingInlineStart: "0.75rem" }}>
            <ArrowIcon />
          </div>
        </button>

        {/* CARD 2: RECEIVE BLOOD */}
        <button
          onClick={handleReceiveClick}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.75rem 1.5rem",
            background: "var(--surface)",
            color: "var(--text)",
            border: "2.5px solid var(--emergency)",
            borderRadius: "1.25rem",
            boxShadow: "0 6px 20px rgba(192, 57, 43, 0.12)",
            cursor: "pointer",
            textAlign: isRTL ? "right" : "left",
            transition: "transform 0.15s ease, background 0.15s ease",
            position: "relative",
            overflow: "hidden",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flex: 1 }}>
            <div
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                background: "#FEE2E2",
                color: "var(--emergency)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <DropIcon />
            </div>
            <div>
              <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--emergency)", letterSpacing: "-0.01em", lineHeight: 1.2 }}>
                {isRTL ? "خون حاصل کریں" : "RECEIVE BLOOD"}
              </div>
              <div style={{ fontSize: "0.92rem", color: "var(--text-muted)", marginTop: "4px" }}>
                {isRTL ? "فوری ضرورت میں مدد تلاش کریں" : "Find blood when it matters."}
              </div>
            </div>
          </div>
          <div style={{ color: "var(--emergency)", opacity: 0.85, paddingInlineStart: "0.75rem" }}>
            <ArrowIcon />
          </div>
        </button>
      </div>

      {/* Trust & Volunteer Verification Footer */}
      <div style={{ textAlign: "center", marginTop: "2rem", padding: "0 1rem" }}>
        <p style={{ fontSize: "0.78rem", color: "var(--text-light)", lineHeight: 1.5 }}>
          🛡️ {isRTL
            ? "100% رضاکار نیٹ ورک • قطعی لوکیشن کبھی پبلک نہیں کی جاتی"
            : "100% Volunteer Network • Exact location is never shown publicly"}
        </p>
      </div>

      {/* Screen 6: RECEIVE BLOOD SUB-SELECTION MODAL */}
      {showReceiveModal && (
        <div className="modal-overlay" onClick={() => setShowReceiveModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--emergency)" }}>
                {isRTL ? "خون کی ضرورت کا انتخاب کریں" : "Select Requirement Type"}
              </h2>
              <button
                onClick={() => setShowReceiveModal(false)}
                style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text-muted)" }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Option 1: EMERGENCY BLOOD */}
              <button
                onClick={() => {
                  setShowReceiveModal(false);
                  router.push("/requests/new");
                }}
                className="card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  padding: "1.25rem",
                  border: "2px solid var(--emergency)",
                  background: "#FFF5F5",
                  textAlign: isRTL ? "right" : "left",
                  cursor: "pointer",
                }}
              >
                <div style={{ color: "var(--emergency)", flexShrink: 0 }}>
                  <AlertTriangleIcon />
                </div>
                <div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--emergency)" }}>
                    {isRTL ? "ہنگامی خون (Emergency)" : "1. EMERGENCY BLOOD"}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "2px" }}>
                    {isRTL ? "فوری خون درکار ہے؟ قریبی ڈونرز کو الرٹ بھیجیں" : "Need blood urgently? Broadcast alert nearby."}
                  </div>
                </div>
              </button>

              {/* Option 2: THALASSEMIA SUPPORT */}
              <button
                onClick={() => {
                  setShowReceiveModal(false);
                  router.push("/thalassemia");
                }}
                className="card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  padding: "1.25rem",
                  border: "1.5px solid var(--border-strong)",
                  textAlign: isRTL ? "right" : "left",
                  cursor: "pointer",
                }}
              >
                <div style={{ color: "var(--primary)", flexShrink: 0 }}>
                  <CalendarIcon />
                </div>
                <div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--primary)" }}>
                    {isRTL ? "تھیلیسیمیا سپورٹ (Thalassemia)" : "2. THALASSEMIA SUPPORT"}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "2px" }}>
                    {isRTL ? "مستقل ٹرانسفیوژن کا شیڈول اور ڈونر سرکل" : "Plan regular blood transfusions in advance."}
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultMode={authMode}
      />
    </div>
  );
}
