import type { ScriptType } from "./types";

/**
 * Maps Urdu numerals to Western Arabic digits.
 */
const URDU_TO_WESTERN_DIGITS: Record<string, string> = {
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

/**
 * Common Urdu place/address names and words transliterated/normalized into readable English.
 */
const URDU_TRANSLITERATION_MAP: Record<string, string> = {
  "محمد": "Muhammad",
  "علی": "Ali",
  "احمد": "Ahmed",
  "حسن": "Hassan",
  "حسین": "Hussain",
  "خان": "Khan",
  "اسلام آباد": "Islamabad",
  "لاہور": "Lahore",
  "کراچی": "Karachi",
  "راولپنڈی": "Rawalpindi",
  "فیصل آباد": "Faisalabad",
  "ملتان": "Multan",
  "پشاور": "Peshawar",
  "کوئٹہ": "Quetta",
  "مکان": "House",
  "گلی": "Street",
  "سیکٹر": "Sector",
  "محلہ": "Mohallah",
  "ضلع": "District",
  "تحصیل": "Tehsil",
  "ڈاکخانہ": "Post Office",
};

/**
 * Normalizes all Urdu numerals in a string to standard Western digits.
 */
export function normalizeUrduDigits(text: string): string {
  return text.replace(/[۰-۹]/g, (ch) => URDU_TO_WESTERN_DIGITS[ch] ?? ch);
}

/**
 * Detects whether text is Urdu, English, or Mixed script.
 */
export function detectScript(text: string): ScriptType {
  const hasUrdu = /[\u0600-\u06FF]/.test(text);
  const hasEnglish = /[a-zA-Z]/.test(text);

  if (hasUrdu && hasEnglish) return "mixed";
  if (hasUrdu) return "urdu";
  return "english";
}

/**
 * Transliterates an Urdu name into Latin English characters without changing the name.
 */
export function transliterateUrduToEnglish(text: string): string {
  let result = text;
  for (const [urdu, en] of Object.entries(URDU_TRANSLITERATION_MAP)) {
    result = result.replaceAll(urdu, en);
  }
  // Strip any remaining unmapped Urdu diacritics and clean up whitespace
  return result.replace(/[\u064B-\u065F]/g, "").trim();
}

/**
 * Discards/redacts any full 13-digit Pakistani CNIC number pattern.
 * Extracts strictly the final four digits.
 *
 * Full CNIC patterns checked:
 * - 13 consecutive digits: \b\d{13}\b
 * - Hyphenated: \b\d{5}-\d{7}-\d\b
 * - Whitespace separated: \b\d{5}\s+\d{7}\s+\d\b
 */
export function extractCnicLast4AndRedact(rawText: string): {
  last4: string | undefined;
  hasFullCnicLeak: boolean;
  sanitizedText: string;
} {
  const normalized = normalizeUrduDigits(rawText);

  // Check for full 13-digit CNIC sequences
  const fullCnicRegex = /\b(\d{5})[- ]?(\d{7})[- ]?(\d)\b/g;
  let hasFullCnicLeak = false;
  let last4: string | undefined = undefined;

  let match: RegExpExecArray | null;
  while ((match = fullCnicRegex.exec(normalized)) !== null) {
    hasFullCnicLeak = true;
    const full13 = match[1] + match[2] + match[3];
    // Last 4 digits are characters 9 through 12 (0-indexed)
    last4 = full13.slice(-4);
  }

  // Also check if isolated 4 digits were extracted directly (e.g. from masked crop)
  if (!last4) {
    const isolated4Match = /\b\d{4}\b/.exec(normalized);
    if (isolated4Match) {
      last4 = isolated4Match[0];
    }
  }

  // Completely sanitize and redact any full 13-digit pattern from the text
  const sanitizedText = normalized.replace(
    /\b\d{5}[- ]?\d{7}[- ]?\d\b/g,
    "[REDACTED_CNIC]"
  );

  return {
    last4,
    hasFullCnicLeak,
    sanitizedText,
  };
}

/**
 * Extracts a candidate area/locality from an address string.
 */
export function extractCandidateArea(address: string): string | undefined {
  const normalized = transliterateUrduToEnglish(address);
  const cities = [
    "Islamabad",
    "Lahore",
    "Karachi",
    "Rawalpindi",
    "Faisalabad",
    "Multan",
    "Peshawar",
    "Quetta",
    "Sialkot",
    "Gujranwala",
    "Hyderabad",
    "Bahawalpur",
    "Sargodha",
    "Abbottabad",
    "Mardan",
  ];

  for (const city of cities) {
    const regex = new RegExp(`\\b${city}\\b`, "i");
    if (regex.test(normalized)) {
      return city;
    }
  }

  return undefined;
}

