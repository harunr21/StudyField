"use server";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/context";
import { newId, schema } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { getViewablePlaylist, insertVideoRows, loadNoteCounts, loadPlaylistStats } from "@/lib/data/access";
import { extractPlaylistId } from "@/lib/youtube";
import { fetchPlaylistInfoFromYoutube, fetchPlaylistVideosFromYoutube } from "@/lib/youtube-server";
import type { PlaylistWithStats, Profile, YoutubePlaylist, YoutubeVideo } from "@/lib/types";

export async function listMyPlaylists(): Promise<PlaylistWithStats[]> {
    const user = await requireUser();
    const db = getDb();
    const list = await db
        .select()
        .from(schema.youtubePlaylists)
        .where(eq(schema.youtubePlaylists.user_id, user.id))
        .orderBy(desc(schema.youtubePlaylists.updated_at));
    const stats = await loadPlaylistStats(
        db,
        list.map((p) => p.id),
    );
    return list.map((p) => ({ ...p, stats: stats[p.id] ?? { total: 0, watched: 0, durationSeconds: 0 } }));
}

/** YouTube'dan playlist ve videolarini cekip kullanicinin koleksiyonuna ekler. */
export async function addPlaylist(input: string): Promise<{ id?: string; error?: string }> {
    const user = await requireUser();
    const playlistId = extractPlaylistId(input);
    if (!playlistId) return { error: "Geçerli bir YouTube playlist URL'si veya ID'si girin." };

    const db = getDb();
    const existing = await db.query.youtubePlaylists.findFirst({
        where: and(eq(schema.youtubePlaylists.user_id, user.id), eq(schema.youtubePlaylists.playlist_id, playlistId)),
    });
    if (existing) return { error: "Bu playlist zaten eklenmiş." };

    try {
        const info = await fetchPlaylistInfoFromYoutube(playlistId);
        const id = newId();
        await db.insert(schema.youtubePlaylists).values({
            id,
            user_id: user.id,
            playlist_id: playlistId,
            title: info.title,
            description: info.description,
            thumbnail_url: info.thumbnailUrl,
            channel_title: info.channelTitle,
            video_count: info.videoCount,
            tags: [],
        });

        const videos = await fetchPlaylistVideosFromYoutube(playlistId);
        await insertVideoRows(
            db,
            videos.map((v) => ({
                id: newId(),
                user_id: user.id,
                playlist_ref_id: id,
                video_id: v.videoId,
                title: v.title,
                description: v.description,
                thumbnail_url: v.thumbnailUrl,
                channel_title: v.channelTitle,
                duration: v.durationFormatted,
                position: v.position,
            })),
        );
        return { id };
    } catch (err) {
        return { error: err instanceof Error ? err.message : "Bir hata oluştu." };
    }
}

export async function deletePlaylist(id: string): Promise<{ error?: string }> {
    const user = await requireUser();
    const db = getDb();
    await db
        .delete(schema.youtubePlaylists)
        .where(and(eq(schema.youtubePlaylists.id, id), eq(schema.youtubePlaylists.user_id, user.id)));
    return {};
}

export async function updatePlaylistTags(id: string, tagsInput: string[]): Promise<{ error?: string }> {
    const user = await requireUser();
    const tags = Array.from(
        new Set(tagsInput.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0 && t.length <= 30)),
    ).slice(0, 10);
    const db = getDb();
    await db
        .update(schema.youtubePlaylists)
        .set({ tags, updated_at: new Date().toISOString() })
        .where(and(eq(schema.youtubePlaylists.id, id), eq(schema.youtubePlaylists.user_id, user.id)));
    return {};
}

export async function setPlaylistShared(id: string, isShared: boolean): Promise<{ error?: string }> {
    const user = await requireUser();
    const db = getDb();
    await db
        .update(schema.youtubePlaylists)
        .set({ is_shared: isShared, updated_at: new Date().toISOString() })
        .where(and(eq(schema.youtubePlaylists.id, id), eq(schema.youtubePlaylists.user_id, user.id)));
    return {};
}

export interface PlaylistDetail {
    playlist: YoutubePlaylist;
    videos: YoutubeVideo[];
    noteCounts: Record<string, number>;
    isOwner: boolean;
}

