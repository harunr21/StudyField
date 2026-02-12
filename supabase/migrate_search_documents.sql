-- =============================================
-- Optional Search Documents Migration
-- Supabase SQL Editor'da calistirin.
-- =============================================

CREATE TABLE IF NOT EXISTS search_documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(body, '')), 'B')
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT search_documents_source_type_check CHECK (
    source_type IN ('page', 'youtube_video', 'youtube_note', 'pdf_document', 'pdf_note')
  ),
  CONSTRAINT search_documents_unique_source UNIQUE (user_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_search_documents_user_source
ON search_documents(user_id, source_type);

CREATE INDEX IF NOT EXISTS idx_search_documents_vector
ON search_documents USING GIN (search_vector);

ALTER TABLE search_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own search documents"
    ON search_documents FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own search documents"
    ON search_documents FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own search documents"
    ON search_documents FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own search documents"
    ON search_documents FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS update_search_documents_updated_at ON search_documents;
CREATE TRIGGER update_search_documents_updated_at
  BEFORE UPDATE ON search_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION refresh_search_documents(target_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  inserted_count INTEGER := 0;
  affected_count INTEGER := 0;
BEGIN
  IF target_user_id IS NULL THEN
    DELETE FROM search_documents;
  ELSE
    DELETE FROM search_documents WHERE user_id = target_user_id;
  END IF;

  INSERT INTO search_documents (user_id, source_type, source_id, title, body)
  SELECT p.user_id, 'page', p.id, COALESCE(p.title, ''), COALESCE(p.content::text, '')
  FROM pages p
  WHERE target_user_id IS NULL OR p.user_id = target_user_id;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  inserted_count := inserted_count + affected_count;

  INSERT INTO search_documents (user_id, source_type, source_id, title, body)
  SELECT y.user_id, 'youtube_video', y.id, COALESCE(y.title, ''), ''
  FROM youtube_videos y
  WHERE target_user_id IS NULL OR y.user_id = target_user_id;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  inserted_count := inserted_count + affected_count;

  INSERT INTO search_documents (user_id, source_type, source_id, title, body)
  SELECT n.user_id, 'youtube_note', n.id, '', COALESCE(n.content, '')
  FROM youtube_video_notes n
  WHERE target_user_id IS NULL OR n.user_id = target_user_id;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  inserted_count := inserted_count + affected_count;

  INSERT INTO search_documents (user_id, source_type, source_id, title, body)
  SELECT d.user_id, 'pdf_document', d.id, COALESCE(d.title, ''), ''
  FROM pdf_documents d
  WHERE target_user_id IS NULL OR d.user_id = target_user_id;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  inserted_count := inserted_count + affected_count;

  INSERT INTO search_documents (user_id, source_type, source_id, title, body)
  SELECT n.user_id, 'pdf_note', n.id, '', COALESCE(n.content, '')
  FROM pdf_notes n
  WHERE target_user_id IS NULL OR n.user_id = target_user_id;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  inserted_count := inserted_count + affected_count;
  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
