"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language-context";
import { BRAND } from "@/lib/brand";

export default function PrivacyPage() {
  const { t } = useLanguage();
  const lastUpdated = "November 2026";

  return (
    <div className="page" style={{ maxWidth: "680px" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <div className="badge badge-urgent" style={{ marginBottom: "0.75rem" }}>
          {t.privacy.draft_notice}
        </div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--primary)", marginBottom: "0.25rem" }}>
          {t.privacy.title}
        </h1>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          {t.privacy.last_updated}: {lastUpdated}
        </p>
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
          {t.privacy.intro}
        </p>
      </div>

      <section style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
          {t.privacy.section_collect}
        </h2>
        <div className="card">
          <ul style={{ paddingLeft: "1.25rem", lineHeight: 2, color: "var(--text-muted)", fontSize: "0.9rem" }}>
            <li>Name and email address (required for account)</li>
            <li>Blood group (required for matching)</li>
            <li>GPS location — only if you explicitly enable it in your profile</li>
            <li>CNIC front/back images — only if you submit for identity verification</li>
            <li>Donation history — recorded after mutual confirmation between donor and recipient</li>
          </ul>
        </div>
      </section>

      <section style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
          {t.privacy.section_use}
        </h2>
        <div className="card">
          <ul style={{ paddingLeft: "1.25rem", lineHeight: 2, color: "var(--text-muted)", fontSize: "0.9rem" }}>
            <li>Matching blood donation requests with nearby available donors</li>
            <li>Sending in-app notifications when you are invited to donate</li>
            <li>Recording confirmed donations with your explicit consent</li>
            <li>Identity verification by authorized administrators only</li>
          </ul>
        </div>
      </section>

      <section style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
          {t.privacy.section_share}
        </h2>
        <div className="card">
          <ul style={{ paddingLeft: "1.25rem", lineHeight: 2, color: "var(--text-muted)", fontSize: "0.9rem" }}>
            <li>Your exact location is <strong>never</strong> shown to any other user. Only approximate distance is used in matching.</li>
            <li>Your phone number or contact is shared with a recipient <strong>only after</strong> you accept their donation request.</li>
            <li>CNIC images are accessible only to administrators for verification purposes.</li>
            <li>We do not sell, rent, or share personal data with third parties for commercial purposes.</li>
          </ul>
        </div>
      </section>

      <section style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
          {t.privacy.section_delete}
        </h2>
        <div className="card">
          <p style={{ color: "var(--text-muted)", lineHeight: 1.7, fontSize: "0.9rem" }}>
            You can delete your account at any time from the Profile page. Upon deletion, your personal
            profile data, location, and donation history will be removed within 30 days. CNIC images
            stored in secure storage will be purged in the same timeframe.
          </p>
        </div>
      </section>

      <div className="card" style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
          {t.privacy.contact_us}
        </p>
        <a
          href={`mailto:${BRAND.supportEmail}`}
          style={{ color: "var(--primary)", fontWeight: 600 }}
        >
          {BRAND.supportEmail}
        </a>
      </div>

      <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
        <Link href="/" className="btn btn-outline btn-sm">Home</Link>
        <Link href="/terms" className="btn btn-ghost btn-sm">Terms of Service</Link>
      </div>
    </div>
  );
}

