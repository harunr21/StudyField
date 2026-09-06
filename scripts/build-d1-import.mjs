#!/usr/bin/env node
/**
 * scripts/out/supabase-export.json dosyasini D1'e uygun SQL'e cevirir.
 *
 * Kullanim:
 *   npm run migrate:build-import
 *   npx wrangler d1 execute studyfield-db --remote --file=scripts/out/d1-import.sql
 *   (yerelde denemek icin --local)
 *
 * Notlar:
 * - Kullanici id'leri Supabase'deki UUID'lerle birebir korunur; bu sayede tum iliskiler ayni kalir.
 * - Sifreler Supabase'in bcrypt hash'i ile tasinir. Kullanici ilk girisinde ayni sifreyle giris yapar,
 *   hash arka planda PBKDF2'ye donusturulur.
 * - Sifresi olmayan (sadece OAuth ile kaydolmus) kullanicilar icin rastgele, kullanilamaz bir hash yazilir;
 *   bu kullanicilarin yeniden kayit olmasi gerekir (ayni e-posta ile kayit engellenir, once satiri silin).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const inFile = join(__dirname, "out", "supabase-export.json");
const outFile = join(__dirname, "out", "d1-import.sql");

const data = JSON.parse(readFileSync(inFile, "utf8"));

function q(value) {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "1" : "0";
    if (value instanceof Date) return `'${value.toISOString()}'`;
    if (Array.isArray(value)) return q(JSON.stringify(value));
    return `'${String(value).replace(/'/g, "''")}'`;
}

function ts(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const lines = [];
lines.push("-- Supabase -> D1 veri aktarimi. Uretim: scripts/build-d1-import.mjs");
lines.push("PRAGMA foreign_keys = ON;");

const userIds = new Set();
for (const u of data.users) {
    userIds.add(u.id);
    const hash = u.encrypted_password && u.encrypted_password.startsWith("$2")
        ? u.encrypted_password
        : `unusable$${randomBytes(24).toString("hex")}`;
    lines.push(
        `INSERT OR IGNORE INTO users (id, email, password_hash, created_at, updated_at) VALUES (${q(u.id)}, ${q(
            String(u.email).toLowerCase(),
        )}, ${q(hash)}, ${q(ts(u.created_at) ?? new Date().toISOString())}, ${q(ts(u.updated_at) ?? new Date().toISOString())});`,
    );
}

for (const p of data.profiles) {
    if (!userIds.has(p.user_id)) continue;
    lines.push(
        `INSERT OR IGNORE INTO profiles (user_id, username, display_name, created_at, updated_at) VALUES (${q(p.user_id)}, ${q(
            p.username,
        )}, ${q(p.display_name ?? "")}, ${q(ts(p.created_at))}, ${q(ts(p.updated_at))});`,
    );
}

for (const f of data.friendships) {
    if (!userIds.has(f.requester_id) || !userIds.has(f.addressee_id)) continue;
    lines.push(
        `INSERT OR IGNORE INTO friendships (id, requester_id, addressee_id, status, created_at, updated_at) VALUES (${q(
            f.id,
        )}, ${q(f.requester_id)}, ${q(f.addressee_id)}, ${q(f.status)}, ${q(ts(f.created_at))}, ${q(ts(f.updated_at))});`,
    );
}

const playlistIds = new Set();
for (const p of data.playlists) {
    if (!userIds.has(p.user_id)) continue;
    playlistIds.add(p.id);
    lines.push(
        `INSERT OR IGNORE INTO youtube_playlists (id, user_id, playlist_id, title, description, thumbnail_url, channel_title, video_count, is_shared, tags, created_at, updated_at) VALUES (${q(
            p.id,
        )}, ${q(p.user_id)}, ${q(p.playlist_id)}, ${q(p.title)}, ${q(p.description ?? "")}, ${q(p.thumbnail_url ?? "")}, ${q(
            p.channel_title ?? "",
        )}, ${q(p.video_count ?? 0)}, ${q(Boolean(p.is_shared))}, ${q(Array.isArray(p.tags) ? p.tags : [])}, ${q(
            ts(p.created_at),
        )}, ${q(ts(p.updated_at))});`,
    );
}

const videoIds = new Set();
for (const v of data.videos) {
    if (!userIds.has(v.user_id) || !playlistIds.has(v.playlist_ref_id)) continue;
    videoIds.add(v.id);
    lines.push(
        `INSERT OR IGNORE INTO youtube_videos (id, user_id, playlist_ref_id, video_id, title, description, thumbnail_url, channel_title, duration, position, is_watched, watched_at, created_at, updated_at) VALUES (${q(
            v.id,
        )}, ${q(v.user_id)}, ${q(v.playlist_ref_id)}, ${q(v.video_id)}, ${q(v.title)}, ${q(v.description ?? "")}, ${q(
            v.thumbnail_url ?? "",
        )}, ${q(v.channel_title ?? "")}, ${q(v.duration ?? "")}, ${q(v.position ?? 0)}, ${q(Boolean(v.is_watched))}, ${q(
            ts(v.watched_at),
        )}, ${q(ts(v.created_at))}, ${q(ts(v.updated_at))});`,
    );
}

for (const n of data.notes) {
    if (!userIds.has(n.user_id) || !videoIds.has(n.video_ref_id)) continue;
    lines.push(
        `INSERT OR IGNORE INTO youtube_video_notes (id, user_id, video_ref_id, timestamp_seconds, content, created_at, updated_at) VALUES (${q(
            n.id,
        )}, ${q(n.user_id)}, ${q(n.video_ref_id)}, ${q(n.timestamp_seconds ?? 0)}, ${q(n.content ?? "")}, ${q(
            ts(n.created_at),
        )}, ${q(ts(n.updated_at))});`,
    );
}

writeFileSync(outFile, lines.join("\n") + "\n");
console.log(`Yazildi -> ${outFile} (${lines.length - 2} INSERT)`);
console.log("Uygulamak icin: npx wrangler d1 execute studyfield-db --remote --file=scripts/out/d1-import.sql");
