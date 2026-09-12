"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/context";
import { newId, schema } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { acceptedFriendIds } from "@/lib/data/access";
import type { YoutubeVideo, YoutubeVideoNote } from "@/lib/types";

export async function setVideoWatched(videoId: string, watched: boolean): Promise<{ watched_at: string | null }> {
    const user = await requireUser();
    const db = getDb();
    const watched_at = watched ? new Date().toISOString() : null;
    await db
        .update(schema.youtubeVideos)
        .set({ is_watched: watched, watched_at, updated_at: new Date().toISOString() })
        .where(and(eq(schema.youtubeVideos.id, videoId), eq(schema.youtubeVideos.user_id, user.id)));
    return { watched_at };
}

export async function deleteVideo(videoId: string): Promise<{ error?: string }> {
    const user = await requireUser();
    const db = getDb();
    const video = await db.query.youtubeVideos.findFirst({
        where: and(eq(schema.youtubeVideos.id, videoId), eq(schema.youtubeVideos.user_id, user.id)),
    });
    if (!video) return {};

    await db.delete(schema.youtubeVideos).where(eq(schema.youtubeVideos.id, videoId));

    // Kart uzerindeki video sayisini guncel tut.
    const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.youtubeVideos)
        .where(eq(schema.youtubeVideos.playlist_ref_id, video.playlist_ref_id));
    await db
        .update(schema.youtubePlaylists)
        .set({ video_count: Number(count), updated_at: new Date().toISOString() })
        .where(eq(schema.youtubePlaylists.id, video.playlist_ref_id));
    return {};
}

export interface WatchPageData {
    video: YoutubeVideo;
    playlistVideos: YoutubeVideo[];
    notes: YoutubeVideoNote[];
    me: { id: string; username: string; displayName: string } | null;
    acceptedFriendIds: string[];
}

/** Izleme sayfasinin tum verisi (sadece sahibinin videolari). */
export async function getWatchPageData(playlistId: string, videoDbId: string): Promise<WatchPageData | null> {
    const user = await requireUser();
    const db = getDb();

    const video = await db.query.youtubeVideos.findFirst({
        where: and(eq(schema.youtubeVideos.id, videoDbId), eq(schema.youtubeVideos.user_id, user.id)),
    });
    if (!video) return null;

    const playlistVideos = await db
        .select()
        .from(schema.youtubeVideos)
        .where(and(eq(schema.youtubeVideos.playlist_ref_id, playlistId), eq(schema.youtubeVideos.user_id, user.id)))
        .orderBy(asc(schema.youtubeVideos.position));

    const notes = await db
        .select()
        .from(schema.youtubeVideoNotes)
        .where(and(eq(schema.youtubeVideoNotes.video_ref_id, videoDbId), eq(schema.youtubeVideoNotes.user_id, user.id)))
        .orderBy(asc(schema.youtubeVideoNotes.timestamp_seconds));

    const profile = await db.query.profiles.findFirst({ where: eq(schema.profiles.user_id, user.id) });
    const friendIds = await acceptedFriendIds(db, user.id);

    return {
        video,
        playlistVideos,
        notes,
        me: profile ? { id: user.id, username: profile.username, displayName: profile.display_name } : null,
        acceptedFriendIds: friendIds,
    };
}

export async function addNote(
    videoDbId: string,
    timestampSeconds: number,
    contentInput: string,
): Promise<{ note?: YoutubeVideoNote; error?: string }> {
    const user = await requireUser();
    const content = contentInput.trim();
    if (!content) return { error: "Not boş olamaz." };
    const db = getDb();

    const video = await db.query.youtubeVideos.findFirst({
        where: and(eq(schema.youtubeVideos.id, videoDbId), eq(schema.youtubeVideos.user_id, user.id)),
    });
    if (!video) return { error: "Video bulunamadı." };

    const id = newId();
    await db.insert(schema.youtubeVideoNotes).values({
        id,
        user_id: user.id,
        video_ref_id: videoDbId,
        timestamp_seconds: Math.max(0, Math.floor(timestampSeconds)),
        content,
    });
    const note = await db.query.youtubeVideoNotes.findFirst({ where: eq(schema.youtubeVideoNotes.id, id) });
    return { note: note ?? undefined };
}

export async function updateNote(noteId: string, contentInput: string): Promise<{ error?: string }> {
    const user = await requireUser();
    const content = contentInput.trim();
    if (!content) return { error: "Not boş olamaz." };
    const db = getDb();
    await db
        .update(schema.youtubeVideoNotes)
        .set({ content, updated_at: new Date().toISOString() })
        .where(and(eq(schema.youtubeVideoNotes.id, noteId), eq(schema.youtubeVideoNotes.user_id, user.id)));
    return {};
}

export async function deleteNote(noteId: string): Promise<{ error?: string }> {
    const user = await requireUser();
    const db = getDb();
    await db
        .delete(schema.youtubeVideoNotes)
        .where(and(eq(schema.youtubeVideoNotes.id, noteId), eq(schema.youtubeVideoNotes.user_id, user.id)));
    return {};
}
