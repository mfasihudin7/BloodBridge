"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

interface VerificationItem {
  id: string;
  user_id: string;
  status: string;
  submitted_at: string;
  front_image_signed_url: string;
  back_image_signed_url: string;
  user: { full_name: string | null };
}

export default function AdminPortalPage() {
  const { t, direction } = useLanguage();
  const isRTL = direction === "rtl";
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"verifications" | "disputes">("verifications");
  const [verifications, setVerifications] = useState<VerificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Review & Dispute Action States
  const [rejectionReason, setRejectionReason] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [disputeReportId, setDisputeReportId] = useState("");
  const [disputeResolution, setDisputeResolution] = useState<"confirmed" | "rejected">("confirmed");
  const [disputeNote, setDisputeNote] = useState("");
  const [resolvingDispute, setResolvingDispute] = useState(false);

  const fetchAdminData = async () => {
    if (!user) return;
    setLoading(true);
    const res = await api.getAdminVerifications("pending");
    if (res.ok && res.data) {
      setVerifications(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (user && active) {
        setLoading(true);
        const res = await api.getAdminVerifications("pending");
        if (res.ok && res.data && active) {
          setVerifications(res.data);
        }
        if (active) setLoading(false);
      } else if (!user && active) {
        setLoading(false);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [user]);

  const handleReview = async (id: string, action: "approve" | "reject") => {
    setReviewingId(id);
    setActionMsg(null);

    const res = await api.reviewAdminVerification(
      id,
      action,
      action === "reject" ? rejectionReason || "Document rejected by administration." : undefined
    );

    setReviewingId(null);

    if (res.ok) {
      setActionMsg({
        type: "success",
        text: `Verification ${action === "approve" ? "approved" : "rejected"} successfully.`,
      });
      setRejectionReason("");
      fetchAdminData();
    } else {
      setActionMsg({
        type: "error",
        text: res.message || "Failed to submit review.",
      });
    }
  };

  const handleResolveDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeReportId.trim() || !disputeNote.trim()) return;

    setResolvingDispute(true);
    setActionMsg(null);

    const res = await api.resolveDonationDispute(disputeReportId.trim(), disputeResolution, disputeNote.trim());
    setResolvingDispute(false);

    if (res.ok) {
      setActionMsg({
        type: "success",
        text: `Disputed report resolved as ${disputeResolution}.`,
      });
      setDisputeReportId("");
      setDisputeNote("");
    } else {
      setActionMsg({
        type: "error",
        text: res.message || "Failed to resolve donation dispute.",
      });
    }
  };

  return (
    <div className={`min-h-screen bg-neutral-50 pb-20 ${isRTL ? "rtl" : "ltr"}`}>
      {/* Header */}
      <section className="bg-neutral-900 text-white py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-crimson-500" />
            <span className="text-xs font-semibold tracking-wider uppercase text-crimson-400">
              Administrative Control Layer
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {t.admin.title}
          </h1>
          <p className="mt-1 text-sm text-neutral-400 max-w-2xl">
            {t.admin.subtitle}
          </p>

          {/* Navigation Tabs */}
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("verifications")}
              className={`px-4 py-2 text-sm font-bold rounded-xl transition-colors ${
                activeTab === "verifications"
                  ? "bg-crimson-600 text-white"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
            >
              📄 {t.admin.tab_verifications} ({verifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("disputes")}
              className={`px-4 py-2 text-sm font-bold rounded-xl transition-colors ${
                activeTab === "disputes"
                  ? "bg-crimson-600 text-white"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
            >
              ⚖️ {t.admin.tab_disputes}
            </button>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {actionMsg && (
          <div
            className={`mb-6 p-4 rounded-xl border text-sm font-medium ${
              actionMsg.type === "success"
                ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                : "bg-crimson-50 text-crimson-900 border-crimson-200"
            }`}
          >
            {actionMsg.text}
          </div>
        )}

        {!user ? (
          <div className="card p-12 text-center">
            <p className="text-lg font-bold text-neutral-800 mb-2">Administrator Access Required</p>
            <p className="text-sm text-neutral-600 mb-4">
              Please sign in with authorized administrator credentials.
            </p>
            <Link href="/" className="btn btn-primary px-6 py-2.5 inline-block text-sm font-bold">
              Sign In to BloodBridge
            </Link>
          </div>
        ) : loading ? (
          <div className="card p-12 text-center text-neutral-500">
            <div className="w-8 h-8 border-3 border-crimson-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm">Loading Administration Queue...</p>
          </div>
        ) : activeTab === "verifications" ? (
          <div className="space-y-6">
            {verifications.length === 0 ? (
              <div className="card p-12 text-center text-neutral-500">
                <span className="text-4xl block mb-2">✅</span>
                <p className="font-bold text-neutral-800 text-lg mb-1">{t.admin.no_verifications}</p>
                <p className="text-sm text-neutral-500">
                  All submitted volunteer identity documents have been processed.
                </p>
              </div>
            ) : (
              verifications.map((item) => (
                <div key={item.id} className="card p-6 border-neutral-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
                        {t.admin.user_label}
                      </span>
                      <h3 className="text-lg font-bold text-neutral-900">
                        {item.user?.full_name || "Volunteer Donor"}
                      </h3>
                      <span className="text-xs text-neutral-500">
                        {t.admin.submitted_at}: {new Date(item.submitted_at).toLocaleString()}
                      </span>
                    </div>
                    <span className="badge badge-urgent uppercase text-xs">{item.status}</span>
                  </div>

                  {/* Document Signed URLs Preview */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4 p-4 rounded-xl bg-neutral-50 border border-neutral-200">
                    <div>
                      <span className="text-xs font-bold text-neutral-700 block mb-1">CNIC Front</span>
                      {item.front_image_signed_url ? (
                        <a
                          href={item.front_image_signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-crimson-600 hover:underline flex items-center gap-1"
                        >
                          🔍 {t.admin.inspect_doc}
                        </a>
                      ) : (
                        <span className="text-xs text-neutral-400">Unavailable</span>
                      )}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-neutral-700 block mb-1">CNIC Back</span>
                      {item.back_image_signed_url ? (
                        <a
                          href={item.back_image_signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-crimson-600 hover:underline flex items-center gap-1"
                        >
                          🔍 {t.admin.inspect_doc}
                        </a>
                      ) : (
                        <span className="text-xs text-neutral-400">Unavailable</span>
                      )}
                    </div>
                  </div>

                  {/* Action Controls */}
                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-neutral-100">
                    <button
                      type="button"
                      disabled={reviewingId === item.id}
                      onClick={() => handleReview(item.id, "approve")}
                      className="btn btn-primary text-xs py-2 px-5 font-bold w-full sm:w-auto"
                    >
                      {reviewingId === item.id ? "Processing..." : t.admin.approve_btn}
                    </button>
                    <input
                      type="text"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Rejection reason if declining..."
                      className="input text-xs flex-1"
                    />
                    <button
                      type="button"
                      disabled={reviewingId === item.id}
                      onClick={() => handleReview(item.id, "reject")}
                      className="btn btn-secondary text-xs py-2 px-4 font-semibold text-crimson-600 hover:text-crimson-700 w-full sm:w-auto"
                    >
                      {t.admin.reject_btn}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* Dispute Resolution Form */
          <div className="card p-6 sm:p-8 max-w-2xl mx-auto">
            <h2 className="text-xl font-bold text-neutral-900 mb-2">Resolve Disputed Donation Report</h2>
            <p className="text-xs text-neutral-500 mb-6 leading-relaxed">
              When a donor disputes a recipient outcome report, an administrator conducts independent verification with the medical facility before releasing official statistics.
            </p>

            <form onSubmit={handleResolveDispute} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                  Donation Report ID (UUID)
                </label>
                <input
                  type="text"
                  required
                  value={disputeReportId}
                  onChange={(e) => setDisputeReportId(e.target.value)}
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  className="input text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                  Resolution Decision
                </label>
                <select
                  value={disputeResolution}
                  onChange={(e) => setDisputeResolution(e.target.value as "confirmed" | "rejected")}
                  className="input text-sm font-semibold"
                >
                  <option value="confirmed">Confirm Donation (Increment Official Count)</option>
                  <option value="rejected">Reject Dispute (Do Not Count)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                  {t.admin.resolution_note} (Min. 5 characters)
                </label>
                <textarea
                  rows={3}
                  required
                  value={disputeNote}
                  onChange={(e) => setDisputeNote(e.target.value)}
                  placeholder="Record verification note from hospital records..."
                  className="input text-sm resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={resolvingDispute}
                className="btn btn-primary w-full py-3 text-sm font-bold shadow-md"
              >
                {resolvingDispute ? "Submitting Resolution..." : "Record Official Administrative Decision"}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
