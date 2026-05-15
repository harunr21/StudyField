-- Friend system: profiles, friendships, playlist visibility.
-- Apply on top of the canonical schema.sql.

-- =============================================
-- 1. profiles
-- =============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (username ~ '^[a-z0-9_]{3,30}$'),
  CHECK (char_length(display_name) <= 60)
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
CREATE POLICY "Users can delete own profile"
  ON public.profiles FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 2. friendships (single row per relationship, pending/accepted)
-- =============================================
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (requester_id <> addressee_id),
  CHECK (status IN ('pending', 'accepted'))
);

-- One row per unordered pair.
CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_pair
  ON public.friendships (
    LEAST(requester_id, addressee_id),
    GREATEST(requester_id, addressee_id)
  );

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON public.friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON public.friendships(addressee_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view friendships" ON public.friendships;
CREATE POLICY "Participants can view friendships"
  ON public.friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS "Users can create friend requests" ON public.friendships;
CREATE POLICY "Users can create friend requests"
  ON public.friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id AND status = 'pending');

DROP POLICY IF EXISTS "Addressee can accept friend requests" ON public.friendships;
CREATE POLICY "Addressee can accept friend requests"
  ON public.friendships FOR UPDATE
  USING (auth.uid() = addressee_id AND status = 'pending')
  WITH CHECK (auth.uid() = addressee_id AND status = 'accepted');

DROP POLICY IF EXISTS "Participants can delete friendship" ON public.friendships;
CREATE POLICY "Participants can delete friendship"
  ON public.friendships FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP TRIGGER IF EXISTS update_friendships_updated_at ON public.friendships;
CREATE TRIGGER update_friendships_updated_at
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 3. Playlist visibility (per-playlist opt-out from friend sharing)
-- =============================================
ALTER TABLE public.youtube_playlists
  ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT TRUE;

-- =============================================
-- 4. Helper: are these two users accepted friends?
-- =============================================
CREATE OR REPLACE FUNCTION public.is_friend_of(other_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND (
        (requester_id = auth.uid() AND addressee_id = other_user_id)
        OR (addressee_id = auth.uid() AND requester_id = other_user_id)
      )
  );
$$ LANGUAGE sql STABLE;

-- =============================================
-- 5. Expand SELECT policies so friends can read shared playlists/videos.
--    Notes stay private (existing policy untouched).
-- =============================================
DROP POLICY IF EXISTS "Users can view own playlists" ON public.youtube_playlists;
DROP POLICY IF EXISTS "Users and friends can view playlists" ON public.youtube_playlists;
CREATE POLICY "Users and friends can view playlists"
  ON public.youtube_playlists FOR SELECT
  USING (
    auth.uid() = user_id
    OR (is_shared = TRUE AND public.is_friend_of(user_id))
  );

DROP POLICY IF EXISTS "Users can view own videos" ON public.youtube_videos;
DROP POLICY IF EXISTS "Users and friends can view videos" ON public.youtube_videos;
CREATE POLICY "Users and friends can view videos"
  ON public.youtube_videos FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.youtube_playlists p
      WHERE p.id = playlist_ref_id
        AND p.is_shared = TRUE
        AND public.is_friend_of(p.user_id)
    )
  );

-- Realtime publication for new tables (idempotent guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'friendships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;
