import "server-only";

import type { YTPlaylistInfo, YTSearchResult, YTVideoInfo, YTVideoItem } from "@/lib/youtube";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

/**
 * API anahtari Cloudflare Worker secret'i olarak tanimlanir (`wrangler secret put YOUTUBE_API_KEY`).
 * Yerel gelistirmede `.dev.vars` icinden gelir. OpenNext bunu process.env'e kopyalar.
 */
function readApiKey(): string | undefined {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key || key === "YOUR_YOUTUBE_API_KEY_HERE" || key === "AIzaSy...") return undefined;
    return key;
}

function getApiKey(): string {
    const key = readApiKey();
    if (!key) {
        throw new Error("YouTube API key is not configured. Set the YOUTUBE_API_KEY secret.");
    }
    return key;
}

export function isYoutubeApiConfiguredServer(): boolean {
    return Boolean(readApiKey());
}

function parseDuration(isoDuration: string): string {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return "0:00";

    const hours = Number.parseInt(match[1] || "0", 10);
    const minutes = Number.parseInt(match[2] || "0", 10);
    const seconds = Number.parseInt(match[3] || "0", 10);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export async function fetchPlaylistInfoFromYoutube(playlistId: string): Promise<YTPlaylistInfo> {
    const apiKey = getApiKey();
    const url = `${YOUTUBE_API_BASE}/playlists?part=snippet,contentDetails&id=${encodeURIComponent(playlistId)}&key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errorData: any = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `YouTube API error: ${response.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();

    if (!data.items || data.items.length === 0) {
        throw new Error("Playlist bulunamadı. URL'yi kontrol edin.");
    }

    const item = data.items[0];
    const snippet = item.snippet;
    const contentDetails = item.contentDetails;

    return {
        id: item.id,
        title: snippet.title,
        description: snippet.description || "",
        thumbnailUrl:
            snippet.thumbnails?.maxres?.url ||
            snippet.thumbnails?.high?.url ||
            snippet.thumbnails?.medium?.url ||
            snippet.thumbnails?.default?.url ||
            "",
        channelTitle: snippet.channelTitle || "",
        videoCount: contentDetails?.itemCount || 0,
    };
}

export async function fetchPlaylistVideosFromYoutube(playlistId: string): Promise<YTVideoItem[]> {
    const apiKey = getApiKey();
    const allItems: YTVideoItem[] = [];
    let nextPageToken: string | undefined = undefined;

    let hasNextPage = true;
    while (hasNextPage) {
        const pageParam = nextPageToken ? `&pageToken=${nextPageToken}` : "";
        const url = `${YOUTUBE_API_BASE}/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(playlistId)}${pageParam}&key=${apiKey}`;

        const response = await fetch(url);
        if (!response.ok) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const errorData: any = await response.json().catch(() => ({}));
            throw new Error(errorData?.error?.message || `YouTube API error: ${response.status}`);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pageData: any = await response.json();
        nextPageToken = pageData.nextPageToken;
        hasNextPage = !!nextPageToken;

        if (pageData.items) {
            for (const item of pageData.items) {
                const snippet = item.snippet;
                const videoId = snippet.resourceId?.videoId || item.contentDetails?.videoId;

                if (!videoId || snippet.title === "Private video" || snippet.title === "Deleted video") {
                    continue;
                }

                allItems.push({
                    videoId,
                    title: snippet.title,
                    description: snippet.description || "",
                    thumbnailUrl:
                        snippet.thumbnails?.medium?.url ||
                        snippet.thumbnails?.default?.url ||
                        `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
                    channelTitle: snippet.videoOwnerChannelTitle || "",
                    position: snippet.position ?? allItems.length,
                    duration: "",
                    durationFormatted: "",
                });
            }
        }
    }

    const durationPromises = [];
    for (let i = 0; i < allItems.length; i += 50) {
        const batch = allItems.slice(i, i + 50);
        const videoIds = batch.map((video) => video.videoId).join(",");
        const url = `${YOUTUBE_API_BASE}/videos?part=contentDetails&id=${videoIds}&key=${apiKey}`;

        durationPromises.push(
            fetch(url)
                .then(async (response) => {
                    if (!response.ok) return;

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();
                    if (!data.items) return;

                    for (const videoDetail of data.items) {
                        const item = batch.find((video) => video.videoId === videoDetail.id);
                        if (item && videoDetail.contentDetails?.duration) {
                            item.duration = videoDetail.contentDetails.duration;
                            item.durationFormatted = parseDuration(videoDetail.contentDetails.duration);
                        }
                    }
                })
                .catch(() => {
                    // Sure bilgisi kritik degil.
                }),
        );
    }

    await Promise.all(durationPromises);
    return allItems;
}

export async function fetchVideoInfoFromYoutube(videoId: string): Promise<YTVideoInfo> {
    const apiKey = getApiKey();
    const url = `${YOUTUBE_API_BASE}/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}&key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();
    if (!data.items || data.items.length === 0) {
        throw new Error("Video bulunamadı.");
    }

    const item = data.items[0];
    const snippet = item.snippet;
    const duration = item.contentDetails?.duration || "";

    return {
        title: snippet.title,
        description: snippet.description || "",
        thumbnailUrl:
            snippet.thumbnails?.medium?.url ||
            snippet.thumbnails?.default?.url ||
            `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        channelTitle: snippet.channelTitle || "",
        duration,
        durationFormatted: parseDuration(duration),
    };
}

export async function searchPlaylistsOnYoutube(query: string, maxResults = 10): Promise<YTSearchResult[]> {
    const apiKey = getApiKey();
    const url = `${YOUTUBE_API_BASE}/search?part=snippet&type=playlist&q=${encodeURIComponent(query)}&maxResults=${maxResults}&key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (errorData as any)?.error?.message || `YouTube API error: ${response.status}`,
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();
    if (!data.items) return [];

    return (
        data.items
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((item: any) => ({
                playlistId: item.id?.playlistId ?? "",
                title: item.snippet?.title ?? "",
                description: item.snippet?.description ?? "",
                thumbnailUrl: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "",
                channelTitle: item.snippet?.channelTitle ?? "",
            }))
            .filter((r: YTSearchResult) => r.playlistId)
    );
}

export interface YTVideoDetails extends YTVideoInfo {
    videoId: string;
}

/**
 * Birden fazla video icin baslik/kanal/sure bilgisini 50'lik gruplarla tek istekte ceker.
 * Bulunamayan (silinmis/ozel) videolar sonuca girmez.
 */
export async function fetchVideosInfoFromYoutube(videoIds: string[]): Promise<Map<string, YTVideoDetails>> {
    const apiKey = getApiKey();
    const result = new Map<string, YTVideoDetails>();

    for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        const url = `${YOUTUBE_API_BASE}/videos?part=snippet,contentDetails&id=${batch.join(",")}&key=${apiKey}`;
        const response = await fetch(url);
        if (!response.ok) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const errorData: any = await response.json().catch(() => ({}));
            throw new Error(errorData?.error?.message || `YouTube API error: ${response.status}`);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await response.json();
        for (const item of data.items ?? []) {
            const snippet = item.snippet ?? {};
            const duration = item.contentDetails?.duration || "";
            result.set(item.id, {
                videoId: item.id,
                title: snippet.title ?? "",
                description: snippet.description ?? "",
                thumbnailUrl:
                    snippet.thumbnails?.medium?.url ||
                    snippet.thumbnails?.default?.url ||
                    `https://img.youtube.com/vi/${item.id}/mqdefault.jpg`,
                channelTitle: snippet.channelTitle ?? "",
                duration,
                durationFormatted: parseDuration(duration),
            });
        }
    }

    return result;
}
