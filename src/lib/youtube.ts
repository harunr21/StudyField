// YouTube utility for client-side code.
// This module never calls Google directly; requests go through /api/youtube.

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
    duration: string;
    durationFormatted: string;
}

export interface YTVideoInfo {
    title: string;
    description: string;
    thumbnailUrl: string;
    channelTitle: string;
    duration: string;
    durationFormatted: string;
}

function toSearchParams(values: Record<string, string>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        params.set(key, value);
    }
    return params;
}

async function callYoutubeApi<T>(action: string, values: Record<string, string> = {}): Promise<T> {
    const params = toSearchParams({ action, ...values });
    const response = await fetch(`/api/youtube?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
        throw new Error(payload?.error || `YouTube API error: ${response.status}`);
    }

    return payload as T;
}

export function extractPlaylistId(input: string): string | null {
    const trimmed = input.trim();

    if (
        /^[A-Za-z0-9_-]{10,}$/.test(trimmed) &&
        (trimmed.startsWith("PL") ||
            trimmed.startsWith("UU") ||
            trimmed.startsWith("OL") ||
            trimmed.startsWith("FL") ||
            trimmed.startsWith("RD"))
    ) {
        return trimmed;
    }

    try {
        const url = new URL(trimmed);
        const listParam = url.searchParams.get("list");
        if (listParam) return listParam;
    } catch {
        // Not a URL.
    }

    return null;
}

export async function isYoutubeApiConfigured(): Promise<boolean> {
    const data = await callYoutubeApi<{ configured: boolean }>("config");
    return data.configured;
}

export async function fetchPlaylistInfo(playlistId: string): Promise<YTPlaylistInfo> {
    return callYoutubeApi<YTPlaylistInfo>("playlistInfo", { playlistId });
}

export async function fetchPlaylistVideos(playlistId: string): Promise<YTVideoItem[]> {
    return callYoutubeApi<YTVideoItem[]>("playlistVideos", { playlistId });
}

export async function fetchVideoInfo(videoId: string): Promise<YTVideoInfo> {
    return callYoutubeApi<YTVideoInfo>("videoInfo", { videoId });
}
