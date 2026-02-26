-- Remove deprecated modules/fields: pages, pdf, editor-related settings, AI settings.

-- User settings cleanup
ALTER TABLE IF EXISTS public.user_settings
  DROP COLUMN IF EXISTS default_note_icon,
  DROP COLUMN IF EXISTS gemini_api_key,
  DROP COLUMN IF EXISTS gemini_model;

-- Optional search_documents cleanup (keep table, restrict to YouTube sources)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'search_documents'
  ) THEN
    DELETE FROM public.search_documents
    WHERE source_type IN ('page', 'pdf_document', 'pdf_note');

    ALTER TABLE public.search_documents
      DROP CONSTRAINT IF EXISTS search_documents_source_type_check;

    ALTER TABLE public.search_documents
      ADD CONSTRAINT search_documents_source_type_check
      CHECK (source_type IN ('youtube_video', 'youtube_note'));
  END IF;
END $$;

-- Rebuild refresh function without page/pdf sources
CREATE OR REPLACE FUNCTION public.refresh_search_documents(target_user_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  inserted_count INTEGER := 0;
  affected_count INTEGER := 0;
BEGIN
  IF target_user_id IS NULL THEN
    DELETE FROM public.search_documents;
  ELSE
    DELETE FROM public.search_documents WHERE user_id = target_user_id;
  END IF;

  INSERT INTO public.search_documents (user_id, source_type, source_id, title, body)
  SELECT y.user_id, 'youtube_video', y.id, COALESCE(y.title, ''), ''
  FROM public.youtube_videos y
  WHERE target_user_id IS NULL OR y.user_id = target_user_id;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  inserted_count := inserted_count + affected_count;

  INSERT INTO public.search_documents (user_id, source_type, source_id, title, body)
  SELECT n.user_id, 'youtube_note', n.id, '', COALESCE(n.content, '')
  FROM public.youtube_video_notes n
  WHERE target_user_id IS NULL OR n.user_id = target_user_id;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  inserted_count := inserted_count + affected_count;

  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop deprecated tables
DROP TABLE IF EXISTS public.pdf_notes CASCADE;
DROP TABLE IF EXISTS public.pdf_documents CASCADE;
DROP TABLE IF EXISTS public.pages CASCADE;

-- Remove legacy FTS helper functions if they exist
DROP FUNCTION IF EXISTS public.pages_search_vector_trigger();
DROP FUNCTION IF EXISTS public.pdf_documents_search_vector_trigger();
DROP FUNCTION IF EXISTS public.pdf_notes_search_vector_trigger();
DROP FUNCTION IF EXISTS public.extract_text_from_json(jsonb);
