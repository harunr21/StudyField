import { SupabaseClient } from "@supabase/supabase-js";

export type GlobalSearchItem = {
    id: string;
    kind: "page" | "youtube_video" | "youtube_note" | "pdf_document" | "pdf_note";
    title: string;
    subtitle: string;
    href: string;
};

type PageRow = { id: string; title: string };
type YoutubeVideoRow = { id: string; title: string; playlist_ref_id: string };
type YoutubeNoteRow = { id: string; content: string; timestamp_seconds: number; video_ref_id: string };
type PdfDocumentRow = { id: string; title: string };
type PdfNoteRow = { id: string; content: string; page_number: number; pdf_ref_id: string };

function clip(text: string, max = 80): string {
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
}

export async function searchWorkspace(
    supabase: SupabaseClient,
    query: string
): Promise<GlobalSearchItem[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const like = `%${q}%`;

    const [pagesRes, videosRes, videoNotesRes, pdfDocsRes, pdfNotesRes] = await Promise.all([
        supabase.from("pages").select("id,title").eq("is_archived", false).ilike("title", like).limit(5),
        supabase.from("youtube_videos").select("id,title,playlist_ref_id").ilike("title", like).limit(5),
        supabase
            .from("youtube_video_notes")
            .select("id,content,timestamp_seconds,video_ref_id")
            .ilike("content", like)
            .limit(5),
        supabase
            .from("pdf_documents")
            .select("id,title")
            .eq("is_archived", false)
            .ilike("title", like)
            .limit(5),
        supabase.from("pdf_notes").select("id,content,page_number,pdf_ref_id").ilike("content", like).limit(5),
    ]);

    const pages = (pagesRes.data ?? []) as PageRow[];
    const videos = (videosRes.data ?? []) as YoutubeVideoRow[];
    const videoNotes = (videoNotesRes.data ?? []) as YoutubeNoteRow[];
    const pdfDocuments = (pdfDocsRes.data ?? []) as PdfDocumentRow[];
    const pdfNotes = (pdfNotesRes.data ?? []) as PdfNoteRow[];

    const videoIds = [...new Set(videoNotes.map((note) => note.video_ref_id))];
    const pdfIds = [...new Set(pdfNotes.map((note) => note.pdf_ref_id))];

    const [noteVideoMetaRes, notePdfMetaRes] = await Promise.all([
        videoIds.length
            ? supabase.from("youtube_videos").select("id,title,playlist_ref_id").in("id", videoIds)
            : Promise.resolve({ data: [] as YoutubeVideoRow[] }),
        pdfIds.length
            ? supabase.from("pdf_documents").select("id,title").in("id", pdfIds)
            : Promise.resolve({ data: [] as PdfDocumentRow[] }),
    ]);

    const noteVideos = (noteVideoMetaRes.data ?? []) as YoutubeVideoRow[];
    const notePdfs = (notePdfMetaRes.data ?? []) as PdfDocumentRow[];

    const noteVideoMap = new Map(noteVideos.map((row) => [row.id, row]));
    const notePdfMap = new Map(notePdfs.map((row) => [row.id, row]));

    const items: GlobalSearchItem[] = [];

    for (const row of pages) {
        items.push({
            id: row.id,
            kind: "page",
            title: row.title || "Basliksiz not",
            subtitle: "Not",
            href: `/notes/${row.id}`,
        });
    }

    for (const row of videos) {
        items.push({
            id: row.id,
            kind: "youtube_video",
            title: row.title,
            subtitle: "YouTube video",
            href: `/youtube/${row.playlist_ref_id}/watch/${row.id}`,
        });
    }

    for (const row of videoNotes) {
        const video = noteVideoMap.get(row.video_ref_id);
        if (!video) continue;
        items.push({
            id: row.id,
            kind: "youtube_note",
            title: clip(row.content, 70),
            subtitle: `${video.title} • t=${row.timestamp_seconds}s`,
            href: `/youtube/${video.playlist_ref_id}/watch/${video.id}?t=${row.timestamp_seconds}`,
        });
    }

    for (const row of pdfDocuments) {
        items.push({
            id: row.id,
            kind: "pdf_document",
            title: row.title,
            subtitle: "PDF dokuman",
            href: `/pdf/${row.id}`,
        });
    }

    for (const row of pdfNotes) {
        const doc = notePdfMap.get(row.pdf_ref_id);
        if (!doc) continue;
        items.push({
            id: row.id,
            kind: "pdf_note",
            title: clip(row.content, 70),
            subtitle: `${doc.title} • sayfa ${row.page_number}`,
            href: `/pdf/${doc.id}?page=${row.page_number}`,
        });
    }

    return items.slice(0, 25);
}
