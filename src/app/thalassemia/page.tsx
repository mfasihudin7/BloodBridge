"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

interface ScheduleItem {
  id: string;
  requester_id: string;
  blood_group: string;
  required_donors: number;
  scheduled_date: string;
  location_lat: number;
  location_lng: number;
  notes: string | null;
  status: string;
  created_at: string;
  donor_circles: Array<{
    id: string;
    status: string;
    circle_members: Array<{
      id: string;
      donor_id: string;
      status: string;
      profiles: { full_name: string | null; phone: string | null } | null;
    }>;
  }>;
}

interface DonorCircleInvite {
  circle_id: string;
  membership_id: string;
  status: string;
  scheduled_requirements: {
    id: string;
    blood_group: string;
    required_donors: number;
    scheduled_date: string;
    notes: string | null;
    status: string;
  } | null;
}

export default function ThalassemiaPage() {
  const { t, direction } = useLanguage();
  const isRTL = direction === "rtl";
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"upcoming" | "new" | "invites">("upcoming");
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [donorInvites, setDonorInvites] = useState<DonorCircleInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form State
  const [bloodGroup, setBloodGroup] = useState("B+");
  const [requiredDonors, setRequiredDonors] = useState(2);
  const [scheduledDate, setScheduledDate] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState<{ lat: number; lng: number }>({ lat: 33.6844, lng: 73.0479 });
  const [submitting, setSubmitting] = useState(false);

  const fetchSchedules = async () => {
    if (!user) return;
    setLoading(true);
    const res = await api.getThalSchedules();
    if (res.ok && res.data) {
      setSchedules(res.data.as_requester);
      setDonorInvites(res.data.as_donor);
    }
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (user && active) {
        setLoading(true);
        const res = await api.getThalSchedules();
        if (res.ok && res.data && active) {
          setSchedules(res.data.as_requester);
          setDonorInvites(res.data.as_donor);
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

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    setActionMsg(null);

    const res = await api.createThalSchedule({
      blood_group: bloodGroup,
      required_donors: requiredDonors,
      scheduled_date: scheduledDate,
      location,
      notes: notes.trim() || undefined,
    });

    setSubmitting(false);

    if (res.ok) {
      setActionMsg({ type: "success", text: t.thalassemia.schedule_success });
      setActiveTab("upcoming");
      fetchSchedules();
    } else {
      setActionMsg({ type: "error", text: res.message || "Failed to schedule requirement." });
    }
  };

  const handleRespondInvite = async (reqId: string, action: "accept" | "decline") => {
    const res = await api.respondToThalSchedule(reqId, action);
    if (res.ok) {
      fetchSchedules();
    } else {
      alert(res.message || "Failed to respond to invitation.");
    }
  };

  const handleCancelSchedule = async (reqId: string) => {
    if (!confirm("Are you sure you want to cancel this scheduled requirement?")) return;
    const res = await api.cancelThalSchedule(reqId);
    if (res.ok) {
      fetchSchedules();
    } else {
      alert(res.message || "Failed to cancel schedule.");
    }
  };

  return (
    <div className={`min-h-screen bg-neutral-50 pb-20 ${isRTL ? "rtl" : "ltr"}`}>
      {/* Header */}
      <section className="bg-white border-b border-neutral-200 py-8 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-crimson-600" />
            <span className="text-xs font-semibold tracking-wider uppercase text-crimson-700">
              Recurring Support Care
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight">
            {t.thalassemia.title}
          </h1>
          <p className="mt-1 text-sm text-neutral-600 max-w-2xl">
            {t.thalassemia.subtitle}
          </p>

          {/* Navigation Tabs */}
          <div className="mt-6 flex flex-wrap gap-2 border-b border-neutral-100 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab("upcoming")}
              className={`px-4 py-2 text-sm font-bold rounded-xl transition-colors ${
                activeTab === "upcoming"
                  ? "bg-crimson-600 text-white shadow-xs"
                  : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50"
              }`}
            >
              📅 {t.thalassemia.upcoming_requirements} ({schedules.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("new")}
              className={`px-4 py-2 text-sm font-bold rounded-xl transition-colors ${
                activeTab === "new"
                  ? "bg-crimson-600 text-white shadow-xs"
                  : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50"
              }`}
            >
              ➕ {t.thalassemia.new_requirement}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("invites")}
              className={`px-4 py-2 text-sm font-bold rounded-xl transition-colors ${
                activeTab === "invites"
                  ? "bg-crimson-600 text-white shadow-xs"
                  : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50"
              }`}
            >
              🤝 Circle Invitations ({donorInvites.length})
            </button>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
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
              Sign in to manage scheduled requirements or volunteer for thalassemia donor circles.
            </p>
            <Link href="/" className="btn btn-primary px-6 py-2.5 inline-block text-sm">
              Sign In to BloodBridge
            </Link>
          </div>
        ) : loading ? (
          <div className="card p-12 text-center text-neutral-500">
            <div className="w-8 h-8 border-3 border-crimson-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm">Loading Thalassemia Schedules...</p>
          </div>
        ) : activeTab === "upcoming" ? (
          <div className="space-y-6">
            {schedules.length === 0 ? (
              <div className="card p-12 text-center text-neutral-500">
                <span className="text-4xl block mb-2">🩸</span>
                <p className="font-bold text-neutral-800 text-lg mb-1">{t.thalassemia.no_upcoming}</p>
                <p className="text-sm text-neutral-500 mb-4">
                  Thalassemia patients can schedule regular transfusions in advance to automatically form a nearby volunteer donor circle.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("new")}
                  className="btn btn-primary px-5 py-2 text-sm font-bold"
                >
                  Schedule Your First Requirement
                </button>
              </div>
            ) : (
              schedules.map((item) => (
                <div key={item.id} className="card p-6 border-crimson-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-black text-crimson-700">{item.blood_group}</span>
                      <div>
                        <span className="text-base font-bold text-neutral-900 block">
                          Transfusion Date: {item.scheduled_date}
                        </span>
                        <span className="text-xs text-neutral-500">
                          Target: {item.required_donors} Volunteer Donors
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="badge badge-urgent uppercase text-xs">{item.status}</span>
                      {["open", "partially_filled"].includes(item.status) && (
                        <button
                          type="button"
                          onClick={() => handleCancelSchedule(item.id)}
                          className="btn btn-secondary text-xs py-1.5 px-3 text-crimson-600 hover:text-crimson-700"
                        >
                          {t.thalassemia.cancel_requirement}
                        </button>
                      )}
                    </div>
                  </div>

                  {item.notes && (
                    <p className="text-xs text-neutral-600 bg-neutral-50 p-3 rounded-lg border border-neutral-100 mb-4">
                      <strong>Notes:</strong> {item.notes}
                    </p>
                  )}

                  {/* Donor Circle Details */}
                  <div className="pt-4 border-t border-neutral-100">
                    <h3 className="text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2">
                      {t.thalassemia.circle_title}
                    </h3>
                    {item.donor_circles?.[0]?.circle_members?.length ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {item.donor_circles[0].circle_members.map((member) => (
                          <div
                            key={member.id}
                            className="p-3 rounded-xl border border-neutral-200 bg-white flex items-center justify-between"
                          >
                            <div>
                              <span className="text-xs font-bold text-neutral-900 block">
                                {member.profiles?.full_name || "Volunteer Donor"}
                              </span>
                              {member.profiles?.phone && (
                                <span className="text-[11px] text-neutral-500">{member.profiles.phone}</span>
                              )}
                            </div>
                            <span
                              className={`badge text-[10px] ${
                                member.status === "accepted" ? "badge-success" : "badge-neutral"
                              }`}
                            >
                              {member.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-400">Invited nearby donors will appear here once notified.</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : activeTab === "new" ? (
          <div className="card p-6 sm:p-8 max-w-2xl mx-auto">
            <h2 className="text-xl font-bold text-neutral-900 mb-4">{t.thalassemia.new_requirement}</h2>
            <form onSubmit={handleCreateSchedule} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                  Required Blood Group
                </label>
                <select
                  value={bloodGroup}
                  onChange={(e) => setBloodGroup(e.target.value)}
                  className="input text-sm font-semibold"
                >
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                    <option key={bg} value={bg}>
                      {bg}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                  {t.thalassemia.date_label}
                </label>
                <input
                  type="date"
                  required
                  min={new Date().toISOString().split("T")[0]}
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="input text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                  {t.thalassemia.donors_needed} (1-10)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={requiredDonors}
                  onChange={(e) => setRequiredDonors(Number(e.target.value))}
                  className="input text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">Hospital Latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={location.lat}
                    onChange={(e) => setLocation((prev) => ({ ...prev, lat: parseFloat(e.target.value) }))}
                    className="input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">Hospital Longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={location.lng}
                    onChange={(e) => setLocation((prev) => ({ ...prev, lng: parseFloat(e.target.value) }))}
                    className="input text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                  {t.thalassemia.notes_label}
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Hospital name, department, or transfusion routine details..."
                  className="input text-sm resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary w-full py-3 text-sm font-bold shadow-md"
              >
                {submitting ? "Scheduling & Alerting Circle..." : "Schedule Requirement"}
              </button>
            </form>
          </div>
        ) : (
          /* Donor Circle Invitations */
          <div className="space-y-4">
            {donorInvites.length === 0 ? (
              <div className="card p-12 text-center text-neutral-500">
                <p className="font-bold text-neutral-800 text-lg mb-1">No Circle Invitations</p>
                <p className="text-sm text-neutral-500">
                  When a nearby thalassemia family schedules a requirement matching your blood group, you will receive an invitation here.
                </p>
              </div>
            ) : (
              donorInvites.map((inv) => (
                <div key={inv.membership_id} className="card p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl font-black text-crimson-700">
                        {inv.scheduled_requirements?.blood_group}
                      </span>
                      <span className="badge badge-urgent text-xs uppercase">{inv.status}</span>
                    </div>
                    <p className="text-sm font-bold text-neutral-900">
                      Scheduled Date: {inv.scheduled_requirements?.scheduled_date}
                    </p>
                    {inv.scheduled_requirements?.notes && (
                      <p className="text-xs text-neutral-600 mt-1">{inv.scheduled_requirements.notes}</p>
                    )}
                  </div>

                  {inv.status === "invited" && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRespondInvite(inv.scheduled_requirements!.id, "accept")}
                        className="btn btn-primary text-xs py-2 px-4 font-bold"
                      >
                        {t.thalassemia.respond_invitation}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRespondInvite(inv.scheduled_requirements!.id, "decline")}
                        className="btn btn-secondary text-xs py-2 px-3 font-semibold"
                      >
                        {t.thalassemia.decline_invitation}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
