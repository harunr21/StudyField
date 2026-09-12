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

export interface YTSearchResult {
    playlistId: string;
    title: string;
    description: string;
    thumbnailUrl: string;
    channelTitle: string;
}

export async function searchPlaylists(query: string, maxResults = 10): Promise<YTSearchResult[]> {
    return callYoutubeApi<YTSearchResult[]>("search", { q: query, maxResults: String(maxResults) });
}

const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

/**
 * Serbest metinden YouTube video id'lerini cikarir.
 * Linklerin etrafinda parantez, koseli parantez, tirnak veya markdown sozdizimi olabilir:
 *   (https://youtu.be/ID)   [[https://youtu.be/ID]](https://youtu.be/ID)   [baslik](https://youtu.be/ID)
 * Desteklenen bicimler: watch?v=, youtu.be/, /shorts/, /live/, /embed/ ve ciplak 11 karakterlik id.
 * Sira korunur, tekrarlar ayiklanir. Link gibi gorunmeyen duz kelimeler sessizce atlanir.
 */
export function extractVideoIds(input: string): { ids: string[]; invalid: string[] } {
    const ids: string[] = [];
    const invalid: string[] = [];
    const seen = new Set<string>();

    // Parantez, koseli parantez, sivri parantez, tirnak, virgul ve bosluklar ayirici sayilir;
    // YouTube URL'lerinde bu karakterler bulunmaz.
    const tokens = input
        .split(/[\s,;()[\]{}<>"'`]+/)
        .map((t) => t.trim().replace(/^[.:!?]+|[.:!?]+$/g, ""))
        .filter(Boolean);

    for (const token of tokens) {
        const id = parseVideoId(token);
        if (id) {
            if (seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
            continue;
        }
        // Sadece URL'ye benzeyen ya da id uzunlugunda olan girdileri "gecersiz" say;
        // markdown baslik kelimeleri gibi duz metni gurultu olarak yoksay.
        if (/[./]/.test(token) || token.length === 11) {
            invalid.push(token);
        }
    }

    return { ids, invalid };
}

function parseVideoId(token: string): string | null {
    if (VIDEO_ID_REGEX.test(token)) return token;

    let url: URL;
    try {
        url = new URL(token.startsWith("http") ? token : `https://${token}`);
    } catch {
        return null;
    }

    const host = url.hostname.replace(/^www\.|^m\./, "");
    if (!["youtube.com", "youtu.be", "youtube-nocookie.com", "music.youtube.com"].includes(host)) {
        return null;
    }

    const fromQuery = url.searchParams.get("v");
    if (fromQuery && VIDEO_ID_REGEX.test(fromQuery)) return fromQuery;

    const segments = url.pathname.split("/").filter(Boolean);
    if (host === "youtu.be" && segments[0] && VIDEO_ID_REGEX.test(segments[0])) return segments[0];

    const idx = segments.findIndex((s) => ["shorts", "live", "embed", "v"].includes(s));
    if (idx !== -1 && segments[idx + 1] && VIDEO_ID_REGEX.test(segments[idx + 1])) return segments[idx + 1];

    return null;
}

/**
 * Kullanicinin kendi yonettigi listeler: YouTube'a bagli olmadiklari icin senkron edilmez,
 * video eklenebilir ve siralanabilir. (custom_, sub_, copy_ onekleri)
 */
export function isUserManagedPlaylistId(playlistId: string): boolean {
    return playlistId.startsWith("custom_") || playlistId.startsWith("sub_") || playlistId.startsWith("copy_");
}
