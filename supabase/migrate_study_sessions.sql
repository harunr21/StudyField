-- =============================================
-- Study Sessions Migration
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
-- STUDY SESSIONS TABLE
-- Kullanici odak seanslari (manual + pomodoro)
-- =============================================
CREATE TABLE IF NOT EXISTS study_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_ref_id UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  planned_duration_seconds INTEGER,
  focus_score SMALLINT,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT study_sessions_source_type_check CHECK (source_type IN ('manual', 'pomodoro', 'youtube', 'pdf', 'notes')),
  CONSTRAINT study_sessions_duration_check CHECK (duration_seconds >= 0),
  CONSTRAINT study_sessions_planned_duration_check CHECK (planned_duration_seconds IS NULL OR planned_duration_seconds > 0),
  CONSTRAINT study_sessions_focus_score_check CHECK (focus_score IS NULL OR (focus_score >= 1 AND focus_score <= 5))
);

CREATE INDEX IF NOT EXISTS idx_study_sessions_user_started ON study_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_sessions_active ON study_sessions(user_id, ended_at);

-- RLS
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own study sessions"
    ON study_sessions FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own study sessions"
    ON study_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own study sessions"
    ON study_sessions FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own study sessions"
    ON study_sessions FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS update_study_sessions_updated_at ON study_sessions;
CREATE TRIGGER update_study_sessions_updated_at
  BEFORE UPDATE ON study_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
