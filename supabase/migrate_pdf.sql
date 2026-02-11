-- =============================================
-- PDF Tabloları Migration
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
-- PDF DOCUMENTS TABLE
-- Kullanıcıların yüklediği PDF dökümanlarını saklar
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

-- RLS
ALTER TABLE pdf_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own pdf documents"
    ON pdf_documents FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own pdf documents"
    ON pdf_documents FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own pdf documents"
    ON pdf_documents FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own pdf documents"
    ON pdf_documents FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS update_pdf_documents_updated_at ON pdf_documents;
CREATE TRIGGER update_pdf_documents_updated_at
  BEFORE UPDATE ON pdf_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- PDF NOTES TABLE
-- PDF sayfalarına bağlı notları saklar
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

-- RLS
ALTER TABLE pdf_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own pdf notes"
    ON pdf_notes FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own pdf notes"
    ON pdf_notes FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own pdf notes"
    ON pdf_notes FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own pdf notes"
    ON pdf_notes FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS update_pdf_notes_updated_at ON pdf_notes;
CREATE TRIGGER update_pdf_notes_updated_at
  BEFORE UPDATE ON pdf_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- REALTIME (hata verirse aşağıdakileri teker teker çalıştırın)
-- =============================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE pdf_documents;
-- ALTER PUBLICATION supabase_realtime ADD TABLE pdf_notes;

-- =============================================
-- STORAGE BUCKET
-- Supabase Dashboard'dan manuel oluşturmanız gerekir:
-- 1. Storage -> New Bucket -> "pdfs"
-- 2. Public: ON (veya ihtiyacınıza göre)
-- 3. Allowed MIME types: application/pdf
-- 4. Max file size: 50MB
--
-- Storage RLS Policy (SQL Editor'da çalıştırın):
-- =============================================

-- Storage üzerinden dosya yükleme politikası
-- NOT: Bu politikalar storage.objects tablosu üzerinde çalışır
-- Supabase Dashboard -> Storage -> Policies bölümünden de ekleyebilirsiniz

-- Kullanıcılar kendi klasörlerine yükleyebilir
-- INSERT politikası:
-- CREATE POLICY "Users can upload pdfs to their folder"
--   ON storage.objects FOR INSERT
--   WITH CHECK (
--     bucket_id = 'pdfs'
--     AND auth.uid()::text = (storage.foldername(name))[1]
--   );

-- Kullanıcılar kendi dosyalarını okuyabilir (public bucket ise gerek yok)
-- SELECT politikası:
-- CREATE POLICY "Users can read own pdfs"
--   ON storage.objects FOR SELECT
--   USING (
--     bucket_id = 'pdfs'
--     AND auth.uid()::text = (storage.foldername(name))[1]
--   );

-- Kullanıcılar kendi dosyalarını silebilir
-- DELETE politikası:
-- CREATE POLICY "Users can delete own pdfs"
--   ON storage.objects FOR DELETE
--   USING (
--     bucket_id = 'pdfs'
--     AND auth.uid()::text = (storage.foldername(name))[1]
--   );
