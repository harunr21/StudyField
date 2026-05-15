-- Tags kolonu youtube_playlists tablosuna ekleniyor
ALTER TABLE public.youtube_playlists
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- GIN indeksi: tags dizisi üzerinde hızlı filtreleme için
CREATE INDEX IF NOT EXISTS idx_youtube_playlists_tags
  ON public.youtube_playlists USING GIN(tags);
