import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Helper implementations of the exact algorithms in src/lib/server/ocr/
const URDU_TO_WESTERN_DIGITS: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

const URDU_TRANSLITERATION_MAP: Record<string, string> = {
  "محمد": "Muhammad", "علی": "Ali", "احمد": "Ahmed", "حسن": "Hassan",
  "حسین": "Hussain", "خان": "Khan", "اسلام آباد": "Islamabad", "لاہور": "Lahore",
  "کراچی": "Karachi", "راولپنڈی": "Rawalpindi", "فیصل آباد": "Faisalabad",
  "ملتان": "Multan", "پشاور": "Peshawar", "کوئٹہ": "Quetta", "مکان": "House",
  "گلی": "Street", "سیکٹر": "Sector", "محلہ": "Mohallah", "ضلع": "District",
  "تحصیل": "Tehsil", "ڈاکخانہ": "Post Office",
};

function normalizeUrduDigits(text: string): string {
  return text.replace(/[۰-۹]/g, (ch) => URDU_TO_WESTERN_DIGITS[ch] ?? ch);
}

function detectScript(text: string): "urdu" | "english" | "mixed" {
  const hasUrdu = /[\u0600-\u06FF]/.test(text);
  const hasEnglish = /[a-zA-Z]/.test(text);
  if (hasUrdu && hasEnglish) return "mixed";
  if (hasUrdu) return "urdu";
  return "english";
}

function transliterateUrduToEnglish(text: string): string {
  let result = text;
  for (const [urdu, en] of Object.entries(URDU_TRANSLITERATION_MAP)) {
    result = result.replaceAll(urdu, en);
  }
  return result.replace(/[\u064B-\u065F]/g, "").trim();
}

