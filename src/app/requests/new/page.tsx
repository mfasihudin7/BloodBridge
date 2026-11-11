"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { api } from "@/lib/api";

function AlertTriangleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

function NavigationIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 11 22 2 13 21 11 13 3 11"/>
    </svg>
  );
}

export default function NewRequestPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { user, loading } = useAuth();

  const [bloodGroup, setBloodGroup] = useState<string>("A+");
  const [units, setUnits] = useState<number>(1);
  const [hospital, setHospital] = useState<string>("");
  const [urgency, setUrgency] = useState<"critical" | "urgent" | "planned">("urgent");
  const [lat, setLat] = useState<number>(31.5204); // Default to centroid
  const [lng, setLng] = useState<number>(74.3587);
  const [requiredDonors, setRequiredDonors] = useState<number>(1);
  const [notes, setNotes] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [detectingLoc, setDetectingLoc] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

  if (loading) {
    return <div className="page" style={{ textAlign: "center", padding: "3rem" }}>{t.common.loading}</div>;
  }

  if (!user) {
    return (
      <div className="page" style={{ maxWidth: "540px", paddingTop: "3rem" }}>
        <div className="card" style={{ textAlign: "center" }}>
          <h2 style={{ color: "var(--primary)", marginBottom: "0.75rem" }}>{t.auth.sign_in}</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            Please sign in to broadcast an emergency or planned blood request.
          </p>
          <button onClick={() => router.push("/onboarding")} className="btn btn-primary">
            {t.auth.sign_in} / {t.auth.create_account}
          </button>
        </div>
      </div>
    );
  }

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setErrorMsg("Geolocation is not supported by your browser.");
      return;
    }
    setDetectingLoc(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Number(pos.coords.latitude.toFixed(6)));
        setLng(Number(pos.coords.longitude.toFixed(6)));
        setDetectingLoc(false);
      },
      (err) => {
        setErrorMsg(`Unable to get location: ${err.message}`);
        setDetectingLoc(false);
      },
      { timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospital.trim()) {
      setErrorMsg("Please provide the hospital or medical facility name.");
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await api.createRequest({
        blood_group: bloodGroup,
        units,
        hospital: hospital.trim(),
        urgency,
        location: { lat, lng },
        required_donors: requiredDonors,
        note: notes.trim() || undefined,
      });

      if (!res.ok) {
        setErrorMsg(res.message);
        setSubmitting(false);
        return;
      }

      router.push(`/requests/${res.data.id}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create request");
      setSubmitting(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: "620px" }}>
      <div className="card" style={{ borderTop: "4px solid var(--emergency)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", color: "var(--emergency)" }}>
          <AlertTriangleIcon />
          <h1 style={{ fontSize: "1.35rem", fontWeight: 800 }}>
            {t.request.title}
          </h1>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
          {t.request.subtitle}
        </p>

        {errorMsg && (
          <div className="alert alert-error" style={{ marginBottom: "1.25rem" }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Blood group selection grid */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              {t.request.blood_group}
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

          {/* Urgency selection */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              {t.request.urgency}
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setUrgency("critical")}
                className="btn btn-sm"
                style={{
                  background: urgency === "critical" ? "var(--emergency)" : "var(--surface)",
                  color: urgency === "critical" ? "#FFF" : "var(--text)",
                  border: "1.5px solid",
                  borderColor: urgency === "critical" ? "var(--emergency)" : "var(--border)",
                  fontSize: "0.8rem",
                  padding: "0.5rem 0.25rem",
                }}
              >
                {t.request.urgency_critical}
              </button>
              <button
                type="button"
                onClick={() => setUrgency("urgent")}
                className="btn btn-sm"
                style={{
                  background: urgency === "urgent" ? "var(--warning)" : "var(--surface)",
                  color: urgency === "urgent" ? "#FFF" : "var(--text)",
                  border: "1.5px solid",
                  borderColor: urgency === "urgent" ? "var(--warning)" : "var(--border)",
                  fontSize: "0.8rem",
                  padding: "0.5rem 0.25rem",
                }}
              >
                {t.request.urgency_urgent}
              </button>
              <button
                type="button"
                onClick={() => setUrgency("planned")}
                className="btn btn-sm"
                style={{
                  background: urgency === "planned" ? "var(--primary)" : "var(--surface)",
                  color: urgency === "planned" ? "#FFF" : "var(--text)",
                  border: "1.5px solid",
                  borderColor: urgency === "planned" ? "var(--primary)" : "var(--border)",
                  fontSize: "0.8rem",
                  padding: "0.5rem 0.25rem",
                }}
              >
                {t.request.urgency_planned}
              </button>
            </div>
          </div>

          {/* Units & Target Donors */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                {t.request.units}
              </label>
              <input
                type="number"
                min={1}
                max={10}
                required
                className="input"
                value={units}
                onChange={(e) => setUnits(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                {t.request.required_donors}
              </label>
              <input
                type="number"
                min={1}
                max={5}
                required
                className="input"
                value={requiredDonors}
                onChange={(e) => setRequiredDonors(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
          </div>

          {/* Hospital Name */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.35rem" }}>
              {t.request.hospital}
            </label>
            <input
              type="text"
              required
              className="input"
              value={hospital}
              onChange={(e) => setHospital(e.target.value)}
              placeholder="e.g. Mayo Hospital, Emergency Ward 3, Lahore"
            />
          </div>

          {/* Location & GPS Detection */}
          <div style={{ background: "var(--surface-raised)", padding: "1rem", borderRadius: "var(--radius-sm)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text)" }}>
                {t.request.location}
              </span>
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={detectingLoc}
                className="btn btn-outline btn-sm"
                style={{ fontSize: "0.78rem", gap: "4px" }}
              >
                <NavigationIcon />
                {detectingLoc ? t.map.locating : t.request.use_gps}
              </button>
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
              {t.map.disclaimer}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{t.request.lat}:</span>
                <input
                  type="number"
                  step="0.0001"
                  required
                  className="input"
                  value={lat}
                  onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                  style={{ minHeight: "38px", fontSize: "0.85rem" }}
                />
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{t.request.lng}:</span>
                <input
                  type="number"
                  step="0.0001"
                  required
                  className="input"
                  value={lng}
                  onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
                  style={{ minHeight: "38px", fontSize: "0.85rem" }}
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.35rem" }}>
              {t.request.notes}
            </label>
            <textarea
              className="input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Attendant name, room number, or special instructions..."
              style={{ minHeight: "68px", padding: "0.5rem 0.75rem" }}
            />
          </div>

          {/* Radius Explanation */}
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", background: "var(--primary-light)", padding: "0.75rem", borderRadius: "var(--radius-sm)" }}>
            ⚡ <strong>Matching Process:</strong> We search nearby verified donors starting within 5 km and gradually expand every 3 minutes up to 50 km until fulfilled.
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-emergency btn-full"
            style={{ padding: "0.85rem", fontSize: "1rem" }}
          >
            {submitting ? t.request.submitting : t.request.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
