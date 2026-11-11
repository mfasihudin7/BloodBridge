# BloodBridge — CNIC OCR & Intelligence Privacy Document

**Policy Version:** 2026.1  
**Last Updated:** 2026-11-11  
**Classification:** Confidential & Security Reference

---

## 1. Overview & Purpose
BloodBridge provides optional Optical Character Recognition (OCR) and text intelligence on uploaded Pakistani Computerized National Identity Cards (CNIC) solely for user convenience. Its purpose is to autofill name, address, candidate area, and the last 4 digits of the CNIC without requiring manual typing.

**Fundamental Principle**: OCR extraction is an informational convenience tool. It does **not** authenticate documents, certify eligibility, or grant `is_verified` status. Official identity verification requires manual review and approval by an authorized administrator.

---

## 2. Absolute Minimization & Redaction Rules

1. **Zero External Raw Transmission**:
   - Original, unredacted CNIC photographs are **never** transmitted to any third-party vision or AI API.
   - Raw full images remain exclusively in the private Supabase Storage bucket `cnic-verification`.
2. **Server-Side Crop & Mask Pipeline**:
   - Before any external processing, the server checks layout validity and generates isolated crops of specific text zones (Name line, Address block, Number line).
   - In the number-line region, the first 9 digits (`XXXXX-XXXXXXX-`) are programmatically masked. Only the final 4 digits are retained.
   - If card orientation, layout assessment, or masking verification fails or is ambiguous, the image is **not** transmitted externally. The system returns `{ status: "manual_entry_required" }`.
3. **Strict Discard of Full CNIC Numbers**:
   - The application does not store, cache, log, or return 13-digit CNIC numbers.
   - Any external provider response containing 13 consecutive digits, hyphenated patterns (`\d{5}-\d{7}-\d`), or whitespace equivalents is immediately rejected and discarded from memory.
   - Only `cnic_last4` is retained in persistent database storage.

---

## 3. Explicit User Consent

- **Consent Required**: External OCR is strictly conditioned on explicit user opt-in (`PUT /api/verification/cnic/ocr-consent` with `consent: true`).
- **Consent Timestamp**: Stored in `profiles.ocr_consent_at`.
- **Right to Withdraw**: Users can revoke OCR consent at any time (`consent: false`). Withdrawal takes effect immediately, blocking all future extraction requests.
- **Uploading a CNIC does not imply OCR consent**: A user may upload documents for administrative verification without consenting to external OCR.

---

## 4. Manual Entry Fallback

- **First-Class Citizen**: Manual profile entry is always available and fully supported.
- **No Degradation**: Users who decline OCR or whose images cannot be processed can enter their name, address, area, and CNIC last 4 digits directly via `PUT /api/profile/cnic-details`.
- **Zero Silent Overwrites**: User-reviewed details cannot overwrite differing existing profile data without explicit confirmation.

---

## 5. Data Flow & Security Boundaries

```
[User Camera] -> [Private Storage (cnic-verification)]
                        |
            [Server-Side Crop & 9-Digit Mask]
                        |
            [Strict Consent & 5/hr Rate Limit Check]
                        |
        [Vetted OCR Provider (Masked Crops Only)]
                        |
    [Urdu Transliteration & 13-Digit Full Sanitizer]
                        |
    [Response: full_name_en, cnic_last4, address_en, area_en]
                        |
            [User Reviews & Confirms]
                        |
            [Profile Updated (is_verified remains FALSE)]
```

---

## 6. Retention & Lifecycle
- Extracted crops are processed in memory and never written to disk or permanent storage.
- Raw provider API responses are discarded immediately after field extraction.
- 30 days after a CNIC submission is rejected, all related images are permanently purged by the automated retention cleanup routine.

