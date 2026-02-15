import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
    fetchPlaylistInfoFromYoutube,
    fetchPlaylistVideosFromYoutube,
    fetchVideoInfoFromYoutube,
    isYoutubeApiConfiguredServer,
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
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

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
            return internalError("YouTube API key is not configured. Set YOUTUBE_API_KEY in .env.local");
        }

        if (action === "playlistInfo") {
            const playlistId = searchParams.get("playlistId");
            if (!playlistId) {
                return badRequest("playlistId parametresi zorunlu.");
            }

            const data = await fetchPlaylistInfoFromYoutube(playlistId);
            return NextResponse.json(data);
        }

        if (action === "playlistVideos") {
            const playlistId = searchParams.get("playlistId");
            if (!playlistId) {
                return badRequest("playlistId parametresi zorunlu.");
            }

            const data = await fetchPlaylistVideosFromYoutube(playlistId);
            return NextResponse.json(data);
        }

        if (action === "videoInfo") {
            const videoId = searchParams.get("videoId");
            if (!videoId) {
                return badRequest("videoId parametresi zorunlu.");
            }

            const data = await fetchVideoInfoFromYoutube(videoId);
            return NextResponse.json(data);
        }

        return badRequest("Bilinmeyen action degeri.");
    } catch (error) {
        const message = error instanceof Error ? error.message : "YouTube istegi sirasinda bir hata olustu.";
        return internalError(message);
    }
}
