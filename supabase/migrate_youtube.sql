-- =============================================
-- YouTube Tabloları Migration
-- Bu SQL'i Supabase SQL Editor'da çalıştırın:
-- Dashboard -> SQL Editor -> New Query -> Yapıştır -> Run
-- =============================================

-- Enable UUID extension (zaten varsa hata vermez)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- updated_at trigger fonksiyonu (zaten varsa hata vermez)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- =============================================
-- YOUTUBE PLAYLISTS TABLE
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

-- RLS
ALTER TABLE youtube_playlists ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own playlists"
    ON youtube_playlists FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own playlists"
    ON youtube_playlists FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own playlists"
    ON youtube_playlists FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own playlists"
    ON youtube_playlists FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS update_youtube_playlists_updated_at ON youtube_playlists;
CREATE TRIGGER update_youtube_playlists_updated_at
  BEFORE UPDATE ON youtube_playlists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- YOUTUBE VIDEOS TABLE
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

-- RLS
ALTER TABLE youtube_videos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own videos"
    ON youtube_videos FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own videos"
    ON youtube_videos FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own videos"
    ON youtube_videos FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own videos"
    ON youtube_videos FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS update_youtube_videos_updated_at ON youtube_videos;
CREATE TRIGGER update_youtube_videos_updated_at
  BEFORE UPDATE ON youtube_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- YOUTUBE VIDEO NOTES TABLE
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

-- RLS
ALTER TABLE youtube_video_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own video notes"
    ON youtube_video_notes FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own video notes"
    ON youtube_video_notes FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own video notes"
    ON youtube_video_notes FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own video notes"
    ON youtube_video_notes FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS update_youtube_video_notes_updated_at ON youtube_video_notes;
CREATE TRIGGER update_youtube_video_notes_updated_at
  BEFORE UPDATE ON youtube_video_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- REALTIME (hata verirse aşağıdakileri teker teker çalıştırın)
-- =============================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE youtube_playlists;
-- ALTER PUBLICATION supabase_realtime ADD TABLE youtube_videos;
-- ALTER PUBLICATION supabase_realtime ADD TABLE youtube_video_notes;
