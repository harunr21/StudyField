import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function unauthorized() {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
}

function badRequest(message: string) {
    return NextResponse.json({ error: message }, { status: 400 });
}

function internalError(message: string) {
    return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) return unauthorized();

        const body = await request.json();
        const { sourcePlaylistId } = body as { sourcePlaylistId?: string };

        if (!sourcePlaylistId) return badRequest("sourcePlaylistId zorunlu.");

        // Kaynak playlist — RLS arkadaş/sahip kontrolünü otomatik yapar
        const { data: source, error: plErr } = await supabase
            .from("youtube_playlists")
            .select("*")
            .eq("id", sourcePlaylistId)
            .single();

        if (plErr || !source) {
            return badRequest("Playlist bulunamadı veya erişim izniniz yok.");
        }

        // Zaten bu kullanıcıya ait mi?
        if (source.user_id === user.id) {
            return badRequest("Bu playlist zaten koleksiyonunuzda.");
        }

        // Kaynak videolar
        const { data: sourceVideos, error: vidErr } = await supabase
            .from("youtube_videos")
            .select("*")
            .eq("playlist_ref_id", sourcePlaylistId)
            .order("position", { ascending: true });

        if (vidErr) return internalError("Videolar alınamadı.");

        // Yeni playlist oluştur — copy_ prefix UNIQUE kısıtını aşar
        const newPlaylistId = `copy_${source.playlist_id}_${Date.now()}`;
        const { data: newPlaylist, error: insertErr } = await supabase
            .from("youtube_playlists")
            .insert({
                user_id: user.id,
                playlist_id: newPlaylistId,
                title: source.title,
                description: source.description,
                thumbnail_url: source.thumbnail_url,
                channel_title: source.channel_title,
                video_count: source.video_count,
                is_shared: true,
                tags: source.tags ?? [],
            })
            .select("id")
            .single();

        if (insertErr || !newPlaylist) {
            return internalError("Playlist oluşturulamadı.");
        }

        // Videoları kopyala — izleme durumu sıfırlanır
        if (sourceVideos && sourceVideos.length > 0) {
            const videoCopies = sourceVideos.map((v) => ({
                user_id: user.id,
                playlist_ref_id: newPlaylist.id,
                video_id: v.video_id,
                title: v.title,
                description: v.description,
                thumbnail_url: v.thumbnail_url,
                channel_title: v.channel_title,
                duration: v.duration,
                position: v.position,
                is_watched: false,
                watched_at: null,
            }));

            const { error: videoInsertErr } = await supabase
                .from("youtube_videos")
                .insert(videoCopies);

            if (videoInsertErr) {
                // Oluşturulan playlist'i temizle
                await supabase.from("youtube_playlists").delete().eq("id", newPlaylist.id);
                return internalError("Videolar kopyalanamadı.");
            }
        }

        return NextResponse.json({ newPlaylistId: newPlaylist.id });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Bir hata oluştu.";
        return internalError(message);
    }
}
