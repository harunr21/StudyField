-- =============================================
-- Search Full-Text Search (FTS) Migration
-- Supabase SQL Editor'da calistirin.
-- =============================================

-- PAGES
ALTER TABLE pages
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('simple', COALESCE(content::text, '')), 'B')
) STORED;

CREATE INDEX IF NOT EXISTS idx_pages_search_vector
ON pages USING GIN (search_vector);

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

-- PDF DOCUMENTS
ALTER TABLE pdf_documents
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', COALESCE(title, '')), 'A')
) STORED;

CREATE INDEX IF NOT EXISTS idx_pdf_documents_search_vector
ON pdf_documents USING GIN (search_vector);

-- PDF NOTES
ALTER TABLE pdf_notes
ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', COALESCE(content, '')), 'A')
) STORED;

CREATE INDEX IF NOT EXISTS idx_pdf_notes_search_vector
ON pdf_notes USING GIN (search_vector);
