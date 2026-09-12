"use server";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/context";
import { newId, schema } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { getViewablePlaylist, insertVideoRows, loadNoteCounts, loadPlaylistStats } from "@/lib/data/access";
import { extractPlaylistId, extractVideoIds, isUserManagedPlaylistId } from "@/lib/youtube";
import {
    fetchPlaylistInfoFromYoutube,
    fetchPlaylistVideosFromYoutube,
    fetchVideosInfoFromYoutube,
} from "@/lib/youtube-server";
import type { PlaylistWithStats, Profile, YoutubePlaylist, YoutubeVideo } from "@/lib/types";

/**
 * Liste gorunumlerinde video aciklamasi kullanilmaz; YouTube aciklamalari binlerce karakter
 * olabildigi icin (339 video ~ 1 MB) tasimamak sayfayi belirgin hizlandirir.
 */
const videoListColumns = {
    id: schema.youtubeVideos.id,
    user_id: schema.youtubeVideos.user_id,
    playlist_ref_id: schema.youtubeVideos.playlist_ref_id,
    video_id: schema.youtubeVideos.video_id,
    title: schema.youtubeVideos.title,
    description: sql<string>`''`.as("description"),
    thumbnail_url: schema.youtubeVideos.thumbnail_url,
    channel_title: schema.youtubeVideos.channel_title,
    duration: schema.youtubeVideos.duration,
    position: schema.youtubeVideos.position,
    is_watched: schema.youtubeVideos.is_watched,
    watched_at: schema.youtubeVideos.watched_at,
    created_at: schema.youtubeVideos.created_at,
    updated_at: schema.youtubeVideos.updated_at,
};

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
        .select(videoListColumns)
        .from(schema.youtubeVideos)
        .where(eq(schema.youtubeVideos.playlist_ref_id, id))
        .orderBy(asc(schema.youtubeVideos.position));

    // Notlar her zaman ozeldir: sadece sahibi kendi not sayilarini gorur.
    const noteCounts = playlist.user_id === user.id ? await loadNoteCounts(db, id) : {};

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
    if (isUserManagedPlaylistId(playlist.playlist_id)) {
        return { error: "Kendi oluşturduğun listeler, alt playlistler ve kopyalar YouTube ile senkronize edilemez." };
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
        .select(videoListColumns)
        .from(schema.youtubeVideos)
        .where(eq(schema.youtubeVideos.playlist_ref_id, playlistId))
        .orderBy(asc(schema.youtubeVideos.position));
    return { profile, playlist, videos };
}

// =============================================
// Kullanicinin kendi olusturdugu listeler
// =============================================

// YouTube 50'lik gruplarla cekilir (1000 video = 20 alt istek; ucretsiz plan siniri 50),
// D1'e 500'luk batch'lerle yazilir. Daha yukarisi ucretsiz planda alt istek sinirina yaklasir.
const MAX_VIDEOS_PER_REQUEST = 1000;

export interface AddVideosSummary {
    added: number;
    duplicates: number;
    invalid: number;
    notFound: number;
}

/** Verilen linkleri cozer, YouTube'dan bilgilerini ceker ve listeye ekler; listede olanlari atlar. */
async function appendVideosToPlaylist(
    userId: string,
    playlistId: string,
    linksText: string,
): Promise<AddVideosSummary & { error?: string }> {
    const db = getDb();
    const { ids, invalid } = extractVideoIds(linksText);
    const summary: AddVideosSummary = { added: 0, duplicates: 0, invalid: invalid.length, notFound: 0 };
    if (ids.length === 0) return summary;
    if (ids.length > MAX_VIDEOS_PER_REQUEST) {
        return { ...summary, error: `Tek seferde en fazla ${MAX_VIDEOS_PER_REQUEST} video eklenebilir.` };
    }

    const existing = await db
        .select({ video_id: schema.youtubeVideos.video_id, position: schema.youtubeVideos.position })
        .from(schema.youtubeVideos)
        .where(eq(schema.youtubeVideos.playlist_ref_id, playlistId));
    const existingIds = new Set(existing.map((e) => e.video_id));
    let nextPosition = existing.reduce((max, e) => Math.max(max, e.position), -1) + 1;

    const fresh = ids.filter((id) => !existingIds.has(id));
    summary.duplicates = ids.length - fresh.length;
    if (fresh.length === 0) return summary;

    const details = await fetchVideosInfoFromYoutube(fresh);
    const rows: Array<typeof schema.youtubeVideos.$inferInsert> = [];
    for (const id of fresh) {
        const info = details.get(id);
        if (!info) {
            summary.notFound++;
            continue;
        }
        rows.push({
            id: newId(),
            user_id: userId,
            playlist_ref_id: playlistId,
            video_id: id,
            title: info.title,
            description: info.description,
            thumbnail_url: info.thumbnailUrl,
            channel_title: info.channelTitle,
            duration: info.durationFormatted,
            position: nextPosition++,
        });
    }

    await insertVideoRows(db, rows);
    summary.added = rows.length;

    const first = rows[0];
    await db
        .update(schema.youtubePlaylists)
        .set({
            video_count: existing.length + rows.length,
            updated_at: new Date().toISOString(),
            // Kapak resmi yoksa ilk eklenen videonunki kullanilir.
            ...(existing.length === 0 && first ? { thumbnail_url: first.thumbnail_url ?? "" } : {}),
        })
        .where(eq(schema.youtubePlaylists.id, playlistId));

    return summary;
}

