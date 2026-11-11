import type { IOcrProvider, ImageCropBuffers, OcrExtractionResult } from "./types";
import {
  detectScript,
  extractCandidateArea,
  extractCnicLast4AndRedact,
  transliterateUrduToEnglish,
} from "./sanitizer";

/**
 * Default fallback provider when no external OCR provider is configured or available.
 * Fulfills requirement: manual entry is a first-class citizen and must not block registration.
 */
export class FallbackManualProvider implements IOcrProvider {
  name = "manual_fallback";

  isAvailable(): boolean {
    return false;
  }

  async extractFromCrops(): Promise<OcrExtractionResult> {
    return {
      status: "manual_entry_required",
    };
  }
}

/**
 * Mock / Synthetic OCR Provider for automated test suites and local verification.
 */
export class SyntheticOcrProvider implements IOcrProvider {
  name = "synthetic_provider";

  constructor(
    private mockData?: Partial<OcrExtractionResult>,
    private forceFailure = false
  ) {}

  isAvailable(): boolean {
    return !this.forceFailure;
  }

  async extractFromCrops(crops: ImageCropBuffers): Promise<OcrExtractionResult> {
    if (this.forceFailure || !crops.name_crop || !crops.number_crop_masked) {
      return { status: "manual_entry_required" };
    }

    if (this.mockData) {
      // Discard any raw provider leak of full CNIC
      const rawCnic = this.mockData.cnic_last4 ?? "";
      const { last4 } = extractCnicLast4AndRedact(rawCnic);

      return {
        status: this.mockData.status ?? "success",
        full_name_en: this.mockData.full_name_en ?? "Muhammad Ali",
        cnic_last4: last4 ?? "1234",
        address_en: this.mockData.address_en ?? "House 12, Street 3, Sector G-9/1, Islamabad",
        area_en: this.mockData.area_en ?? "Islamabad",
        confidence: this.mockData.confidence ?? {
          name: 0.95,
          cnic: 0.92,
          address: 0.88,
          overall: 0.91,
        },
        script_detected: this.mockData.script_detected ?? "english",
        needs_review: this.mockData.needs_review ?? false,
      };
    }

    // Default synthetic extraction
    return {
      status: "success",
      full_name_en: "Muhammad Ali",
      cnic_last4: "4321",
      address_en: "Street 4, Sector F-8, Islamabad",
      area_en: "Islamabad",
      confidence: {
        name: 0.95,
        cnic: 0.95,
        address: 0.9,
        overall: 0.93,
      },
      script_detected: "english",
      needs_review: false,
    };
  }
}

/**
 * Production Configurable OCR Provider.
 * Inspects process.env.OCR_PROVIDER, OCR_API_KEY, OCR_MODEL.
 * Discards any full CNIC pattern from external response immediately.
 */
export class ConfiguredOcrProvider implements IOcrProvider {
  name: string;
  private apiKey?: string;
  private model?: string;

  constructor() {
    this.name = process.env.OCR_PROVIDER ?? "none";
    this.apiKey = process.env.OCR_API_KEY;
    this.model = process.env.OCR_MODEL;
  }

  isAvailable(): boolean {
    return Boolean(this.name && this.name !== "none" && this.apiKey);
  }

  async extractFromCrops(crops: ImageCropBuffers): Promise<OcrExtractionResult> {
    if (!this.isAvailable()) {
      return { status: "manual_entry_required" };
    }

    if (!crops.name_crop || !crops.number_crop_masked || !crops.address_crop) {
      return { status: "manual_entry_required" };
    }

    try {
      // In production, crops are transmitted to the vetted external vision endpoint.
      // Below is the response ingestion and strict minimization parser:
      const rawResponse = await this.callExternalProvider(crops);

      if (!rawResponse || !rawResponse.success) {
        return { status: "manual_entry_required" };
      }

      // 1. Process CNIC number line: strictly extract last 4 and sanitize
      const { last4 } = extractCnicLast4AndRedact(rawResponse.raw_number_text ?? "");

      // 2. Transliterate Urdu text if detected
      const script = detectScript(`${rawResponse.raw_name_text} ${rawResponse.raw_address_text}`);
      const fullNameEn = transliterateUrduToEnglish(rawResponse.raw_name_text ?? "");
      const addressEn = transliterateUrduToEnglish(rawResponse.raw_address_text ?? "");
      const areaEn = extractCandidateArea(addressEn);

      const nameConf = rawResponse.name_confidence ?? 0.8;
      const cnicConf = rawResponse.cnic_confidence ?? 0.8;
      const addrConf = rawResponse.address_confidence ?? 0.8;
      const overallConf = (nameConf + cnicConf + addrConf) / 3;

      const needsReview = overallConf < 0.85 || !last4 || !fullNameEn;

      return {
        status: "success",
        full_name_en: fullNameEn,
        cnic_last4: last4,
        address_en: addressEn,
        area_en: areaEn,
        confidence: {
          name: nameConf,
          cnic: cnicConf,
          address: addrConf,
          overall: overallConf,
        },
        script_detected: script,
        needs_review: needsReview,
      };
    } catch {
      // Any provider error safely falls back to manual entry
      return { status: "manual_entry_required" };
    }
  }

  private async callExternalProvider(crops: ImageCropBuffers): Promise<{
    success: boolean;
    raw_name_text?: string;
    raw_number_text?: string;
    raw_address_text?: string;
    name_confidence?: number;
    cnic_confidence?: number;
    address_confidence?: number;
  }> {
    void crops;
    // Stub for external provider call adhering to the configured provider API
    // Must strictly send only cropped and masked image buffers, never full CNIC photo
    return {
      success: false,
    };
  }
}

/**
 * Returns the currently active OCR provider based on environment configuration.
 */
export function getOcrProvider(): IOcrProvider {
  if (process.env.NODE_ENV === "test" || process.env.TEST_OCR_MOCK === "true") {
    return new SyntheticOcrProvider();
  }

  const configured = new ConfiguredOcrProvider();
  if (configured.isAvailable()) {
    return configured;
  }

  return new FallbackManualProvider();
}
