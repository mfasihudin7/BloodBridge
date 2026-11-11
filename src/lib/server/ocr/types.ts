/**
 * CNIC OCR & Intelligence Type Definitions (Phase 1)
 */

export type ScriptType = "urdu" | "english" | "mixed";

export interface OcrFieldConfidence {
  name: number;
  cnic: number;
  address: number;
  overall: number;
}

export interface OcrExtractionResult {
  status: "success" | "manual_entry_required";
  full_name_en?: string;
  cnic_last4?: string;
  address_en?: string;
  area_en?: string;
  confidence?: OcrFieldConfidence;
  script_detected?: ScriptType;
  needs_review?: boolean;
  error?: string;
}

export interface ImageCropBuffers {
  name_crop?: Buffer;
  address_crop?: Buffer;
  number_crop_masked?: Buffer;
}

export interface IOcrProvider {
  name: string;
  isAvailable(): boolean;
  extractFromCrops(crops: ImageCropBuffers): Promise<OcrExtractionResult>;
}