export async function getPlaylistDetail(id: string): Promise<PlaylistDetail | null> {
    const user = await requireUser();
    const db = getDb();
    const playlist = await getViewablePlaylist(db, user.id, id);
    if (!playlist) return null;

    const videos = await db
        .select()
        .from(schema.youtubeVideos)
        .where(eq(schema.youtubeVideos.playlist_ref_id, id))
        .orderBy(asc(schema.youtubeVideos.position));

    // Notlar her zaman ozeldir: sadece sahibi kendi not sayilarini gorur.
    const noteCounts =
        playlist.user_id === user.id
            ? await loadNoteCounts(
                  db,
                  videos.map((v) => v.id),
              )
            : {};

    return { playlist, videos, noteCounts, isOwner: playlist.user_id === user.id };
}

/** Playlist'i YouTube ile yeniden esitler; izleme durumunu korur. */
export async function syncPlaylist(id: string): Promise<{ added?: number; removed?: number; error?: string }> {
    const user = await requireUser();
    const db = getDb();
    const playlist = await db.query.youtubePlaylists.findFirst({
        where: and(eq(schema.youtubePlaylists.id, id), eq(schema.youtubePlaylists.user_id, user.id)),
    });
    if (!playlist) return { error: "Playlist bulunamadı." };
    if (playlist.playlist_id.startsWith("sub_") || playlist.playlist_id.startsWith("copy_")) {
        return { error: "Alt playlistler ve kopyalar YouTube ile senkronize edilemez." };
    }

    try {
        const info = await fetchPlaylistInfoFromYoutube(playlist.playlist_id);
        const now = new Date().toISOString();
        await db
            .update(schema.youtubePlaylists)
            .set({
                title: info.title,
                description: info.description,
                thumbnail_url: info.thumbnailUrl,
                channel_title: info.channelTitle,
                video_count: info.videoCount,
                updated_at: now,
            })
            .where(eq(schema.youtubePlaylists.id, id));

        const ytVideos = await fetchPlaylistVideosFromYoutube(playlist.playlist_id);
        const existing = await db
            .select({ id: schema.youtubeVideos.id, video_id: schema.youtubeVideos.video_id })
            .from(schema.youtubeVideos)
            .where(eq(schema.youtubeVideos.playlist_ref_id, id));
        const existingByVideoId = new Map(existing.map((e) => [e.video_id, e.id]));
        const ytIds = new Set(ytVideos.map((v) => v.videoId));

        const removedIds = existing.filter((e) => !ytIds.has(e.video_id)).map((e) => e.id);
        if (removedIds.length > 0) {
            for (let i = 0; i < removedIds.length; i += 90) {
                await db.delete(schema.youtubeVideos).where(inArray(schema.youtubeVideos.id, removedIds.slice(i, i + 90)));
            }
        }

        const newVideos = ytVideos.filter((v) => !existingByVideoId.has(v.videoId));
        await insertVideoRows(
            db,
            newVideos.map((v) => ({
                id: newId(),
                user_id: user.id,
                playlist_ref_id: id,
                video_id: v.videoId,
                title: v.title,
                description: v.description,
                thumbnail_url: v.thumbnailUrl,
                channel_title: v.channelTitle,
                duration: v.durationFormatted,
                position: v.position,
            })),
        );

        // Mevcut videolarin baslik/sira bilgisini tek batch'te guncelle.
        const updates = ytVideos
            .filter((v) => existingByVideoId.has(v.videoId))
            .map((v) =>
                db
                    .update(schema.youtubeVideos)
                    .set({
                        title: v.title,
                        thumbnail_url: v.thumbnailUrl,
                        channel_title: v.channelTitle,
                        duration: v.durationFormatted,
                        position: v.position,
                        updated_at: now,
                    })
                    .where(eq(schema.youtubeVideos.id, existingByVideoId.get(v.videoId)!)),
            );
        for (let i = 0; i < updates.length; i += 500) {
            const chunk = updates.slice(i, i + 500);
            if (chunk.length === 1) await chunk[0];
            else if (chunk.length > 1) await db.batch(chunk as [typeof chunk[0], ...typeof chunk]);
        }

        return { added: newVideos.length, removed: removedIds.length };
    } catch (err) {
        return { error: err instanceof Error ? err.message : "Senkronizasyon hatası." };
    }
}

