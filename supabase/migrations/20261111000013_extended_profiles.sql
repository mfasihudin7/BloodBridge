-- Migration: 20261111000013_extended_profiles.sql
-- Description: Add extended demographic and medical profile fields proposed for mobile onboarding
-- Status: PROPOSED / UNAPPLIED (Preserving existing hosted Supabase database stability)

ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC,
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS health_conditions TEXT[];

COMMENT ON COLUMN profiles.date_of_birth IS 'User date of birth for donor eligibility calculation (18-65).';
COMMENT ON COLUMN profiles.city IS 'Primary residential city for geographic clustering.';
COMMENT ON COLUMN profiles.area IS 'Neighborhood / locality for localized blood drives.';

