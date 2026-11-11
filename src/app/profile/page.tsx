"use client";

import React, { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const { t } = useLanguage();
  const { user, profile, refreshProfile, loading } = useAuth();
  const [updating, setUpdating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [bloodGroup, setBloodGroup] = useState<string>(profile?.blood_group || "");

  if (loading) {
    return (
      <div style={{ maxWidth: "800px", margin: "2rem auto", padding: "1rem", textAlign: "center" }}>
        {t.common.loading}
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ maxWidth: "600px", margin: "3rem auto", padding: "2rem", textAlign: "center" }} className="card">
        <h2 style={{ color: "var(--primary-burgundy)", marginBottom: "1rem" }}>{t.auth.sign_in}</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
          Please sign in to manage your donor availability and settings.
        </p>
      </div>
    );
  }

  // Prerequisites check
  const hasLocation = Boolean(profile?.donation_location && profile?.location_consent);
  const hasBloodGroup = Boolean(profile?.blood_group);
  const hasNotifications = Boolean(profile?.in_app_request_notifications_enabled);
  const canBeAvailable = hasLocation && hasBloodGroup && hasNotifications;

  const handleUpdateLocation = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!navigator.geolocation) {
      setErrorMsg("Geolocation is not supported by your browser.");
      return;
    }

    setUpdating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const res = await api.setLocation(latitude, longitude, true);
        if (res.ok) {
          setSuccessMsg("Location updated successfully with consent!");
          await refreshProfile();
        } else {
          setErrorMsg(res.message);
        }
        setUpdating(false);
      },
      (err) => {
        setErrorMsg(`Location permission denied or unavailable: ${err.message}`);
        setUpdating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleClearLocation = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setUpdating(true);
    const res = await api.clearLocation();
    if (res.ok) {
      setSuccessMsg("Location cleared and availability turned OFF.");
      await refreshProfile();
    } else {
      setErrorMsg(res.message);
    }
    setUpdating(false);
  };

  const handleToggleNotifications = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setUpdating(true);
    const nextState = !profile?.in_app_request_notifications_enabled;
    const res = await api.setNotificationPreference(nextState);
    if (res.ok) {
      setSuccessMsg(`Notifications ${nextState ? "enabled" : "disabled"}.`);
      await refreshProfile();
    } else {
      setErrorMsg(res.message);
    }
    setUpdating(false);
  };

  const handleSaveBloodGroup = async () => {
    if (!bloodGroup) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setUpdating(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ blood_group: bloodGroup as "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" })
      .eq("id", user.id);

    if (error) {
      setErrorMsg(error.message);
    } else {
      setSuccessMsg("Blood group saved successfully!");
      await refreshProfile();
    }
    setUpdating(false);
  };

  const handleToggleAvailability = async (targetState: boolean) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (targetState && !canBeAvailable) {
      setErrorMsg("Please satisfy all 3 prerequisites before turning availability ON.");
      return;
    }

    setUpdating(true);
    const res = await api.setAvailability(targetState);
    if (res.ok) {
      setSuccessMsg(`Donor availability is now ${targetState ? "ON" : "OFF"}!`);
      await refreshProfile();
    } else {
      setErrorMsg(res.message);
    }
    setUpdating(false);
  };

  return (
    <div style={{ maxWidth: "800px", margin: "1.5rem auto", padding: "0 1rem" }}>
      <h1 style={{ color: "var(--primary-burgundy)", marginBottom: "0.5rem", fontSize: "1.75rem" }}>
        {t.donor.title}
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        {user.email || profile?.phone}
      </p>

      {errorMsg && (
        <div
          style={{
            background: "#FEE2E2",
            border: "1px solid #FCA5A5",
            color: "#991B1B",
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            marginBottom: "1rem",
          }}
        >
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div
          style={{
            background: "#DCFCE7",
            border: "1px solid #86EFAC",
            color: "#166534",
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            marginBottom: "1rem",
          }}
        >
          {successMsg}
        </div>
      )}

      {/* Primary Availability Status Card */}
      <div className="card" style={{ marginBottom: "1.5rem", borderLeft: `6px solid ${profile?.is_available ? "var(--success-green)" : "var(--border-medium)"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h3 style={{ fontSize: "1.1rem", marginBottom: "0.25rem" }}>{t.donor.availability_status}</h3>
            <span
              style={{
                display: "inline-block",
                padding: "0.35rem 0.85rem",
                borderRadius: "2rem",
                fontWeight: 700,
                fontSize: "0.9rem",
                background: profile?.is_available ? "#DCFCE7" : "#F1F5F9",
                color: profile?.is_available ? "#166534" : "#475569",
              }}
            >
              {profile?.is_available ? t.roles.availability_on : t.roles.availability_off}
            </span>
          </div>

          <div>
            {profile?.is_available ? (
              <button
                onClick={() => handleToggleAvailability(false)}
                disabled={updating}
                className="btn btn-outline"
                style={{ borderColor: "var(--emergency-red)", color: "var(--emergency-red)" }}
              >
                {t.donor.turn_off}
              </button>
            ) : (
              <button
                onClick={() => handleToggleAvailability(true)}
                disabled={updating}
                className="btn btn-primary"
              >
                {t.donor.turn_on}
              </button>
            )}
          </div>
        </div>

        {/* Prerequisites Checklist */}
        {!profile?.is_available && (
          <div style={{ marginTop: "1.25rem", padding: "1rem", background: "var(--bg-subtle)", borderRadius: "0.5rem" }}>
            <h4 style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
              {t.donor.prereq_missing}
            </h4>
            <ul style={{ listStyle: "none", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <li style={{ color: hasBloodGroup ? "var(--success-green)" : "var(--emergency-red)" }}>
                {hasBloodGroup ? "✓" : "✗"} {t.donor.prereq_blood_group} ({profile?.blood_group || "Not set"})
              </li>
              <li style={{ color: hasLocation ? "var(--success-green)" : "var(--emergency-red)" }}>
                {hasLocation ? "✓" : "✗"} {t.donor.prereq_location} ({hasLocation ? t.donor.location_set : t.donor.location_none})
              </li>
              <li style={{ color: hasNotifications ? "var(--success-green)" : "var(--emergency-red)" }}>
                {hasNotifications ? "✓" : "✗"} {t.donor.prereq_notifications} ({hasNotifications ? t.donor.notifications_enabled : t.donor.notifications_disabled})
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* Settings Sections */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem", marginBottom: "1.5rem" }}>
        {/* Blood Group Selector */}
        <div className="card">
          <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem", color: "var(--primary-burgundy)" }}>
            🩸 {t.auth.blood_group_label}
          </h3>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <select
              value={bloodGroup || profile?.blood_group || ""}
              onChange={(e) => setBloodGroup(e.target.value)}
              style={{
                flex: 1,
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
            <button
              onClick={handleSaveBloodGroup}
              disabled={updating || !bloodGroup}
              className="btn btn-secondary"
            >
              {t.common.save}
            </button>
          </div>
        </div>

        {/* Location & Consent */}
        <div className="card">
          <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem", color: "var(--primary-burgundy)" }}>
            📍 {t.donor.location_status}
          </h3>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
            {t.donor.location_consent_note}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              onClick={handleUpdateLocation}
              disabled={updating}
              className="btn btn-outline"
              style={{ fontSize: "0.85rem" }}
            >
              {t.donor.update_location}
            </button>
            {hasLocation && (
              <button
                onClick={handleClearLocation}
                disabled={updating}
                className="btn btn-outline"
                style={{ fontSize: "0.85rem", color: "var(--emergency-red)" }}
              >
                {t.donor.clear_location}
              </button>
            )}
          </div>
        </div>

        {/* Notifications Preference */}
        <div className="card">
          <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem", color: "var(--primary-burgundy)" }}>
            🔔 {t.donor.notifications_pref}
          </h3>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
            Receive in-app alerts when an urgent emergency matching your blood group occurs nearby.
          </p>
          <button
            onClick={handleToggleNotifications}
            disabled={updating}
            className={`btn ${profile?.in_app_request_notifications_enabled ? "btn-secondary" : "btn-primary"}`}
            style={{ fontSize: "0.85rem" }}
          >
            {profile?.in_app_request_notifications_enabled ? "Disable In-App Alerts" : "Enable In-App Alerts"}
          </button>
        </div>

        {/* Statistics Card */}
        <div className="card">
          <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem", color: "var(--primary-burgundy)" }}>
            📊 {t.donor.stats_title}
          </h3>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border-light)" }}>
            <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>{t.donor.confirmed_donations}</span>
            <strong style={{ fontSize: "1.1rem", color: "var(--primary-burgundy)" }}>{profile?.donation_count || 0}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0" }}>
            <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>{t.donor.last_donated}</span>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {profile?.last_donated ? new Date(profile.last_donated).toLocaleDateString() : t.donor.never_donated}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

