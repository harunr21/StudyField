import { SupabaseClient } from "@supabase/supabase-js";

export type GlobalSearchItem = {
    id: string;
    kind: "youtube_video" | "youtube_note";
    title: string;
    subtitle: string;
    href: string;
};

type YoutubeVideoRow = { id: string; title: string; playlist_ref_id: string };
type YoutubeNoteRow = { id: string; content: string; timestamp_seconds: number; video_ref_id: string };

type SearchRows = {
    videos: YoutubeVideoRow[];
    videoNotes: YoutubeNoteRow[];
};

function clip(text: string, max = 80): string {
    if (text.length <= max) return text;
    return `${text.slice(0, max - 3)}...`;
}

async function fetchRowsWithFts(
    supabase: SupabaseClient,
    q: string,
    searchType: "websearch" | "plain" = "websearch"
): Promise<SearchRows> {
    const config = "turkish";
    const [videosRes, videoNotesRes] = await Promise.all([
        supabase
            .from("youtube_videos")
            .select("id,title,playlist_ref_id")
            .textSearch("search_vector", q, { type: searchType, config })
            .limit(8),
        supabase
            .from("youtube_video_notes")
            .select("id,content,timestamp_seconds,video_ref_id")
            .textSearch("search_vector", q, { type: searchType, config })
            .limit(8),
    ]);

    if (videosRes.error || videoNotesRes.error) {
        throw new Error("fts_not_available");
    }

    return {
        videos: (videosRes.data ?? []) as YoutubeVideoRow[],
        videoNotes: (videoNotesRes.data ?? []) as YoutubeNoteRow[],
    };
}

async function fetchRowsWithIlikeFallback(supabase: SupabaseClient, q: string): Promise<SearchRows> {
    const like = `%${q}%`;
    const [videosRes, videoNotesRes] = await Promise.all([
        supabase.from("youtube_videos").select("id,title,playlist_ref_id").ilike("title", like).limit(8),
        supabase
            .from("youtube_video_notes")
            .select("id,content,timestamp_seconds,video_ref_id")
            .ilike("content", like)
            .limit(8),
    ]);

    return {
        videos: (videosRes.data ?? []) as YoutubeVideoRow[],
        videoNotes: (videoNotesRes.data ?? []) as YoutubeNoteRow[],
    };
}

export async function searchWorkspace(
    supabase: SupabaseClient,
    query: string
): Promise<GlobalSearchItem[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    let rows: SearchRows;
    try {
        rows = await fetchRowsWithFts(supabase, q, "websearch");

        if (rows.videos.length === 0 && rows.videoNotes.length === 0) {
            rows = await fetchRowsWithFts(supabase, q, "plain");
        }
    } catch {
        rows = await fetchRowsWithIlikeFallback(supabase, q);
    }

    const videoIds = [...new Set(rows.videoNotes.map((note) => note.video_ref_id))];
    const noteVideoMetaRes = videoIds.length
        ? await supabase.from("youtube_videos").select("id,title,playlist_ref_id").in("id", videoIds)
        : { data: [] as YoutubeVideoRow[] };

    const noteVideos = (noteVideoMetaRes.data ?? []) as YoutubeVideoRow[];
    const noteVideoMap = new Map(noteVideos.map((row) => [row.id, row]));

    const items: GlobalSearchItem[] = [];

    for (const row of rows.videos) {
        items.push({
            id: row.id,
            kind: "youtube_video",
            title: row.title,
            subtitle: "YouTube video",
            href: `/youtube/${row.playlist_ref_id}/watch/${row.id}`,
        });
    }

    for (const row of rows.videoNotes) {
        const video = noteVideoMap.get(row.video_ref_id);
        if (!video) continue;

        items.push({
            id: row.id,
            kind: "youtube_note",
            title: clip(row.content, 70),
            subtitle: `${video.title} | t=${row.timestamp_seconds}s`,
            href: `/youtube/${video.playlist_ref_id}/watch/${video.id}?t=${row.timestamp_seconds}`,
        });
    }

    return items.slice(0, 25);
}
