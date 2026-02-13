import { SupabaseClient } from "@supabase/supabase-js";

export type GlobalSearchItem = {
    id: string;
    kind: "page" | "youtube_video" | "youtube_note" | "pdf_document" | "pdf_note";
    title: string;
    subtitle: string;
    href: string;
};

type PageRow = { id: string; title: string; content: unknown };
type YoutubeVideoRow = { id: string; title: string; playlist_ref_id: string };
type YoutubeNoteRow = { id: string; content: string; timestamp_seconds: number; video_ref_id: string };
type PdfDocumentRow = { id: string; title: string };
type PdfNoteRow = { id: string; content: string; page_number: number; pdf_ref_id: string };

type SearchRows = {
    pages: PageRow[];
    videos: YoutubeVideoRow[];
    videoNotes: YoutubeNoteRow[];
    pdfDocuments: PdfDocumentRow[];
    pdfNotes: PdfNoteRow[];
};

function clip(text: string, max = 80): string {
    if (text.length <= max) return text;
    return `${text.slice(0, max - 3)}...`;
}

function normalize(text: string): string {
    return text.toLocaleLowerCase("tr");
}

function extractText(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map((item) => extractText(item)).join(" ");
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        return Object.values(record)
            .map((item) => extractText(item))
            .join(" ");
    }
    return "";
}

async function fetchRowsWithFts(supabase: SupabaseClient, q: string, searchType: "websearch" | "plain" = "websearch"): Promise<SearchRows> {
    const config = "turkish";
    const [pagesRes, videosRes, videoNotesRes, pdfDocsRes, pdfNotesRes] = await Promise.all([
        supabase
            .from("pages")
            .select("id,title,content")
            .eq("is_archived", false)
            .textSearch("search_vector", q, { type: searchType, config })
            .limit(8),
        supabase
            .from("youtube_videos")
            .select("id,title,playlist_ref_id")
            .textSearch("search_vector", q, { type: searchType, config })
            .limit(5),
        supabase
            .from("youtube_video_notes")
            .select("id,content,timestamp_seconds,video_ref_id")
            .textSearch("search_vector", q, { type: searchType, config })
            .limit(5),
        supabase
            .from("pdf_documents")
            .select("id,title")
            .eq("is_archived", false)
            .textSearch("search_vector", q, { type: searchType, config })
            .limit(5),
        supabase
            .from("pdf_notes")
            .select("id,content,page_number,pdf_ref_id")
            .textSearch("search_vector", q, { type: searchType, config })
            .limit(5),
    ]);

    const hasError = pagesRes.error || videosRes.error || videoNotesRes.error || pdfDocsRes.error || pdfNotesRes.error;
    if (hasError) {
        // Hata durumunda bunu firlat ki fallback devreye girsin
        throw new Error("fts_not_available");
    }

    return {
        pages: (pagesRes.data ?? []) as PageRow[],
        videos: (videosRes.data ?? []) as YoutubeVideoRow[],
        videoNotes: (videoNotesRes.data ?? []) as YoutubeNoteRow[],
        pdfDocuments: (pdfDocsRes.data ?? []) as PdfDocumentRow[],
        pdfNotes: (pdfNotesRes.data ?? []) as PdfNoteRow[],
    };
}

async function fetchRowsWithIlikeFallback(supabase: SupabaseClient, q: string): Promise<SearchRows> {
    const like = `%${q}%`;
    const [pagesRes, videosRes, videoNotesRes, pdfDocsRes, pdfNotesRes] = await Promise.all([
        supabase.from("pages").select("id,title,content").eq("is_archived", false).limit(100),
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

    const normalizedQuery = normalize(q);
    const allPages = (pagesRes.data ?? []) as PageRow[];
    const pages = allPages
        .filter((row) => {
            const title = normalize(row.title || "");
            const content = normalize(extractText(row.content));
            return title.includes(normalizedQuery) || content.includes(normalizedQuery);
        })
        .slice(0, 8);

    return {
        pages,
        videos: (videosRes.data ?? []) as YoutubeVideoRow[],
        videoNotes: (videoNotesRes.data ?? []) as YoutubeNoteRow[],
        pdfDocuments: (pdfDocsRes.data ?? []) as PdfDocumentRow[],
        pdfNotes: (pdfNotesRes.data ?? []) as PdfNoteRow[],
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
        // 1. Once akilli arama (websearch) dene. Kelime koklerine bakar.
        rows = await fetchRowsWithFts(supabase, q, "websearch");

        // Eger websearch bos donerse (stop words yuzunden olabilir: 'cok', 've' gibi),
        // 'plain' aramasi ile tekrar dene.
        const isEmpty =
            rows.pages.length === 0 &&
            rows.videos.length === 0 &&
            rows.videoNotes.length === 0 &&
            rows.pdfDocuments.length === 0 &&
            rows.pdfNotes.length === 0;

        if (isEmpty) {
            rows = await fetchRowsWithFts(supabase, q, "plain");
        }

    } catch {
        // FTS tamamen patlarsa (syntax hatasi vs), ilike ile kurtar
        rows = await fetchRowsWithIlikeFallback(supabase, q);
    }

    const videoIds = [...new Set(rows.videoNotes.map((note) => note.video_ref_id))];
    const pdfIds = [...new Set(rows.pdfNotes.map((note) => note.pdf_ref_id))];

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

    for (const row of rows.pages) {
        const contentText = extractText(row.content);
        const subtitle = contentText.trim().length > 0 ? "Not basligi/icerigi" : "Not basligi";
        items.push({
            id: row.id,
            kind: "page",
            title: row.title || "Basliksiz not",
            subtitle,
            href: `/notes/${row.id}`,
        });
    }

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

    for (const row of rows.pdfDocuments) {
        items.push({
            id: row.id,
            kind: "pdf_document",
            title: row.title,
            subtitle: "PDF dokuman",
            href: `/pdf/${row.id}`,
        });
    }

    for (const row of rows.pdfNotes) {
        const doc = notePdfMap.get(row.pdf_ref_id);
        if (!doc) continue;
        items.push({
            id: row.id,
            kind: "pdf_note",
            title: clip(row.content, 70),
            subtitle: `${doc.title} | sayfa ${row.page_number}`,
            href: `/pdf/${doc.id}?page=${row.page_number}`,
        });
    }

    return items.slice(0, 25);
}