/** Secilen video araligindan yeni bir alt playlist olusturur (izleme durumu korunur). */
export async function createSubPlaylist(
    sourceId: string,
    start: number,
    end: number,
    nameInput: string,
): Promise<{ id?: string; error?: string }> {
    const user = await requireUser();
    const db = getDb();
    const source = await db.query.youtubePlaylists.findFirst({
        where: and(eq(schema.youtubePlaylists.id, sourceId), eq(schema.youtubePlaylists.user_id, user.id)),
    });
    if (!source) return { error: "Playlist bulunamadı." };

    const videos = await db
        .select()
        .from(schema.youtubeVideos)
        .where(eq(schema.youtubeVideos.playlist_ref_id, sourceId))
        .orderBy(asc(schema.youtubeVideos.position));

    const from = Math.max(1, Math.floor(start));
    const to = Math.min(videos.length, Math.floor(end));
    const selected = videos.slice(from - 1, to);
    if (selected.length === 0) return { error: "Seçilen aralıkta video yok." };

    const name = nameInput.trim() || `${source.title} (${from}-${to})`;
    const id = newId();
    await db.insert(schema.youtubePlaylists).values({
        id,
        user_id: user.id,
        playlist_id: `sub_${source.playlist_id}_${Date.now()}`,
        title: name,
        description: `"${source.title}" listesinden oluşturulan alt playlist (Video ${from}-${to})`,
        thumbnail_url: selected[0]?.thumbnail_url || source.thumbnail_url,
        channel_title: source.channel_title,
        video_count: selected.length,
        tags: [],
    });

    await insertVideoRows(
        db,
        selected.map((v, idx) => ({
            id: newId(),
            user_id: user.id,
            playlist_ref_id: id,
            video_id: v.video_id,
            title: v.title,
            description: v.description,
            thumbnail_url: v.thumbnail_url,
            channel_title: v.channel_title,
            duration: v.duration,
            position: idx,
            is_watched: v.is_watched,
            watched_at: v.watched_at,
        })),
    );
    return { id };
}

/** Arkadasin paylastigi playlist'i kendi koleksiyonuna kopyalar (izleme durumu sifirlanir). */
export async function copyPlaylist(sourceId: string): Promise<{ newPlaylistId?: string; error?: string }> {
    const user = await requireUser();
    const db = getDb();
    const source = await getViewablePlaylist(db, user.id, sourceId);
    if (!source) return { error: "Playlist bulunamadı veya erişim izniniz yok." };
    if (source.user_id === user.id) return { error: "Bu playlist zaten koleksiyonunuzda." };

    const videos = await db
        .select()
        .from(schema.youtubeVideos)
        .where(eq(schema.youtubeVideos.playlist_ref_id, sourceId))
        .orderBy(asc(schema.youtubeVideos.position));

    const id = newId();
    await db.insert(schema.youtubePlaylists).values({
        id,
        user_id: user.id,
        playlist_id: `copy_${source.playlist_id}_${Date.now()}`,
        title: source.title,
        description: source.description,
        thumbnail_url: source.thumbnail_url,
        channel_title: source.channel_title,
        video_count: source.video_count,
        is_shared: true,
        tags: source.tags ?? [],
    });

    try {
        await insertVideoRows(
            db,
            videos.map((v) => ({
                id: newId(),
                user_id: user.id,
                playlist_ref_id: id,
                video_id: v.video_id,
                title: v.title,
                description: v.description,
                thumbnail_url: v.thumbnail_url,
                channel_title: v.channel_title,
                duration: v.duration,
                position: v.position,
                is_watched: false,
                watched_at: null,
            })),
        );
    } catch {
        await db.delete(schema.youtubePlaylists).where(eq(schema.youtubePlaylists.id, id));
        return { error: "Videolar kopyalanamadı." };
    }
    return { newPlaylistId: id };
}

/** Arkadasin playlist'inin salt-okunur gorunumu. */
export async function getFriendPlaylistView(
    usernameInput: string,
    playlistId: string,
): Promise<{ profile: Profile | null; playlist: YoutubePlaylist | null; videos: YoutubeVideo[] }> {
    const user = await requireUser();
    const db = getDb();
    const profile = await db.query.profiles.findFirst({
        where: eq(schema.profiles.username, usernameInput.trim().toLowerCase()),
    });
    if (!profile) return { profile: null, playlist: null, videos: [] };

    const playlist = await getViewablePlaylist(db, user.id, playlistId);
    if (!playlist || playlist.user_id !== profile.user_id) return { profile, playlist: null, videos: [] };

    const videos = await db
        .select()
        .from(schema.youtubeVideos)
        .where(eq(schema.youtubeVideos.playlist_ref_id, playlistId))
        .orderBy(asc(schema.youtubeVideos.position));
    return { profile, playlist, videos };
}