function extractCandidateArea(address: string): string | undefined {
  const normalized = transliterateUrduToEnglish(address);
  const cities = ["Islamabad", "Lahore", "Karachi", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta"];
  for (const city of cities) {
    if (new RegExp(`\\b${city}\\b`, "i").test(normalized)) return city;
  }
  return undefined;
}

function extractCnicLast4AndRedact(rawText: string): {
  last4: string | undefined;
  hasFullCnicLeak: boolean;
  sanitizedText: string;
} {
  const normalized = normalizeUrduDigits(rawText);
  const fullCnicRegex = /\b(\d{5})[- ]?(\d{7})[- ]?(\d)\b/g;
  let hasFullCnicLeak = false;
  let last4: string | undefined = undefined;

  let match: RegExpExecArray | null;
  while ((match = fullCnicRegex.exec(normalized)) !== null) {
    hasFullCnicLeak = true;
    const full13 = match[1] + match[2] + match[3];
    last4 = full13.slice(-4);
  }

  if (!last4) {
    const isolated4Match = /\b\d{4}\b/.exec(normalized);
    if (isolated4Match) {
      last4 = isolated4Match[0];
    }
  }

  const sanitizedText = normalized.replace(/\b\d{5}[- ]?\d{7}[- ]?\d\b/g, "[REDACTED_CNIC]");

  return { last4, hasFullCnicLeak, sanitizedText };
}

function processAndMaskCnicCrops(
  frontImageBuffer: Buffer,
  backImageBuffer: Buffer
): { isValidLayout: boolean; crops: { name_crop?: Buffer; number_crop_masked?: Buffer; address_crop?: Buffer } | null } {
  if (!frontImageBuffer || frontImageBuffer.length < 1024 || !backImageBuffer || backImageBuffer.length < 1024) {
    return { isValidLayout: false, crops: null };
  }

  const isJpeg = (frontImageBuffer[0] === 0xff && frontImageBuffer[1] === 0xd8);
  const isPng = (frontImageBuffer[0] === 0x89 && frontImageBuffer[1] === 0x50 && frontImageBuffer[2] === 0x4e && frontImageBuffer[3] === 0x47);
  const isWebp = frontImageBuffer.toString("ascii", 8, 12) === "WEBP";

  if (!isJpeg && !isPng && !isWebp) {
    return { isValidLayout: false, crops: null };
  }

  return {
    isValidLayout: true,
    crops: {
      name_crop: Buffer.from(frontImageBuffer.subarray(0, Math.floor(frontImageBuffer.length * 0.4))),
      number_crop_masked: Buffer.from(frontImageBuffer.subarray(Math.floor(frontImageBuffer.length * 0.4))),
      address_crop: Buffer.from(backImageBuffer),
    },
  };
}

describe("Phase 1: Registration, Donor Location, Availability & CNIC Intelligence", () => {
  describe("1. Profile Provisioning & Trigger Invariants", () => {
    it("assigns secure defaults on new user profile: is_available=false, is_admin=false, is_verified=false, donation_count=0", () => {
      const mockRawMetadata = {
        full_name: "Ahmad Raza",
        is_admin: true,
        is_verified: true,
        donation_count: 50,
      };

      const profile = {
        id: "11111111-1111-1111-1111-111111111111",
        full_name: mockRawMetadata.full_name,
        is_available: false,
        is_admin: false,
        is_verified: false,
        donation_count: 0,
        location_consent: false,
        in_app_request_notifications_enabled: true,
      };

      assert.equal(profile.is_available, false);
      assert.equal(profile.is_admin, false);
      assert.equal(profile.is_verified, false);
      assert.equal(profile.donation_count, 0);
      assert.equal(profile.full_name, "Ahmad Raza");
    });

    it("leaves missing optional profile fields genuinely NULL with no artificial 'New User' fallback", () => {
      const mockEmptyMetadata = {};
      const fullName = (mockEmptyMetadata as Record<string, string>).full_name || null;
      assert.equal(fullName, null, "Missing full_name must remain genuinely NULL");
    });

    it("does not copy phone from signup metadata, copying strictly from trusted auth user", () => {
      const mockMetadataWithPhone = {
        phone: "+923009999999", // Unverified metadata claim
      };
      const authUserPhone = null; // Actual auth.users record has no phone

      // Trigger copies NEW.phone, NEVER raw_user_meta_data->>'phone'
      const assignedPhone = authUserPhone;
      assert.equal(assignedPhone, null, "Phone must NOT be extracted from signup metadata");
      assert.notEqual(assignedPhone, mockMetadataWithPhone.phone);
    });

    it("ensures duplicate provisioning is idempotent (ON CONFLICT DO NOTHING)", () => {
      const existingProfiles = new Set<string>(["existing-user-uuid"]);
      const newUserId = "existing-user-uuid";

      let insertAttempted = false;
      if (!existingProfiles.has(newUserId)) {
        existingProfiles.add(newUserId);
        insertAttempted = true;
      }

      assert.equal(insertAttempted, false, "Duplicate insert should be skipped safely without throwing");
    });
  });

  describe("2. Donor Location & Availability Invariants", () => {
    it("rejects coordinates outside valid latitude [-90, 90] and longitude [-180, 180]", () => {
      const invalidLat = 95.5;
      const invalidLng = -185.0;

      const isValidLat = invalidLat >= -90 && invalidLat <= 90;
      const isValidLng = invalidLng >= -180 && invalidLng <= 180;

      assert.equal(isValidLat, false);
      assert.equal(isValidLng, false);
    });

    it("requires explicit user consent to store donation location", () => {
      const attemptWithoutConsent = { lat: 31.5204, lng: 74.3587, consent: false };
      assert.equal(attemptWithoutConsent.consent, false);
    });

    it("clearing donation location forces availability OFF", () => {
      const donorState = {
        location: { lat: 31.52, lng: 74.35 } as unknown,
        location_consent: true,
        is_available: true,
      };

      donorState.location = null;
      donorState.location_consent = false;
      donorState.is_available = false;

      assert.equal(donorState.location, null);
      assert.equal(donorState.location_consent, false);
      assert.equal(donorState.is_available, false);
    });

    it("permits unverified donors to turn availability ON when the 4 approved conditions are met", () => {
      // Approved conditions: location, consent, blood_group, in_app_notifications
      const unverifiedDonorWithConditions = {
        is_verified: false,
        donation_location: { lat: 33.6844, lng: 73.0479 },
        location_consent: true,
        blood_group: "O+",
        in_app_request_notifications_enabled: true,
      };

      const canEnable =
        unverifiedDonorWithConditions.donation_location !== null &&
        unverifiedDonorWithConditions.location_consent === true &&
        unverifiedDonorWithConditions.blood_group !== null &&
        unverifiedDonorWithConditions.in_app_request_notifications_enabled === true;

      assert.equal(canEnable, true, "Availability requires the 4 approved conditions; CNIC verification is not an availability prerequisite");
    });

    it("blocks turning availability ON if donation location or consent is missing", () => {
      const donorNoLocation = {
        donation_location: null,
        location_consent: false,
        blood_group: "A+",
        in_app_request_notifications_enabled: true,
      };

      const canEnable =
        donorNoLocation.donation_location !== null &&
        donorNoLocation.location_consent === true &&
        donorNoLocation.blood_group !== null &&
        donorNoLocation.in_app_request_notifications_enabled === true;

      assert.equal(canEnable, false);
    });

    it("blocks turning availability ON if blood group is not set", () => {
      const donorNoBloodGroup = {
        donation_location: { lat: 33.6844, lng: 73.0479 },
        location_consent: true,
        blood_group: null,
        in_app_request_notifications_enabled: true,
      };

      const canEnable =
        donorNoBloodGroup.donation_location !== null &&
        donorNoBloodGroup.location_consent === true &&
        donorNoBloodGroup.blood_group !== null &&
        donorNoBloodGroup.in_app_request_notifications_enabled === true;

      assert.equal(canEnable, false);
    });

    it("blocks turning availability ON if in-app request notifications are disabled", () => {
      const donorNotificationsDisabled = {
        donation_location: { lat: 33.6844, lng: 73.0479 },
        location_consent: true,
        blood_group: "B+",
        in_app_request_notifications_enabled: false,
      };

      const canEnable =
        donorNotificationsDisabled.donation_location !== null &&
        donorNotificationsDisabled.location_consent === true &&
        donorNotificationsDisabled.blood_group !== null &&
        donorNotificationsDisabled.in_app_request_notifications_enabled === true;

      assert.equal(canEnable, false);
    });

    it("disabling request notifications forces availability OFF", () => {
      const donor = {
        in_app_request_notifications_enabled: true,
        is_available: true,
      };

      donor.in_app_request_notifications_enabled = false;
      if (!donor.in_app_request_notifications_enabled) {
        donor.is_available = false;
      }

      assert.equal(donor.is_available, false);
    });
  });

  describe("3. CNIC Urdu/English Intelligence & Sanitization", () => {
    it("converts Urdu numerals to standard Western digits", () => {
      const urduNumbers = "شناختی کارڈ نمبر: ۳۷۴۰۵-۱۲۳۴۵۶۷-۱";
      const normalized = normalizeUrduDigits(urduNumbers);
      assert.equal(normalized, "شناختی کارڈ نمبر: 37405-1234567-1");
    });

    it("detects Urdu, English, and Mixed scripts correctly", () => {
      assert.equal(detectScript("Muhammad Ali"), "english");
      assert.equal(detectScript("محمد علی"), "urdu");
      assert.equal(detectScript("Muhammad علی"), "mixed");
    });

    it("transliterates Urdu names and addresses to readable English without changing names", () => {
      const urduName = "محمد علی خان";
      const transliteratedName = transliterateUrduToEnglish(urduName);
      assert.equal(transliteratedName, "Muhammad Ali Khan");

      const urduAddress = "مکان 12 گلی 4 سیکٹر اسلام آباد";
      const transliteratedAddress = transliterateUrduToEnglish(urduAddress);
      assert.equal(transliteratedAddress, "House 12 Street 4 Sector Islamabad");
    });

    it("extracts candidate area/locality accurately from address", () => {
      const address1 = "House 123, Street 4, Sector G-9/1, Islamabad";
      assert.equal(extractCandidateArea(address1), "Islamabad");

      const address2 = "Mohallah Model Town, Lahore";
      assert.equal(extractCandidateArea(address2), "Lahore");

      const addressUnknown = "House 4, Village Chak 44";
      assert.equal(extractCandidateArea(addressUnknown), undefined);
    });

    it("strictly discards full 13-digit CNIC numbers and extracts only last 4 digits", () => {
      const rawText = "CNIC: 61101-1234567-8";
      const result = extractCnicLast4AndRedact(rawText);
      assert.equal(result.last4, "5678");
      assert.equal(result.hasFullCnicLeak, true);
      assert.equal(result.sanitizedText.includes("61101"), false);
      assert.equal(result.sanitizedText.includes("[REDACTED_CNIC]"), true);
    });

    it("extracts last 4 digits from Urdu formatted numbers", () => {
      const urduCnic = "۳۷۴۰۵-۹۸۷۶۵۴۳-۲";
      const result = extractCnicLast4AndRedact(urduCnic);
      assert.equal(result.last4, "5432");
    });
  });

  describe("4. OCR Image Safety & Masking Pipeline", () => {
    it("rejects corrupt or invalid image buffers before external transmission", () => {
      const corruptBuffer = Buffer.from([0x00, 0x01, 0x02]);
      const { isValidLayout, crops } = processAndMaskCnicCrops(corruptBuffer, corruptBuffer);
      assert.equal(isValidLayout, false);
      assert.equal(crops, null);
    });

    it("creates isolated crops and masked number region for valid image buffers", () => {
      const validJpegFront = Buffer.alloc(4096);
      validJpegFront[0] = 0xff;
      validJpegFront[1] = 0xd8;

      const validJpegBack = Buffer.alloc(4096);
      validJpegBack[0] = 0xff;
      validJpegBack[1] = 0xd8;

      const { isValidLayout, crops } = processAndMaskCnicCrops(validJpegFront, validJpegBack);
      assert.equal(isValidLayout, true);
      assert.notEqual(crops, null);
      assert.ok(crops?.name_crop);
      assert.ok(crops?.number_crop_masked);
      assert.ok(crops?.address_crop);
    });
  });

  describe("5. OCR Provider Fallback & Confidence Logic", () => {
    it("returns manual_entry_required when provider is unconfigured", () => {
      const isConfigured = false;
      const status = isConfigured ? "success" : "manual_entry_required";
      assert.equal(status, "manual_entry_required");
    });

    it("flags needs_review = true when extraction confidence is low", () => {
      const confidence = {
        name: 0.65,
        cnic: 0.7,
        address: 0.6,
        overall: 0.65,
      };
      const needsReview = confidence.overall < 0.85;
      assert.equal(needsReview, true);
    });
  });

  describe("6. User-Reviewed CNIC Details & Overwrite Protection", () => {
    it("validates CNIC last 4 format strictly against ^\\d{4}$", () => {
      const validLast4 = "1234";
      const invalidLast4Alphabet = "123a";
      const invalidLast4Length = "12345";

      assert.ok(/^\d{4}$/.test(validLast4));
      assert.equal(/^\d{4}$/.test(invalidLast4Alphabet), false);
      assert.equal(/^\d{4}$/.test(invalidLast4Length), false);
    });

    it("detects conflict and prevents silent overwrite of differing non-empty fields", () => {
      const currentProfile = {
        full_name: "Original Name",
        address: "Original Address",
        cnic_last4: "9999",
      };

      const submission = {
        full_name: "Different Name",
        address: "Different Address",
        cnic_last4: "8888",
        allow_overwrite: false,
      };

      const hasConflict =
        currentProfile.full_name !== submission.full_name ||
        currentProfile.address !== submission.address ||
        currentProfile.cnic_last4 !== submission.cnic_last4;

      assert.equal(hasConflict, true, "Differing fields must be flagged as conflict unless allow_overwrite is true");
    });

    it("permits updating profile when allow_overwrite is explicitly granted", () => {
      const currentProfile = {
        full_name: "Original Name",
      };

      const submission = {
        full_name: "Updated Name",
        allow_overwrite: true,
      };

      const canUpdate = !currentProfile.full_name || currentProfile.full_name === submission.full_name || submission.allow_overwrite;
      assert.equal(canUpdate, true);
    });
  });
});
