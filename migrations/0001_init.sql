-- StudyField D1 baslangic semasi.
-- Uygulamak icin: npx wrangler d1 migrations apply studyfield-db --local  (yerel)
--                 npx wrangler d1 migrations apply studyfield-db --remote (uretim)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE CHECK (username GLOB '[a-z0-9_]*' AND length(username) BETWEEN 3 AND 30),
  display_name TEXT NOT NULL DEFAULT '' CHECK (length(display_name) <= 60),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (requester_id <> addressee_id)
);
-- Her (sirasiz) kullanici cifti icin tek satir.
CREATE UNIQUE INDEX IF NOT EXISTS uq_friendships_pair
  ON friendships(min(requester_id, addressee_id), max(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);

CREATE TABLE IF NOT EXISTS youtube_playlists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  playlist_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL DEFAULT '',
  channel_title TEXT NOT NULL DEFAULT '',
  video_count INTEGER NOT NULL DEFAULT 0,
  is_shared INTEGER NOT NULL DEFAULT 1,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_youtube_playlists_user ON youtube_playlists(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_youtube_playlists_user_playlist ON youtube_playlists(user_id, playlist_id);

CREATE TABLE IF NOT EXISTS youtube_videos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  playlist_ref_id TEXT NOT NULL REFERENCES youtube_playlists(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL DEFAULT '',
  channel_title TEXT NOT NULL DEFAULT '',
  duration TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  is_watched INTEGER NOT NULL DEFAULT 0,
  watched_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_youtube_videos_user ON youtube_videos(user_id);
CREATE INDEX IF NOT EXISTS idx_youtube_videos_playlist ON youtube_videos(playlist_ref_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_youtube_videos_user_playlist_video ON youtube_videos(user_id, playlist_ref_id, video_id);

CREATE TABLE IF NOT EXISTS youtube_video_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_ref_id TEXT NOT NULL REFERENCES youtube_videos(id) ON DELETE CASCADE,
  timestamp_seconds INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_youtube_video_notes_video ON youtube_video_notes(video_ref_id);
CREATE INDEX IF NOT EXISTS idx_youtube_video_notes_user ON youtube_video_notes(user_id);
