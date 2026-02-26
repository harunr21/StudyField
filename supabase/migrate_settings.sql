-- =============================================
-- User Settings Migration
-- Supabase SQL Editor'da calistirin.
-- =============================================

-- updated_at trigger function (zaten varsa hata vermez)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- =============================================
-- USER SETTINGS TABLE
-- Her kullanici icin tek satir ayar kaydi
-- =============================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system',
  language TEXT NOT NULL DEFAULT 'tr',
  default_note_icon TEXT NOT NULL DEFAULT '📝',
  week_starts_on SMALLINT NOT NULL DEFAULT 1,
  daily_goal_minutes INTEGER NOT NULL DEFAULT 120,
  gemini_api_key TEXT,
  gemini_model TEXT NOT NULL DEFAULT 'gemini-3-flash',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_settings_theme_check CHECK (theme IN ('light', 'dark', 'system')),
  CONSTRAINT user_settings_language_check CHECK (language IN ('tr', 'en')),
  CONSTRAINT user_settings_week_start_check CHECK (week_starts_on IN (0, 1)),
  CONSTRAINT user_settings_daily_goal_check CHECK (daily_goal_minutes BETWEEN 15 AND 1440)
);

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS gemini_model TEXT NOT NULL DEFAULT 'gemini-3-flash';

CREATE INDEX IF NOT EXISTS idx_user_settings_updated_at ON user_settings(updated_at DESC);

-- RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own settings"
    ON user_settings FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own settings"
    ON user_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own settings"
    ON user_settings FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own settings"
    ON user_settings FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
