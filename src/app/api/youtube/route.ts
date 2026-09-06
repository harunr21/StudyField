import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
    fetchPlaylistInfoFromYoutube,
    fetchPlaylistVideosFromYoutube,
    fetchVideoInfoFromYoutube,
    isYoutubeApiConfiguredServer,
    searchPlaylistsOnYoutube,
} from "@/lib/youtube-server";

function badRequest(message: string) {
    return NextResponse.json({ error: message }, { status: 400 });
}

function unauthorized() {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
}

function internalError(message: string) {
    return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return unauthorized();
        }

        const { searchParams } = new URL(request.url);
        const action = searchParams.get("action");

        if (!action) {
            return badRequest("action parametresi zorunlu.");
        }

        if (action === "config") {
            return NextResponse.json({ configured: isYoutubeApiConfiguredServer() });
        }

        if (!isYoutubeApiConfiguredServer()) {
            return internalError("YouTube API key is not configured. Set YOUTUBE_API_KEY secret.");
        }

        if (action === "playlistInfo") {
            const playlistId = searchParams.get("playlistId");
            if (!playlistId) return badRequest("playlistId parametresi zorunlu.");
            return NextResponse.json(await fetchPlaylistInfoFromYoutube(playlistId));
        }

        if (action === "playlistVideos") {
            const playlistId = searchParams.get("playlistId");
            if (!playlistId) return badRequest("playlistId parametresi zorunlu.");
            return NextResponse.json(await fetchPlaylistVideosFromYoutube(playlistId));
        }

        if (action === "videoInfo") {
            const videoId = searchParams.get("videoId");
            if (!videoId) return badRequest("videoId parametresi zorunlu.");
            return NextResponse.json(await fetchVideoInfoFromYoutube(videoId));
        }

        if (action === "search") {
            const q = searchParams.get("q");
            if (!q || q.trim().length < 2) {
                return badRequest("Arama sorgusu en az 2 karakter olmalıdır.");
            }
            const maxResults = Math.min(Number(searchParams.get("maxResults") ?? "10"), 25);
            return NextResponse.json(await searchPlaylistsOnYoutube(q.trim(), maxResults));
        }

        return badRequest("Bilinmeyen action degeri.");
    } catch (error) {
        const message = error instanceof Error ? error.message : "YouTube istegi sirasinda bir hata olustu.";
        return internalError(message);
    }
}