/** Bir veya birden fazla video linkinden yeni bir liste olusturur. Bos liste de olusturulabilir. */
export async function createCustomPlaylist(
    nameInput: string,
    linksText: string,
): Promise<{ id?: string; summary?: AddVideosSummary; error?: string }> {
    const user = await requireUser();
    const title = nameInput.trim().slice(0, 150);
    if (!title) return { error: "Listeye bir ad verin." };

    const db = getDb();
    const id = newId();
    await db.insert(schema.youtubePlaylists).values({
        id,
        user_id: user.id,
        playlist_id: `custom_${Date.now()}_${id.slice(0, 8)}`,
        title,
        description: "",
        thumbnail_url: "",
        channel_title: "",
        video_count: 0,
        tags: [],
    });

    try {
        const summary = await appendVideosToPlaylist(user.id, id, linksText);
        if (summary.error) {
            await db.delete(schema.youtubePlaylists).where(eq(schema.youtubePlaylists.id, id));
            return { error: summary.error };
        }
        return { id, summary };
    } catch (err) {
        await db.delete(schema.youtubePlaylists).where(eq(schema.youtubePlaylists.id, id));
        return { error: err instanceof Error ? err.message : "Bir hata oluştu." };
    }
}

/** Kullanicinin kendi yonettigi bir listeye video ekler. */
export async function addVideosToPlaylist(
    playlistId: string,
    linksText: string,
): Promise<{ summary?: AddVideosSummary; error?: string }> {
    const user = await requireUser();
    const db = getDb();
    const playlist = await db.query.youtubePlaylists.findFirst({
        where: and(eq(schema.youtubePlaylists.id, playlistId), eq(schema.youtubePlaylists.user_id, user.id)),
    });
    if (!playlist) return { error: "Playlist bulunamadı." };
    if (!isUserManagedPlaylistId(playlist.playlist_id)) {
        return { error: "YouTube'dan içe aktarılan listelere video eklenemez; 'Yenile' bunları geri silerdi." };
    }

    try {
        const summary = await appendVideosToPlaylist(user.id, playlistId, linksText);
        if (summary.error) return { error: summary.error };
        return { summary };
    } catch (err) {
        return { error: err instanceof Error ? err.message : "Bir hata oluştu." };
    }
}

/** Videoyu listede bir ust ya da bir alt siraya tasir (komsusuyla yer degistirir). */
export async function moveVideo(
    playlistId: string,
    videoDbId: string,
    direction: "up" | "down",
): Promise<{ error?: string }> {
    const user = await requireUser();
    const db = getDb();
    const playlist = await db.query.youtubePlaylists.findFirst({
        where: and(eq(schema.youtubePlaylists.id, playlistId), eq(schema.youtubePlaylists.user_id, user.id)),
    });
    if (!playlist) return { error: "Playlist bulunamadı." };
    if (!isUserManagedPlaylistId(playlist.playlist_id)) {
        return { error: "YouTube'dan içe aktarılan listelerde sıra değiştirilemez." };
    }

    const videos = await db
        .select({ id: schema.youtubeVideos.id, position: schema.youtubeVideos.position })
        .from(schema.youtubeVideos)
        .where(eq(schema.youtubeVideos.playlist_ref_id, playlistId))
        .orderBy(asc(schema.youtubeVideos.position));

    const idx = videos.findIndex((v) => v.id === videoDbId);
    if (idx === -1) return { error: "Video bulunamadı." };
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= videos.length) return {};

    const a = videos[idx];
    const b = videos[swapIdx];
    // Pozisyonlar esitse (eski veri) siralama indekslerini kullanarak aralarini ac.
    const samePos = a.position === b.position;
    const posA = samePos ? swapIdx : b.position;
    const posB = samePos ? idx : a.position;
    const now = new Date().toISOString();
    await db.batch([
        db.update(schema.youtubeVideos).set({ position: posA, updated_at: now }).where(eq(schema.youtubeVideos.id, a.id)),
        db.update(schema.youtubeVideos).set({ position: posB, updated_at: now }).where(eq(schema.youtubeVideos.id, b.id)),
    ]);
    return {};
}

export async function renamePlaylist(playlistId: string, titleInput: string): Promise<{ error?: string }> {
    const user = await requireUser();
    const title = titleInput.trim().slice(0, 150);
    if (!title) return { error: "Ad boş olamaz." };
    const db = getDb();
    await db
        .update(schema.youtubePlaylists)
        .set({ title, updated_at: new Date().toISOString() })
        .where(and(eq(schema.youtubePlaylists.id, playlistId), eq(schema.youtubePlaylists.user_id, user.id)));
    return {};
}
