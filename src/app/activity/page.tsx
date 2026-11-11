"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { api } from "@/lib/api";

interface InvitationItem {
  id: string;
  stage_radius_km: number;
  invited_at: string;
  status: string;
  requests: {
    id: string;
    blood_group: string;
    units: number;
    hospital: string;
    urgency: string;
    status: string;
    note: string | null;
    expires_at: string | null;
    requester_id: string;
    profiles: { full_name: string | null } | null;
  } | null;
}

interface CommitmentItem {
  id: string;
  progress: "accepted" | "en_route" | "arrived" | "donated";
  requests: {
    id: string;
    blood_group: string;
    units: number;
    hospital: string;
    urgency: string;
    status: string;
    note: string | null;
    expires_at: string | null;
    requester_id: string;
    profiles: { full_name: string | null } | null;
  } | null;
}

interface DonationHistoryItem {
  id: string;
  request_id: string;
  donor_id: string;
  donation_date: string;
  confirmed_at: string;
  blood_group: string;
  units: number;
  hospital: string;
}

export default function ActivityPage() {
  const { t, direction } = useLanguage();
  const isRTL = direction === "rtl";
  const { user, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<"invitations" | "commitments" | "history">("invitations");
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [commitments, setCommitments] = useState<CommitmentItem[]>([]);
  const [history, setHistory] = useState<DonationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Dispute modal / inputs
  const [disputeReportId, setDisputeReportId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputing, setDisputing] = useState(false);

  const fetchInbox = async () => {
    setLoading(true);
    const res = await api.getInbox();
    if (res.ok && res.data) {
      setInvitations(res.data.invitations as unknown as InvitationItem[]);
      setCommitments(res.data.active_commitments as unknown as CommitmentItem[]);
    }
    const histRes = await api.getDonationHistory(50);
    if (histRes.ok && histRes.data) {
      setHistory(histRes.data.items);
    }
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    const loadAsync = async () => {
      if (user && active) {
        await fetchInbox();
      } else if (!authLoading && active) {
        setLoading(false);
      }
    };
    loadAsync();
    return () => {
      active = false;
    };
  }, [user, authLoading]);

  const handleRespond = async (requestId: string, action: "accept" | "reject") => {
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await api.respondToInvite(requestId, action === "accept" ? "accept" : "decline");
    setActionLoading(false);

    if (res.ok) {
      setSuccessMsg(action === "accept" ? "Request accepted! Added to active commitments." : "Invitation declined.");
      fetchInbox();
    } else {
      setErrorMsg(!res.ok ? res.message : "Action failed.");
    }
  };

  const handleUpdateProgress = async (requestId: string, progress: "en_route" | "arrived" | "donated") => {
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await api.updateProgress(requestId, progress);
    setActionLoading(false);

    if (res.ok) {
      setSuccessMsg(`Status updated to: ${progress}`);
      fetchInbox();
    } else {
      setErrorMsg(!res.ok ? res.message : "Failed to update progress.");
    }
  };

  const handleWithdraw = async (requestId: string) => {
    if (!confirm("Are you sure you want to withdraw your commitment?")) return;

    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await api.withdrawCommitment(requestId);
    setActionLoading(false);

    if (res.ok) {
      setSuccessMsg("Commitment withdrawn.");
      fetchInbox();
    } else {
      setErrorMsg(!res.ok ? res.message : "Failed to withdraw commitment.");
    }
  };

  const handleConfirmReport = async (reportId: string) => {
    setActionLoading(true);
    setErrorMsg(null);
    const res = await api.confirmDonationReport(reportId);
    setActionLoading(false);

    if (res.ok) {
      setSuccessMsg("Donation confirmed! Your verified donation statistics have been updated.");
      fetchInbox();
    } else {
      setErrorMsg(res.message || "Failed to confirm report.");
    }
  };

  const handleDisputeReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeReportId || disputeReason.length < 10) return;

    setDisputing(true);
    setErrorMsg(null);

    const res = await api.disputeDonationReport(disputeReportId, disputeReason);
    setDisputing(false);

    if (res.ok) {
      setSuccessMsg("Report disputed! An administrator will review.");
      setDisputeReportId(null);
      setDisputeReason("");
      fetchInbox();
    } else {
      setErrorMsg(res.message || "Failed to submit dispute.");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="container" style={{ padding: "4rem 1rem", textAlign: "center" }}>
        <p>{t.common.loading}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container" style={{ padding: "4rem 1rem", textAlign: "center" }}>
        <div className="card" style={{ maxWidth: "480px", margin: "0 auto", padding: "2rem" }}>
          <h2>{t.inbox.title}</h2>
          <p style={{ margin: "1rem 0", color: "#666" }}>Please sign in to view alerts and manage commitments.</p>
          <Link href="/" className="btn btn-primary" style={{ display: "inline-block" }}>
            {t.nav.login}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`container ${isRTL ? "rtl" : "ltr"}`} style={{ padding: "2rem 1rem", maxWidth: "860px" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--primary-burgundy)" }}>
          {t.inbox.title}
        </h1>
      </div>

      {errorMsg && (
        <div className="badge badge-critical" style={{ display: "block", padding: "0.75rem", marginBottom: "1rem" }}>
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="badge badge-urgent" style={{ display: "block", padding: "0.75rem", marginBottom: "1rem", backgroundColor: "#dcfce7", color: "#166534" }}>
          {successMsg}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "2px solid #f1f5f9", paddingBottom: "0.5rem" }}>
        <button
          onClick={() => setActiveTab("invitations")}
          className={`btn ${activeTab === "invitations" ? "btn-primary" : "btn-secondary"}`}
          style={{ fontSize: "0.9rem", padding: "0.5rem 1rem" }}
        >
          {t.inbox.invitations_tab} ({invitations.length})
        </button>
        <button
          onClick={() => setActiveTab("commitments")}
          className={`btn ${activeTab === "commitments" ? "btn-primary" : "btn-secondary"}`}
          style={{ fontSize: "0.9rem", padding: "0.5rem 1rem" }}
        >
          {t.inbox.commitments_tab} ({commitments.length})
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`btn ${activeTab === "history" ? "btn-primary" : "btn-secondary"}`}
          style={{ fontSize: "0.9rem", padding: "0.5rem 1rem" }}
        >
          🏆 {t.donation.history_title} ({history.length})
        </button>
      </div>

      {/* Tab: Invitations */}
      {activeTab === "invitations" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {invitations.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "3rem 1rem", color: "#666" }}>
              <p>{t.inbox.no_invitations}</p>
            </div>
          ) : (
            invitations.map((inv) => {
              const req = inv.requests;
              if (!req) return null;
              return (
                <div key={inv.id} className="card" style={{ padding: "1.25rem", borderLeft: "4px solid var(--emergency-red)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                    <div>
                      <span className="badge badge-critical" style={{ marginRight: "0.5rem" }}>
                        {req.urgency.toUpperCase()}
                      </span>
                      <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--primary-burgundy)" }}>
                        {req.blood_group}
                      </span>
                    </div>
                    <span style={{ fontSize: "0.8rem", color: "#666" }}>
                      {t.inbox.stage_radius}: {inv.stage_radius_km} km
                    </span>
                  </div>

                  <div style={{ fontSize: "0.9rem", marginBottom: "1rem", lineHeight: 1.5 }}>
                    <p><strong>{t.inbox.hospital_label}:</strong> {req.hospital}</p>
                    <p><strong>{t.inbox.units_label}:</strong> {req.units}</p>
                    {req.note && <p style={{ color: "#555", fontStyle: "italic", marginTop: "0.25rem" }}>&ldquo;{req.note}&rdquo;</p>}
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      onClick={() => handleRespond(req.id, "accept")}
                      disabled={actionLoading}
                      className="btn btn-primary"
                      style={{ fontSize: "0.85rem", padding: "0.4rem 1rem" }}
                    >
                      {t.inbox.accept}
                    </button>
                    <button
                      onClick={() => handleRespond(req.id, "reject")}
                      disabled={actionLoading}
                      className="btn btn-secondary"
                      style={{ fontSize: "0.85rem", padding: "0.4rem 1rem" }}
                    >
                      {t.inbox.decline}
                    </button>
                    <Link
                      href={`/requests/${req.id}`}
                      className="btn btn-secondary"
                      style={{ fontSize: "0.85rem", padding: "0.4rem 1rem", marginLeft: "auto" }}
                    >
                      View Live Tracker
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab: Commitments */}
      {activeTab === "commitments" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {commitments.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "3rem 1rem", color: "#666" }}>
              <p>{t.inbox.no_commitments}</p>
            </div>
          ) : (
            commitments.map((comm) => {
              const req = comm.requests;
              if (!req) return null;
              return (
                <div key={comm.id} className="card" style={{ padding: "1.25rem", borderLeft: "4px solid #10b981" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                    <div>
                      <span className="badge" style={{ backgroundColor: "#dcfce7", color: "#166534", marginRight: "0.5rem" }}>
                        ACTIVE COMMITMENT
                      </span>
                      <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--primary-burgundy)" }}>
                        {req.blood_group}
                      </span>
                    </div>
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#10b981" }}>
                      STATUS: {comm.progress.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ fontSize: "0.9rem", marginBottom: "1rem", lineHeight: 1.5 }}>
                    <p><strong>{t.inbox.hospital_label}:</strong> {req.hospital}</p>
                    <p><strong>{t.inbox.units_label}:</strong> {req.units}</p>
                    {req.profiles?.full_name && (
                      <p><strong>Requester:</strong> {req.profiles.full_name}</p>
                    )}
                  </div>

                  {/* Progress Controls */}
                  <div style={{ background: "#f8fafc", padding: "0.75rem", borderRadius: "8px", marginBottom: "0.75rem" }}>
                    <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginBottom: "0.5rem" }}>
                      {t.inbox.progress_status}:
                    </p>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {comm.progress === "accepted" && (
                        <button
                          onClick={() => handleUpdateProgress(req.id, "en_route")}
                          disabled={actionLoading}
                          className="btn btn-secondary"
                          style={{ fontSize: "0.8rem" }}
                        >
                          🚗 {t.inbox.en_route}
                        </button>
                      )}
                      {(comm.progress === "accepted" || comm.progress === "en_route") && (
                        <button
                          onClick={() => handleUpdateProgress(req.id, "arrived")}
                          disabled={actionLoading}
                          className="btn btn-secondary"
                          style={{ fontSize: "0.8rem" }}
                        >
                          🏥 {t.inbox.arrived}
                        </button>
                      )}
                      {comm.progress === "arrived" && (
                        <button
                          onClick={() => handleUpdateProgress(req.id, "donated")}
                          disabled={actionLoading}
                          className="btn btn-primary"
                          style={{ fontSize: "0.8rem" }}
                        >
                          ✅ {t.inbox.donated}
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
                    <Link href={`/requests/${req.id}`} style={{ fontSize: "0.85rem", color: "var(--primary-burgundy)", fontWeight: 600 }}>
                      View Request Details →
                    </Link>
                    {comm.progress !== "donated" && (
                      <button
                        onClick={() => handleWithdraw(req.id)}
                        disabled={actionLoading}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--emergency-red)",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                        }}
                      >
                        {t.inbox.cancel_commitment}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab: Verified Donation History */}
      {activeTab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Dispute Dialog Modal */}
          {disputeReportId && (
            <div className="card p-5 border-crimson-200 mb-4 bg-crimson-50/40">
              <h3 className="text-sm font-bold text-crimson-900 mb-2">Dispute Donation Outcome Report</h3>
              <form onSubmit={handleDisputeReport} className="space-y-3">
                <textarea
                  rows={3}
                  required
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder={t.donation.dispute_reason_placeholder}
                  className="input text-xs resize-none"
                />
                <div className="flex gap-2">
                  <button type="submit" disabled={disputing || disputeReason.length < 10} className="btn btn-primary text-xs py-1.5 px-3">
                    {disputing ? "Submitting Dispute..." : "Submit Dispute to Admin"}
                  </button>
                  <button type="button" onClick={() => setDisputeReportId(null)} className="btn btn-secondary text-xs py-1.5 px-3">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {history.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "3rem 1rem", color: "#666" }}>
              <span className="text-4xl block mb-2">🏅</span>
              <p className="font-bold text-neutral-800 mb-1">{t.donation.no_history}</p>
              <p className="text-xs text-neutral-500 max-w-md mx-auto">
                Official donation statistics are strictly verified. When recipients report and you confirm, verified badges appear here.
              </p>
            </div>
          ) : (
            history.map((record) => (
              <div key={record.id} className="card p-5 flex flex-col sm:flex-row items-center justify-between gap-4 border-emerald-100">
                <div className="flex items-center gap-4">
                  <span className="text-3xl font-black text-crimson-700">{record.blood_group}</span>
                  <div>
                    <h3 className="font-bold text-neutral-900 text-sm">{record.hospital}</h3>
                    <p className="text-xs text-neutral-500">
                      Date: {record.donation_date} • Confirmed: {new Date(record.confirmed_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                  {/* Confirmed / Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleConfirmReport(record.id)}
                      className="btn btn-secondary text-xs py-1 px-2.5"
                    >
                      Verify Record
                    </button>
                    <span className="badge badge-success text-xs">
                      {t.donation.confirmed_badge}
                    </span>
                  </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
