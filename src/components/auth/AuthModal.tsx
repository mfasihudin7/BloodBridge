"use client";

import React, { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { createClient } from "@/lib/supabase/client";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: "login" | "register";
}

export function AuthModal({ isOpen, onClose, defaultMode = "login" }: AuthModalProps) {
  const { t } = useLanguage();
  const { refreshProfile } = useAuth();
  const [isRegister, setIsRegister] = useState(defaultMode === "register");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [bloodGroup, setBloodGroup] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    const supabase = createClient();
    try {
      // Normalize email or synthetic email from phone
      const normalizedEmail = emailOrPhone.includes("@")
        ? emailOrPhone.trim().toLowerCase()
        : `${emailOrPhone.replace(/\D/g, "")}@phone.bloodbridge.org`;

      if (isRegister) {
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

        if (error) {
          setErrorMsg(error.message);
          return;
        }

        await refreshProfile();
        onClose();
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error) {
          setErrorMsg(error.message);
          return;
        }

        await refreshProfile();
        onClose();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "1.25rem", color: "var(--primary-burgundy)" }}>
            {isRegister ? t.auth.create_account : t.auth.sign_in}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.5rem",
              cursor: "pointer",
              color: "var(--text-muted)",
            }}
          >
            ×
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              background: "#FEE2E2",
              border: "1px solid #FCA5A5",
              color: "#991B1B",
              padding: "0.6rem 0.8rem",
              borderRadius: "0.375rem",
              fontSize: "0.85rem",
              marginBottom: "1rem",
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {isRegister && (
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {t.auth.full_name_label}
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t.auth.full_name_placeholder}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  borderRadius: "0.375rem",
                  border: "1px solid var(--border-medium)",
                  fontSize: "0.95rem",
                }}
              />
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
              Email or {t.auth.phone_label}
            </label>
            <input
              type="text"
              required
              value={emailOrPhone}
              onChange={(e) => setEmailOrPhone(e.target.value)}
              placeholder="user@example.com or 03001234567"
              style={{
                width: "100%",
                padding: "0.6rem 0.8rem",
                borderRadius: "0.375rem",
                border: "1px solid var(--border-medium)",
                fontSize: "0.95rem",
              }}
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.auth.password_placeholder}
              style={{
                width: "100%",
                padding: "0.6rem 0.8rem",
                borderRadius: "0.375rem",
                border: "1px solid var(--border-medium)",
                fontSize: "0.95rem",
              }}
            />
          </div>

          {isRegister && (
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {t.auth.blood_group_label}
              </label>
              <select
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.8rem",
                  borderRadius: "0.375rem",
                  border: "1px solid var(--border-medium)",
                  fontSize: "0.95rem",
                  background: "#FFF",
                }}
              >
                <option value="">{t.auth.select_blood_group}</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: "100%", marginTop: "0.5rem" }}
          >
            {loading ? t.common.loading : isRegister ? t.auth.submit_register : t.auth.submit_login}
          </button>
        </form>

        <div style={{ marginTop: "1.25rem", textAlign: "center", fontSize: "0.85rem" }}>
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setErrorMsg(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--primary-burgundy)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {isRegister ? t.auth.switch_to_login : t.auth.switch_to_register}
          </button>
        </div>
      </div>
    </div>
  );
}

