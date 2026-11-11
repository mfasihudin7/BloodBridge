"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/client";

type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";

export default function OnboardingPage() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const { user, profile, refreshProfile } = useAuth();

  const [step, setStep] = useState<number>(1);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");

  // Form states
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | "">((profile?.blood_group as BloodGroup) || "");
  
  // Extended fields (stored gracefully in local storage / user metadata if columns unapplied)
  const [city, setCity] = useState("");
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const bloodGroups: BloodGroup[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

  // Step 1: Language selection
  const handleSelectLanguage = (lang: "en" | "ur") => {
    setLanguage(lang);
    setStep(user ? 3 : 2);
  };

  // Step 2: Auth
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    const supabase = createClient();
    try {
      const normalizedEmail = emailOrPhone.includes("@")
        ? emailOrPhone.trim().toLowerCase()
        : `${emailOrPhone.replace(/\D/g, "")}@phone.bloodbridge.org`;

      if (authMode === "register") {
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim() || undefined,
              blood_group: bloodGroup || undefined,
            },
          },
        });
        if (error) throw error;
        await refreshProfile();
        setStep(3);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;
        await refreshProfile();
        setStep(3);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Authentication error");
    } finally {
      setSubmitting(false);
    }
  };

  // Step 3: Profile attributes
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bloodGroup) {
      setErrorMsg("Please select your blood group.");
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);

    const supabase = createClient();
    try {
      if (user) {
        const { error } = await supabase
          .from("profiles")
          .update({
            full_name: fullName.trim() || "Anonymous Donor",
            blood_group: bloodGroup as BloodGroup,
          })
          .eq("id", user.id);

        if (error) throw error;
        await refreshProfile();
      }
      setStep(4);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSubmitting(false);
    }
  };

  // Step 4: Consent
  const handleConsentSubmit = () => {
    if (!consentAgreed) {
      setErrorMsg("Please agree to the privacy and safety terms to continue.");
      return;
    }
    setStep(5);
  };

  return (
    <div className="page" style={{ maxWidth: "520px", paddingTop: "2rem" }}>
      {/* Step Indicator */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "2rem" }}>
        {[1, 2, 3, 4, 5].map((s) => (
          <div
            key={s}
            style={{
              flex: 1,
              height: "4px",
              borderRadius: "2px",
              background: s <= step ? "var(--primary)" : "var(--border)",
              transition: "background 0.2s ease",
            }}
          />
        ))}
      </div>

      {errorMsg && (
        <div className="alert alert-error" style={{ marginBottom: "1.25rem" }}>
          {errorMsg}
        </div>
      )}

      {/* STEP 1: LANGUAGE */}
      {step === 1 && (
        <div className="card">
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--primary)", marginBottom: "0.5rem" }}>
              {t.onboarding.step_language}
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              {t.onboarding.language_choose}
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <button
              onClick={() => handleSelectLanguage("en")}
              className="btn btn-outline btn-full"
              style={{
                borderColor: language === "en" ? "var(--primary)" : "var(--border)",
                background: language === "en" ? "var(--primary-light)" : "var(--surface)",
                fontWeight: 700,
                padding: "1rem",
              }}
            >
              English
            </button>
            <button
              onClick={() => handleSelectLanguage("ur")}
              className="btn btn-outline btn-full"
              style={{
                borderColor: language === "ur" ? "var(--primary)" : "var(--border)",
                background: language === "ur" ? "var(--primary-light)" : "var(--surface)",
                fontWeight: 700,
                padding: "1rem",
                fontFamily: "var(--font-urdu)",
              }}
            >
              اردو (Urdu)
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: AUTH */}
      {step === 2 && (
        <div className="card">
          <div style={{ marginBottom: "1.25rem" }}>
            <h1 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--primary)" }}>
              {t.onboarding.auth_heading}
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              {t.onboarding.auth_subheading}
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {authMode === "register" && (
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {t.auth.full_name_label}
                </label>
                <input
                  type="text"
                  required
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t.auth.full_name_placeholder}
                />
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {t.auth.phone_label} / Email
              </label>
              <input
                type="text"
                required
                className="input"
                value={emailOrPhone}
                onChange={(e) => setEmailOrPhone(e.target.value)}
                placeholder="user@example.com or 03001234567"
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {t.auth.password_label}
              </label>
              <input
                type="password"
                required
                minLength={6}
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary btn-full"
              style={{ marginTop: "0.5rem" }}
            >
              {submitting ? t.common.loading : authMode === "register" ? t.auth.submit_register : t.auth.submit_login}
            </button>
          </form>

          <div style={{ marginTop: "1rem", textAlign: "center", fontSize: "0.85rem" }}>
            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === "register" ? "login" : "register");
                setErrorMsg(null);
              }}
              className="btn btn-ghost"
              style={{ fontSize: "0.85rem", color: "var(--primary)" }}
            >
              {authMode === "register" ? t.auth.switch_to_login : t.auth.switch_to_register}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: PROFILE ESSENTIALS */}
      {step === 3 && (
        <div className="card">
          <div style={{ marginBottom: "1.25rem" }}>
            <h1 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--primary)" }}>
              {t.onboarding.profile_heading}
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              {t.onboarding.profile_subheading}
            </p>
          </div>

          <form onSubmit={handleProfileSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {t.onboarding.profile_name}
              </label>
              <input
                type="text"
                required
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Muhammad Ali"
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                {t.onboarding.profile_blood_group}
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                {bloodGroups.map((bg) => (
                  <button
                    key={bg}
                    type="button"
                    onClick={() => setBloodGroup(bg)}
                    className="btn btn-sm"
                    style={{
                      background: bloodGroup === bg ? "var(--primary)" : "var(--surface)",
                      color: bloodGroup === bg ? "#FFF" : "var(--text)",
                      border: "1.5px solid",
                      borderColor: bloodGroup === bg ? "var(--primary)" : "var(--border)",
                      fontWeight: 700,
                    }}
                  >
                    {bg}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                City (Optional)
              </label>
              <input
                type="text"
                className="input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Lahore, Karachi, Islamabad"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !bloodGroup}
              className="btn btn-primary btn-full"
              style={{ marginTop: "0.75rem" }}
            >
              {submitting ? t.common.loading : t.common.next}
            </button>
          </form>
        </div>
      )}

      {/* STEP 4: CONSENT */}
      {step === 4 && (
        <div className="card">
          <div style={{ marginBottom: "1.25rem" }}>
            <h1 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--primary)" }}>
              {t.onboarding.consent_heading}
            </h1>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontSize: "0.88rem", color: "var(--text-muted)" }}>
            <div style={{ background: "var(--surface-raised)", padding: "0.85rem", borderRadius: "var(--radius-sm)" }}>
              <strong style={{ color: "var(--text)", display: "block", marginBottom: "4px" }}>
                🛡️ {t.onboarding.consent_stored}
              </strong>
              {t.onboarding.consent_stored_detail}
            </div>

            <div style={{ background: "var(--surface-raised)", padding: "0.85rem", borderRadius: "var(--radius-sm)" }}>
              <strong style={{ color: "var(--text)", display: "block", marginBottom: "4px" }}>
                📍 {t.onboarding.consent_location}
              </strong>
              {t.onboarding.consent_location_detail}
            </div>

            <div style={{ background: "var(--surface-raised)", padding: "0.85rem", borderRadius: "var(--radius-sm)" }}>
              <strong style={{ color: "var(--text)", display: "block", marginBottom: "4px" }}>
                📞 {t.onboarding.consent_contact}
              </strong>
              {t.onboarding.consent_contact_detail}
            </div>

            <div style={{ background: "var(--surface-raised)", padding: "0.85rem", borderRadius: "var(--radius-sm)" }}>
              <strong style={{ color: "var(--text)", display: "block", marginBottom: "4px" }}>
                🗑️ {t.onboarding.consent_deletion}
              </strong>
              {t.onboarding.consent_deletion_detail}
            </div>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginTop: "1.25rem",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            <input
              type="checkbox"
              checked={consentAgreed}
              onChange={(e) => setConsentAgreed(e.target.checked)}
              style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }}
            />
            {t.onboarding.consent_agree}
          </label>

          <button
            onClick={handleConsentSubmit}
            disabled={!consentAgreed}
            className="btn btn-primary btn-full"
            style={{ marginTop: "1.25rem" }}
          >
            {t.common.confirm}
          </button>
        </div>
      )}

      {/* STEP 5: COMPLETE */}
      {step === 5 && (
        <div className="card" style={{ textAlign: "center", padding: "2.5rem 1.5rem" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "#D1FAE5",
              color: "#065F46",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem",
              fontSize: "2rem",
            }}
          >
            ✓
          </div>

          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)", marginBottom: "0.5rem" }}>
            {t.onboarding.complete_heading}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.75rem" }}>
            {t.onboarding.complete_subheading}
          </p>

          <button
            onClick={() => router.push("/")}
            className="btn btn-primary btn-full"
          >
            {t.onboarding.complete_cta}
          </button>
        </div>
      )}
    </div>
  );
}

