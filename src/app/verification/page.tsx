"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

interface VerificationState {
  status: "unverified" | "pending" | "approved" | "rejected";
  is_verified: boolean;
  rejection_reason?: string | null;
}

export default function VerificationPage() {
  const { t, direction } = useLanguage();
  const isRTL = direction === "rtl";
  const { user, profile } = useAuth();

  const [verState, setVerState] = useState<VerificationState>(() => ({
    status: profile?.is_verified ? "approved" : "unverified",
    is_verified: Boolean(profile?.is_verified),
  }));
  const loading = false;
  const [consent, setConsent] = useState(false);
  const [frontPath, setFrontPath] = useState("");
  const [backPath, setBackPath] = useState("");
  const [reservationId, setReservationId] = useState("");
  const [reserving, setReserving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Manual / OCR Review State
  const [showDetailsForm, setShowDetailsForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [cnicLast4, setCnicLast4] = useState("");
  const [address, setAddress] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  // Step 1: Reserve upload paths
  const handleReserve = async () => {
    setReserving(true);
    setActionMsg(null);
    const res = await api.reserveCnicUpload();
    setReserving(false);

    if (res.ok && res.data) {
      setReservationId(res.data.reservation_id);
      setFrontPath(res.data.front_path);
      setBackPath(res.data.back_path);
    } else {
      setActionMsg({
        type: "error",
        text: !res.ok ? res.message : "Failed to reserve upload. You may have exceeded 3 attempts per 24 hours.",
      });
    }
  };

  // Step 2: Submit verification
  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      alert("Explicit consent is required to verify identity.");
      return;
    }
    if (!reservationId || !frontPath || !backPath) {
      alert("Please reserve upload paths first.");
      return;
    }

    setSubmitting(true);
    setActionMsg(null);

    const res = await api.submitCnicVerification({
      reservation_id: reservationId,
      front_image_path: frontPath,
      back_image_path: backPath,
      consent: true,
    });

    setSubmitting(false);

    if (res.ok && res.data) {
      setVerState({ status: "pending", is_verified: false });
      setShowDetailsForm(true);
      setActionMsg({
        type: "success",
        text: "CNIC submitted securely! It is now pending administrative review. You can optionally review your extracted details below.",
      });
    } else {
      setActionMsg({
        type: "error",
        text: !res.ok ? res.message : "Failed to submit verification.",
      });
    }
  };

  // Step 3: Save details (OCR / Manual review)
  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDetails(true);

    const res = await api.saveCnicDetails({
      full_name: fullName.trim(),
      cnic_last4: cnicLast4.trim(),
      address: address.trim() || undefined,
      source: "manual",
      allow_overwrite: true,
    });

    setSavingDetails(false);

    if (res.ok) {
      setActionMsg({
        type: "success",
        text: "Details saved to your profile!",
      });
      setShowDetailsForm(false);
    } else {
      setActionMsg({
        type: "error",
        text: res.message || "Failed to save details.",
      });
    }
  };

  return (
    <div className={`min-h-screen bg-neutral-50 pb-20 ${isRTL ? "rtl" : "ltr"}`}>
      {/* Header */}
      <section className="bg-white border-b border-neutral-200 py-8 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
            <span className="text-xs font-semibold tracking-wider uppercase text-emerald-700">
              Trust & Community Safety
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight">
            {t.verification.title}
          </h1>
          <p className="mt-1 text-sm text-neutral-600 max-w-2xl">
            {t.verification.subtitle}
          </p>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
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
            <p className="text-lg font-bold text-neutral-800 mb-2">Please Sign In</p>
            <p className="text-sm text-neutral-600 mb-4">
              Sign in to verify your identity as a volunteer blood donor.
            </p>
            <Link href="/" className="btn btn-primary px-6 py-2.5 inline-block text-sm font-bold">
              Sign In to BloodBridge
            </Link>
          </div>
        ) : loading ? (
          <div className="card p-12 text-center text-neutral-500">
            <div className="w-8 h-8 border-3 border-crimson-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm">Loading Verification Status...</p>
          </div>
        ) : verState.is_verified ? (
          <div className="card p-8 text-center border-emerald-200 bg-emerald-50/30">
            <span className="text-5xl block mb-3">🛡️</span>
            <h2 className="text-2xl font-black text-emerald-900 mb-2">
              {t.verification.status_approved}
            </h2>
            <p className="text-sm text-emerald-800 max-w-md mx-auto">
              Your identity has been verified by the BloodBridge administration. You have full volunteer privileges and high community trust.
            </p>
          </div>
        ) : verState.status === "pending" ? (
          <div className="space-y-6">
            <div className="card p-8 text-center border-amber-200 bg-amber-50/40">
              <span className="text-5xl block mb-3">⏳</span>
              <h2 className="text-2xl font-black text-amber-900 mb-2">
                {t.verification.status_pending}
              </h2>
              <p className="text-sm text-amber-800 max-w-md mx-auto">
                Your CNIC photos have been securely submitted to our private storage. An authorized administrator will review and verify your identity shortly.
              </p>
            </div>

            {/* Optional Manual/OCR details correction */}
            {showDetailsForm && (
              <div className="card p-6 sm:p-8 max-w-xl mx-auto">
                <h3 className="text-lg font-bold text-neutral-900 mb-1">{t.verification.extract_ocr}</h3>
                <p className="text-xs text-neutral-500 mb-4">
                  Confirm your details for display on volunteer verification badges. Full CNIC is never shown publicly.
                </p>

                <form onSubmit={handleSaveDetails} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                      {t.verification.full_name}
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Muhammad Ali"
                      className="input text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                      {t.verification.cnic_last4} (4 Digits)
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      pattern="[0-9]{4}"
                      required
                      value={cnicLast4}
                      onChange={(e) => setCnicLast4(e.target.value)}
                      placeholder="e.g. 1234"
                      className="input text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                      Residential Area / City
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. F-8, Islamabad"
                      className="input text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingDetails}
                    className="btn btn-primary w-full py-2.5 text-sm font-bold shadow-md"
                  >
                    {savingDetails ? "Saving..." : t.verification.save_details}
                  </button>
                </form>
              </div>
            )}
          </div>
        ) : (
          /* Submission Form */
          <div className="card p-6 sm:p-8 max-w-2xl mx-auto">
            <h2 className="text-xl font-bold text-neutral-900 mb-2">
              Submit CNIC for Volunteer Verification
            </h2>
            <p className="text-xs text-neutral-500 mb-6 leading-relaxed">
              {t.verification.admin_notice}
            </p>

            {!reservationId ? (
              <div className="p-6 rounded-2xl bg-neutral-100 border border-neutral-200 text-center">
                <p className="text-sm font-medium text-neutral-700 mb-4">
                  Step 1: Secure upload path reservation (Protected by rate limiting: max 3/24h)
                </p>
                <button
                  type="button"
                  disabled={reserving}
                  onClick={handleReserve}
                  className="btn btn-primary py-2.5 px-6 text-sm font-bold shadow-md"
                >
                  {reserving ? "Reserving Secure Slot..." : "Start Secure Verification"}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitVerification} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50">
                    <span className="text-xs font-bold text-neutral-700 uppercase block mb-1">
                      {t.verification.front_image}
                    </span>
                    <p className="text-[11px] text-neutral-500 mb-2">Reserved slot: Front side photo</p>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      required
                      className="text-xs text-neutral-600"
                    />
                  </div>

                  <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50">
                    <span className="text-xs font-bold text-neutral-700 uppercase block mb-1">
                      {t.verification.back_image}
                    </span>
                    <p className="text-[11px] text-neutral-500 mb-2">Reserved slot: Back side photo</p>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      required
                      className="text-xs text-neutral-600"
                    />
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-xl bg-crimson-50/50 border border-crimson-200 text-xs text-neutral-700">
                  <input
                    type="checkbox"
                    id="consent"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 rounded text-crimson-600 focus:ring-crimson-500"
                  />
                  <label htmlFor="consent" className="cursor-pointer">
                    {t.verification.consent_checkbox}
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !consent}
                  className="btn btn-primary w-full py-3 text-sm font-bold shadow-md"
                >
                  {submitting ? t.verification.submitting : t.verification.submit_verification}
                </button>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
