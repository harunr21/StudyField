-- =============================================
-- Search Full-Text Search (FTS) Migration
-- Supabase SQL Editor'da calistirin.
-- =============================================

-- YOUTUBE VIDEOS
ALTER TABLE youtube_videos
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', COALESCE(title, '')), 'A')
) STORED;

CREATE INDEX IF NOT EXISTS idx_youtube_videos_search_vector
ON youtube_videos USING GIN (search_vector);

-- YOUTUBE VIDEO NOTES
ALTER TABLE youtube_video_notes
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', COALESCE(content, '')), 'A')
) STORED;

CREATE INDEX IF NOT EXISTS idx_youtube_video_notes_search_vector
ON youtube_video_notes USING GIN (search_vector);
