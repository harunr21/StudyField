#!/usr/bin/env node
/**
 * Supabase (Postgres) verisini JSON olarak disa aktarir.
 *
 * Kullanim:
 *   SUPABASE_DB_URL="postgresql://postgres:<sifre>@db.<ref>.supabase.co:5432/postgres" \
 *   npm run migrate:export-supabase
 *
 * Baglanti adresini Supabase Dashboard > Project Settings > Database > Connection string
 * bolumunden alin (Direct connection, "postgres" kullanicisi). Bu script auth.users tablosunu da
 * okur; bu yuzden anon key degil, veritabani sifresi gerekir.
 *
 * Cikti: scripts/out/supabase-export.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "out");
const outFile = join(outDir, "supabase-export.json");

const url = process.env.SUPABASE_DB_URL;
if (!url) {
    console.error("SUPABASE_DB_URL ortam degiskeni gerekli.");
    process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

async function rows(sql) {
    const res = await client.query(sql);
    return res.rows;
}

console.log("auth.users okunuyor...");
const users = await rows(`
  SELECT id, email, encrypted_password, created_at, updated_at
  FROM auth.users
  WHERE email IS NOT NULL
  ORDER BY created_at
`);

console.log("profiles...");
const profiles = await rows(`SELECT user_id, username, display_name, created_at, updated_at FROM public.profiles`);

console.log("friendships...");
const friendships = await rows(
    `SELECT id, requester_id, addressee_id, status, created_at, updated_at FROM public.friendships`,
);

console.log("youtube_playlists...");
const playlists = await rows(`
  SELECT id, user_id, playlist_id, title, description, thumbnail_url, channel_title, video_count,
         COALESCE(is_shared, TRUE) AS is_shared, COALESCE(tags, '{}') AS tags, created_at, updated_at
  FROM public.youtube_playlists
`);

console.log("youtube_videos...");
const videos = await rows(`
  SELECT id, user_id, playlist_ref_id, video_id, title, description, thumbnail_url, channel_title,
         duration, position, is_watched, watched_at, created_at, updated_at
  FROM public.youtube_videos
`);

console.log("youtube_video_notes...");
const notes = await rows(`
  SELECT id, user_id, video_ref_id, timestamp_seconds, content, created_at, updated_at
  FROM public.youtube_video_notes
`);

await client.end();

mkdirSync(outDir, { recursive: true });
writeFileSync(
    outFile,
    JSON.stringify({ exportedAt: new Date().toISOString(), users, profiles, friendships, playlists, videos, notes }, null, 2),
);

console.log(`\nTamamlandi -> ${outFile}`);
console.log(
    `  users=${users.length} profiles=${profiles.length} friendships=${friendships.length} playlists=${playlists.length} videos=${videos.length} notes=${notes.length}`,
);
