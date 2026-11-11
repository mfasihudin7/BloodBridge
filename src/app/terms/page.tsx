"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language-context";

export default function TermsPage() {
  const { t } = useLanguage();
  const lastUpdated = "November 2026";

  return (
    <div className="page" style={{ maxWidth: "680px" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <div className="badge badge-urgent" style={{ marginBottom: "0.75rem" }}>
          {t.terms.draft_notice}
        </div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--primary)", marginBottom: "0.25rem" }}>
          {t.terms.title}
        </h1>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          {t.terms.last_updated}: {lastUpdated}
        </p>
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
          By using Raabta, you agree to the following terms. This is a humanitarian volunteer platform.
          Use it responsibly.
        </p>
      </div>

      {[
        {
          title: "Who may use Raabta",
          body: "You must be 18 years or older to register as a blood donor. You may assist in creating a request on behalf of a patient of any age.",
        },
        {
          title: "Accurate information",
          body: "You agree to provide accurate information including your blood group, health status, and contact details. Providing false information that leads to medical harm may result in account suspension.",
        },
        {
          title: "No fee for donation",
          body: "Blood donation through Raabta is always voluntary and free. You may not charge any fee or compensation for donating blood through this platform.",
        },
        {
          title: "Medical decisions",
          body: "Raabta is a matching tool, not a medical service. All medical decisions must be made by qualified healthcare professionals. We are not responsible for clinical outcomes.",
        },
        {
          title: "Privacy",
          body: "See our Privacy Policy for how we handle your data.",
        },
        {
          title: "Account termination",
          body: "We may suspend or terminate accounts that violate these terms, attempt to defraud other users, or misuse the platform.",
        },
        {
          title: "Disclaimer",
          body: "Raabta is provided as-is. We make no warranty that donors will always be available or that requests will always be fulfilled. We are not liable for any medical or personal harm arising from use of this platform.",
        },
      ].map(({ title, body }) => (
        <section key={title} style={{ marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.4rem" }}>
            {title}
          </h2>
          <div className="card" style={{ padding: "1rem" }}>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.7, fontSize: "0.9rem" }}>{body}</p>
          </div>
        </section>
      ))}

      <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }}>
        <Link href="/" className="btn btn-outline btn-sm">Home</Link>
        <Link href="/privacy" className="btn btn-ghost btn-sm">Privacy Policy</Link>
      </div>
    </div>
  );
}

