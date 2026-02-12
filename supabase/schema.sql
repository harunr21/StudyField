-- =============================================
-- StudyField Database Schema
-- Run this SQL in your Supabase SQL Editor
-- (Dashboard -> SQL Editor -> New Query)
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PAGES TABLE
-- Stores the hierarchy of notes/pages
-- =============================================
CREATE TABLE IF NOT EXISTS pages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Başlıksız',
  icon TEXT DEFAULT '📄',
  parent_id UUID REFERENCES pages(id) ON DELETE SET NULL,
  content JSONB DEFAULT '{}',
  is_archived BOOLEAN DEFAULT false,
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_pages_user_id ON pages(user_id);
CREATE INDEX IF NOT EXISTS idx_pages_parent_id ON pages(parent_id);
CREATE INDEX IF NOT EXISTS idx_pages_updated_at ON pages(updated_at DESC);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- Only the owner can access their own pages
-- =============================================
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pages"
  ON pages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own pages"
  ON pages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pages"
  ON pages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pages"
  ON pages FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- UPDATED_AT TRIGGER
-- Automatically update updated_at on changes
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_pages_updated_at
  BEFORE UPDATE ON pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- REALTIME
-- Enable realtime for pages table
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE pages;

-- =============================================
-- YOUTUBE PLAYLISTS TABLE
-- Stores YouTube playlists added by users
-- =============================================
CREATE TABLE IF NOT EXISTS youtube_playlists (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playlist_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  thumbnail_url TEXT DEFAULT '',
  channel_title TEXT DEFAULT '',
  video_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, playlist_id)
);

CREATE INDEX IF NOT EXISTS idx_youtube_playlists_user_id ON youtube_playlists(user_id);

-- RLS for youtube_playlists
ALTER TABLE youtube_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own playlists"
  ON youtube_playlists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own playlists"
  ON youtube_playlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own playlists"
  ON youtube_playlists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own playlists"
  ON youtube_playlists FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_youtube_playlists_updated_at
  BEFORE UPDATE ON youtube_playlists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- YOUTUBE VIDEOS TABLE
-- Stores individual videos within playlists
-- =============================================
CREATE TABLE IF NOT EXISTS youtube_videos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playlist_ref_id UUID NOT NULL REFERENCES youtube_playlists(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  thumbnail_url TEXT DEFAULT '',
  channel_title TEXT DEFAULT '',
  duration TEXT DEFAULT '',
  position INTEGER DEFAULT 0,
  is_watched BOOLEAN DEFAULT false,
  watched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, playlist_ref_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_youtube_videos_user_id ON youtube_videos(user_id);
CREATE INDEX IF NOT EXISTS idx_youtube_videos_playlist ON youtube_videos(playlist_ref_id);

-- RLS for youtube_videos
ALTER TABLE youtube_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own videos"
  ON youtube_videos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own videos"
  ON youtube_videos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own videos"
  ON youtube_videos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own videos"
  ON youtube_videos FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_youtube_videos_updated_at
  BEFORE UPDATE ON youtube_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- YOUTUBE VIDEO NOTES TABLE
-- Stores timestamped notes for videos
-- =============================================
CREATE TABLE IF NOT EXISTS youtube_video_notes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_ref_id UUID NOT NULL REFERENCES youtube_videos(id) ON DELETE CASCADE,
  timestamp_seconds INTEGER DEFAULT 0,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_youtube_video_notes_video ON youtube_video_notes(video_ref_id);
CREATE INDEX IF NOT EXISTS idx_youtube_video_notes_user ON youtube_video_notes(user_id);

-- RLS for youtube_video_notes
ALTER TABLE youtube_video_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own video notes"
  ON youtube_video_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own video notes"
  ON youtube_video_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own video notes"
  ON youtube_video_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own video notes"
  ON youtube_video_notes FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_youtube_video_notes_updated_at
  BEFORE UPDATE ON youtube_video_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime for YouTube tables
ALTER PUBLICATION supabase_realtime ADD TABLE youtube_playlists;
ALTER PUBLICATION supabase_realtime ADD TABLE youtube_videos;
ALTER PUBLICATION supabase_realtime ADD TABLE youtube_video_notes;

-- =============================================
-- PDF DOCUMENTS TABLE
-- Stores uploaded PDF documents
-- =============================================
CREATE TABLE IF NOT EXISTS pdf_documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  page_count INTEGER DEFAULT 0,
  is_favorite BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  last_page INTEGER DEFAULT 1,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_documents_user_id ON pdf_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_pdf_documents_updated_at ON pdf_documents(updated_at DESC);

-- RLS for pdf_documents
ALTER TABLE pdf_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pdf documents"
  ON pdf_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own pdf documents"
  ON pdf_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pdf documents"
  ON pdf_documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pdf documents"
  ON pdf_documents FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_pdf_documents_updated_at
  BEFORE UPDATE ON pdf_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- PDF NOTES TABLE
-- Stores page-based notes for PDF documents
-- =============================================
CREATE TABLE IF NOT EXISTS pdf_notes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pdf_ref_id UUID NOT NULL REFERENCES pdf_documents(id) ON DELETE CASCADE,
  page_number INTEGER DEFAULT 1,
  content TEXT NOT NULL DEFAULT '',
  color TEXT DEFAULT 'blue',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_notes_pdf ON pdf_notes(pdf_ref_id);
CREATE INDEX IF NOT EXISTS idx_pdf_notes_user ON pdf_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_pdf_notes_page ON pdf_notes(pdf_ref_id, page_number);

-- RLS for pdf_notes
ALTER TABLE pdf_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pdf notes"
  ON pdf_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own pdf notes"
  ON pdf_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pdf notes"
  ON pdf_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pdf notes"
  ON pdf_notes FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_pdf_notes_updated_at
  BEFORE UPDATE ON pdf_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime for PDF tables
ALTER PUBLICATION supabase_realtime ADD TABLE pdf_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE pdf_notes;

-- =============================================
-- USER SETTINGS TABLE
-- Stores per-user preferences
-- =============================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system',
  language TEXT NOT NULL DEFAULT 'tr',
  default_note_icon TEXT NOT NULL DEFAULT '📝',
  week_starts_on SMALLINT NOT NULL DEFAULT 1,
  daily_goal_minutes INTEGER NOT NULL DEFAULT 120,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (theme IN ('light', 'dark', 'system')),
  CHECK (language IN ('tr', 'en')),
  CHECK (week_starts_on IN (0, 1)),
  CHECK (daily_goal_minutes BETWEEN 15 AND 1440)
);

CREATE INDEX IF NOT EXISTS idx_user_settings_updated_at ON user_settings(updated_at DESC);

-- RLS for user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings"
  ON user_settings FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

