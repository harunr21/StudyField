import "server-only";

import { and, eq, inArray, or, sql } from "drizzle-orm";
import { schema, type Database } from "@/db";
import { parseDurationToSeconds } from "@/lib/time";
import type { PlaylistStats, YoutubePlaylist } from "@/lib/types";

/** Iki kullanici kabul edilmis arkadas mi? */
export async function isFriend(db: Database, a: string, b: string): Promise<boolean> {
    if (a === b) return false;
    const row = await db
        .select({ id: schema.friendships.id })
        .from(schema.friendships)
        .where(
            and(
                eq(schema.friendships.status, "accepted"),
                or(
                    and(eq(schema.friendships.requester_id, a), eq(schema.friendships.addressee_id, b)),
                    and(eq(schema.friendships.requester_id, b), eq(schema.friendships.addressee_id, a)),
                ),
            ),
        )
        .limit(1);
    return row.length > 0;
}

/** Kabul edilmis arkadaslarin id listesi. */
export async function acceptedFriendIds(db: Database, userId: string): Promise<string[]> {
    const rows = await db
        .select({ requester_id: schema.friendships.requester_id, addressee_id: schema.friendships.addressee_id })
        .from(schema.friendships)
        .where(
            and(
                eq(schema.friendships.status, "accepted"),
                or(eq(schema.friendships.requester_id, userId), eq(schema.friendships.addressee_id, userId)),
            ),
        );
    return rows.map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id));
}

/**
 * Playlist'i okuma yetkisi: sahibi veya (paylasilmis + kabul edilmis arkadas).
 * Eski Supabase RLS politikasinin birebir karsiligi.
 */
export async function canViewPlaylist(
    db: Database,
    viewerId: string,
    playlist: Pick<YoutubePlaylist, "user_id" | "is_shared">,
): Promise<boolean> {
    if (playlist.user_id === viewerId) return true;
    if (!playlist.is_shared) return false;
    return isFriend(db, viewerId, playlist.user_id);
}

export async function getViewablePlaylist(
    db: Database,
    viewerId: string,
    playlistId: string,
): Promise<YoutubePlaylist | null> {
    const pl = await db.query.youtubePlaylists.findFirst({ where: eq(schema.youtubePlaylists.id, playlistId) });
    if (!pl) return null;
    if (!(await canViewPlaylist(db, viewerId, pl))) return null;
    return pl;
}

/** Birden fazla playlist icin toplam/izlenen/sure istatistikleri. */
export async function loadPlaylistStats(db: Database, playlistIds: string[]): Promise<Record<string, PlaylistStats>> {
    const stats: Record<string, PlaylistStats> = {};
    for (const id of playlistIds) stats[id] = { total: 0, watched: 0, durationSeconds: 0 };
    if (playlistIds.length === 0) return stats;

    const rows = await db
        .select({
            playlist_ref_id: schema.youtubeVideos.playlist_ref_id,
            is_watched: schema.youtubeVideos.is_watched,
            duration: schema.youtubeVideos.duration,
        })
        .from(schema.youtubeVideos)
        .where(inArray(schema.youtubeVideos.playlist_ref_id, playlistIds));

    for (const v of rows) {
        const s = stats[v.playlist_ref_id];
        if (!s) continue;
        s.total++;
        if (v.is_watched) s.watched++;
        s.durationSeconds += parseDurationToSeconds(v.duration ?? "");
    }
    return stats;
}

/** Video basina not sayisi. */
export async function loadNoteCounts(db: Database, videoIds: string[]): Promise<Record<string, number>> {
    if (videoIds.length === 0) return {};
    const rows = await db
        .select({
            video_ref_id: schema.youtubeVideoNotes.video_ref_id,
            count: sql<number>`count(*)`,
        })
        .from(schema.youtubeVideoNotes)
        .where(inArray(schema.youtubeVideoNotes.video_ref_id, videoIds))
        .groupBy(schema.youtubeVideoNotes.video_ref_id);
    const out: Record<string, number> = {};
    for (const r of rows) out[r.video_ref_id] = Number(r.count);
    return out;
}

/**
 * Cok sayida video satirini D1 batch ile ekler.
 * D1'de tek ifadede 100 parametre siniri oldugundan her satir ayri INSERT olarak batch'lenir.
 */
export async function insertVideoRows(
    db: Database,
    rows: Array<typeof schema.youtubeVideos.$inferInsert>,
): Promise<void> {
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const statements = chunk.map((r) => db.insert(schema.youtubeVideos).values(r));
        if (statements.length === 1) {
            await statements[0];
        } else {
            await db.batch(statements as [typeof statements[0], ...typeof statements]);
        }
    }
}
