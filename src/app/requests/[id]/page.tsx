"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { api } from "@/lib/api";

interface RequestData {
  id: string;
  blood_group: string;
  units: number;
  hospital: string;
  urgency: string;
  status: string;
  required_donors: number;
  accepted_donors_count: number;
  created_at: string;
  note: string | null;
  requester_id: string;
  location?: { lat: number; lng: number };
}

interface RequestDetailResponse {
  request: RequestData;
  is_requester: boolean;
  is_accepted_donor: boolean;
  invited_count: number;
  expansion_jobs: Array<{
    id: string;
    current_radius_km: number;
    status: string;
    run_at: string;
  }>;
  next_expansion_at: string | null;
  accepted_donors: Array<{
    donor_id: string;
    full_name: string;
    progress: string;
  }>;
}

declare global {
  interface Window {
    L: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

function RequestTrackerContent() {
  const params = useParams();
  const router = useRouter();
  const requestId = params?.id as string;
  const { direction } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const isRTL = direction === "rtl";

  const [data, setData] = useState<RequestDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [countdownText, setCountdownText] = useState<string>("");

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const circleRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [leafletLoaded, setLeafletLoaded] = useState(() => {
    return typeof window !== "undefined" && Boolean(window.L);
  });

  const loadData = React.useCallback(async () => {
    if (!requestId) return;
    const res = await api.getRequest(requestId);
    if (res.ok) {
      setData(res.data as unknown as RequestDetailResponse);
    } else {
      setErrorMsg(res.message);
    }
    setLoading(false);
  }, [requestId]);

  // Periodic poll for authoritative status
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (active) await loadData();
    };
    run();
    const interval = setInterval(run, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [loadData]);

  // Load Leaflet dynamically via standard CDN
  useEffect(() => {
    if (typeof window === "undefined" || window.L) return;

    const cssId = "leaflet-map-cdn-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.crossOrigin = "";
      document.head.appendChild(link);
    }

    const scriptId = "leaflet-map-cdn-js";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.crossOrigin = "";
      script.async = true;
      script.onload = () => setLeafletLoaded(true);
      document.body.appendChild(script);
    } else {
      const existing = document.getElementById(scriptId) as HTMLScriptElement;
      existing.addEventListener("load", () => setLeafletLoaded(true));
    }
  }, []);

  // Countdown timer derived strictly from server authoritative next_expansion_at
  useEffect(() => {
    let active = true;
    const target = data?.next_expansion_at ? new Date(data.next_expansion_at).getTime() : null;

    const updateTimer = () => {
      if (!active) return;
      if (!target) {
        setCountdownText(data?.request?.status === "open" ? "Max radius reached" : "Matching completed");
        return;
      }
      const now = Date.now();
      const diff = Math.max(0, Math.floor((target - now) / 1000));
      if (diff <= 0) {
        setCountdownText("Expanding now...");
      } else {
        const mins = Math.floor(diff / 60);
        const secs = diff % 60;
        setCountdownText(`${mins}:${secs < 10 ? "0" : ""}${secs}`);
      }
    };

    const interval = setInterval(updateTimer, 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [data]);

  // Current search radius in kilometers
  const expansionJobs = data?.expansion_jobs;
  const currentRadiusKm = React.useMemo(() => {
    if (!expansionJobs || expansionJobs.length === 0) return 5;
    const completed = expansionJobs
      .filter((j) => j.status === "completed" || j.status === "pending")
      .map((j) => j.current_radius_km);
    return completed.length > 0 ? Math.max(...completed) : 5;
  }, [expansionJobs]);

  // Leaflet Map Initialization & Radius Rendering
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current || !data) return;
    const L = window.L;
    if (!L) return;

    // Use default coordinates if not provided
    const lat = 31.5204;
    const lng = 74.3587;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [lat, lng],
        zoom: 12,
        zoomControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      // Hospital / Requester Pin
      const markerHtml = `
        <div style="
          width: 36px;
          height: 36px;
          background: #C0392B;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 14px;
          border: 3px solid #FFF;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        ">
          ${data.request.blood_group}
        </div>
      `;
      const icon = L.divIcon({ html: markerHtml, className: "", iconSize: [36, 36], iconAnchor: [18, 18] });
      L.marker([lat, lng], { icon }).addTo(map);

      // Animated Matching Radius Circle
      const circle = L.circle([lat, lng], {
        radius: currentRadiusKm * 1000,
        color: "#8B1A1A",
        fillColor: "#8B1A1A",
        fillOpacity: 0.12,
        weight: 2,
        dashArray: "6, 6",
      }).addTo(map);

      circleRef.current = circle;
      mapInstanceRef.current = map;
    } else {
      // Update existing circle radius
      if (circleRef.current) {
        circleRef.current.setRadius(currentRadiusKm * 1000);
      }
    }
  }, [leafletLoaded, data, currentRadiusKm]);

  const handleCancelRequest = async () => {
    if (!confirm("Are you sure you want to cancel this emergency request?")) return;
    setActionLoading(true);
    const res = await api.cancelRequest(requestId);
    if (res.ok) {
      await loadData();
    } else {
      alert(res.message);
    }
    setActionLoading(false);
  };

  const handleRespond = async (action: "accept" | "decline") => {
    setActionLoading(true);
    const res = await api.respondToInvite(requestId, action);
    if (res.ok) {
      await loadData();
    } else {
      alert(res.message);
    }
    setActionLoading(false);
  };

  if (authLoading || loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "80vh" }}>
        <div style={{ textAlign: "center" }}>
          <div className="spinner" style={{ color: "var(--primary)", width: "32px", height: "32px", marginBottom: "1rem" }} />
          <div style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>Connecting to emergency network...</div>
        </div>
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="page" style={{ maxWidth: "460px", paddingTop: "3rem" }}>
        <div className="card" style={{ textAlign: "center" }}>
          <h2 style={{ color: "var(--emergency)", marginBottom: "0.5rem" }}>Error</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>{errorMsg || "Unable to load blood request."}</p>
          <button onClick={() => router.push("/")} className="btn btn-outline">Back to Home</button>
        </div>
      </div>
    );
  }

  const { request, is_requester, is_accepted_donor, invited_count, accepted_donors } = data;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "calc(100vh - 56px)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Full-Screen OpenStreetMap Canvas */}
      <div
        ref={mapContainerRef}
        style={{
          width: "100%",
          flex: 1,
          background: "#E5E0DC",
          zIndex: 1,
        }}
      />

      {/* Floating Recenter Map Button */}
      <button
        onClick={() => {
          if (mapInstanceRef.current) {
            mapInstanceRef.current.setView([31.5204, 74.3587], 13, { animate: true });
          }
        }}
        style={{
          position: "absolute",
          top: "16px",
          right: isRTL ? "auto" : "16px",
          left: isRTL ? "16px" : "auto",
          zIndex: 10,
          background: "#FFF",
          border: "1px solid var(--border)",
          borderRadius: "50%",
          width: "44px",
          height: "44px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          cursor: "pointer",
        }}
        title="Recenter"
      >
        🎯
      </button>

      {/* Ride-Booking Style Bottom Status Panel (inDrive inspired) */}
      <div
        style={{
          position: "relative",
          zIndex: 20,
          background: "var(--surface)",
          borderTopLeftRadius: "1.5rem",
          borderTopRightRadius: "1.5rem",
          boxShadow: "0 -6px 24px rgba(0,0,0,0.12)",
          padding: "1.25rem 1rem 1.75rem",
          maxWidth: "520px",
          width: "100%",
          margin: "0 auto",
        }}
      >
        {/* Grab Handle */}
        <div style={{ width: "36px", height: "4px", background: "var(--border-strong)", borderRadius: "2px", margin: "0 auto 0.75rem" }} />

        {/* Header Details */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                style={{
                  background: "var(--emergency)",
                  color: "#FFF",
                  fontWeight: 800,
                  fontSize: "1rem",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                {request.blood_group}
              </span>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text)" }}>
                {request.hospital}
              </h2>
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>
              {request.units} {request.units === 1 ? "unit" : "units"} needed • Status: <span style={{ fontWeight: 700, color: request.status === "open" ? "var(--emergency)" : "var(--success)" }}>{request.status.toUpperCase()}</span>
            </div>
          </div>

          {/* Cancel button if requester */}
          {is_requester && request.status === "open" && (
            <button
              onClick={handleCancelRequest}
              disabled={actionLoading}
              className="btn btn-ghost btn-sm"
              style={{ color: "var(--emergency)", fontSize: "0.75rem" }}
            >
              Cancel
            </button>
          )}
        </div>

        {/* Live Matching Telemetry Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "0.5rem",
            background: "var(--surface-raised)",
            padding: "0.75rem",
            borderRadius: "var(--radius)",
            marginBottom: "0.75rem",
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Radius
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--primary)" }}>
              {currentRadiusKm} km
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Invited
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text)" }}>
              {invited_count}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Next Expansion
            </div>
            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--emergency)" }}>
              {countdownText}
            </div>
          </div>
        </div>

        {/* Accepted Donors List or Waiting Message */}
        {accepted_donors && accepted_donors.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)" }}>
              Accepted Volunteer Donors ({accepted_donors.length}/{request.required_donors}):
            </div>
            {accepted_donors.map((d) => (
              <div
                key={d.donor_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.5rem 0.75rem",
                  background: "#F0FDF4",
                  border: "1px solid #BBF7D0",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.85rem",
                }}
              >
                <span style={{ fontWeight: 600 }}>{d.full_name || "Volunteer Donor"}</span>
                <span className="badge badge-success">{d.progress}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            <div className="spinner" style={{ width: "14px", height: "14px" }} />
            <span>Broadcasting to nearby verified donors...</span>
          </div>
        )}

        {/* Action Controls for Invited Donor */}
        {!is_requester && !is_accepted_donor && request.status === "open" && user && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "1rem" }}>
            <button
              onClick={() => handleRespond("decline")}
              disabled={actionLoading}
              className="btn btn-outline"
            >
              Decline
            </button>
            <button
              onClick={() => handleRespond("accept")}
              disabled={actionLoading}
              className="btn btn-primary"
            >
              Accept Invitation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RequestTrackerPage() {
  return (
    <React.Suspense fallback={<div style={{ textAlign: "center", padding: "3rem" }}>Loading tracker...</div>}>
      <RequestTrackerContent />
    </React.Suspense>
  );
}
