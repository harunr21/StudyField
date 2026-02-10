// YouTube Data API v3 Utility
// All YouTube API calls go through this file

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

function getApiKey(): string {
    const key = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
    if (!key || key === "YOUR_YOUTUBE_API_KEY_HERE") {
        throw new Error("YouTube API key is not configured. Set NEXT_PUBLIC_YOUTUBE_API_KEY in .env.local");
    }
    return key;
}

export function isYoutubeApiConfigured(): boolean {
    const key = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
    return !!key && key !== "YOUR_YOUTUBE_API_KEY_HERE";
}

// ---- Types for API responses ----

export interface YTPlaylistInfo {
    id: string;
    title: string;
    description: string;
    thumbnailUrl: string;
    channelTitle: string;
    videoCount: number;
}

export interface YTVideoItem {
    videoId: string;
    title: string;
    description: string;
    thumbnailUrl: string;
    channelTitle: string;
    position: number;
    duration: string; // ISO 8601 duration like PT4M13S
    durationFormatted: string; // human readable like "4:13"
}

// ---- Extract playlist ID from URL or raw ID ----

export function extractPlaylistId(input: string): string | null {
    const trimmed = input.trim();

    // Direct playlist ID
    if (/^[A-Za-z0-9_-]{10,}$/.test(trimmed) && (trimmed.startsWith("PL") || trimmed.startsWith("UU") || trimmed.startsWith("OL") || trimmed.startsWith("FL") || trimmed.startsWith("RD"))) {
        return trimmed;
    }

    try {
        const url = new URL(trimmed);
        const listParam = url.searchParams.get("list");
        if (listParam) return listParam;
    } catch {
        // Not a URL
    }

    return null;
}

// ---- Parse ISO 8601 duration (PT4M13S) to formatted string ----

function parseDuration(isoDuration: string): string {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return "0:00";

    const hours = parseInt(match[1] || "0", 10);
    const minutes = parseInt(match[2] || "0", 10);
    const seconds = parseInt(match[3] || "0", 10);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// ---- Fetch playlist details ----

export async function fetchPlaylistInfo(playlistId: string): Promise<YTPlaylistInfo> {
    const apiKey = getApiKey();
    const url = `${YOUTUBE_API_BASE}/playlists?part=snippet,contentDetails&id=${playlistId}&key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `YouTube API error: ${response.status}`);
    }

    const data = await response.json();

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
        thumbnailUrl: snippet.thumbnails?.maxres?.url
            || snippet.thumbnails?.high?.url
            || snippet.thumbnails?.medium?.url
            || snippet.thumbnails?.default?.url
            || "",
        channelTitle: snippet.channelTitle || "",
        videoCount: contentDetails?.itemCount || 0,
    };
}

// ---- Fetch ALL videos in a playlist (handles pagination) ----

export async function fetchPlaylistVideos(playlistId: string): Promise<YTVideoItem[]> {
    const apiKey = getApiKey();
    const allItems: YTVideoItem[] = [];
    let nextPageToken: string | undefined = undefined;

    // Step 1: Fetch all playlistItems (paginated, 50 per page)
    let hasNextPage = true;
    while (hasNextPage) {
        const pageParam: string = nextPageToken ? `&pageToken=${nextPageToken}` : "";
        const url: string = `${YOUTUBE_API_BASE}/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}${pageParam}&key=${apiKey}`;

        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
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

                // Skip deleted/private videos
                if (!videoId || snippet.title === "Private video" || snippet.title === "Deleted video") {
                    continue;
                }

                allItems.push({
                    videoId,
                    title: snippet.title,
                    description: snippet.description || "",
                    thumbnailUrl: snippet.thumbnails?.medium?.url
                        || snippet.thumbnails?.default?.url
                        || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
                    channelTitle: snippet.videoOwnerChannelTitle || "",
                    position: snippet.position ?? allItems.length,
                    duration: "", // Will be filled in step 2
                    durationFormatted: "",
                });
            }
        }
    }


    // Step 2: Fetch video durations in batches of 50
    for (let i = 0; i < allItems.length; i += 50) {
        const batch = allItems.slice(i, i + 50);
        const videoIds = batch.map((v) => v.videoId).join(",");
        const url = `${YOUTUBE_API_BASE}/videos?part=contentDetails&id=${videoIds}&key=${apiKey}`;

        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                if (data.items) {
                    for (const videoDetail of data.items) {
                        const item = allItems.find((v) => v.videoId === videoDetail.id);
                        if (item && videoDetail.contentDetails?.duration) {
                            item.duration = videoDetail.contentDetails.duration;
                            item.durationFormatted = parseDuration(videoDetail.contentDetails.duration);
                        }
                    }
                }
            }
        } catch {
            // Duration fetch failed — non-critical, continue
        }
    }

    return allItems;
}

// ---- Fetch a single video's info ----

export async function fetchVideoInfo(videoId: string): Promise<{
    title: string;
    description: string;
    thumbnailUrl: string;
    channelTitle: string;
    duration: string;
    durationFormatted: string;
}> {
    const apiKey = getApiKey();
    const url = `${YOUTUBE_API_BASE}/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
        throw new Error("Video bulunamadı.");
    }

    const item = data.items[0];
    const snippet = item.snippet;
    const duration = item.contentDetails?.duration || "";

    return {
        title: snippet.title,
        description: snippet.description || "",
        thumbnailUrl: snippet.thumbnails?.medium?.url
            || snippet.thumbnails?.default?.url
            || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        channelTitle: snippet.channelTitle || "",
        duration,
        durationFormatted: parseDuration(duration),
    };
}
