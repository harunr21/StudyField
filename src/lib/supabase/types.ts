export interface Page {
    id: string;
    user_id: string;
    title: string;
    icon: string;
    parent_id: string | null;
    content: Record<string, unknown>;
    is_archived: boolean;
    is_favorite: boolean;
    created_at: string;
    updated_at: string;
}

export type PageInsert = Omit<Page, "id" | "created_at" | "updated_at">;
export type PageUpdate = Partial<Omit<Page, "id" | "user_id" | "created_at">>;

// YouTube Types
export interface YoutubePlaylist {
    id: string;
    user_id: string;
    playlist_id: string;
    title: string;
    description: string;
    thumbnail_url: string;
    channel_title: string;
    video_count: number;
    created_at: string;
    updated_at: string;
}

export interface YoutubeVideo {
    id: string;
    user_id: string;
    playlist_ref_id: string;
    video_id: string;
    title: string;
    description: string;
    thumbnail_url: string;
    channel_title: string;
    duration: string;
    position: number;
    is_watched: boolean;
    watched_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface YoutubeVideoNote {
    id: string;
    user_id: string;
    video_ref_id: string;
    timestamp_seconds: number;
    content: string;
    created_at: string;
    updated_at: string;
}

// PDF Types
export interface PdfDocument {
    id: string;
    user_id: string;
    title: string;
    file_name: string;
    file_url: string;
    file_size: number;
    page_count: number;
    is_favorite: boolean;
    is_archived: boolean;
    last_page: number;
    tags: string[];
    created_at: string;
    updated_at: string;
}

export interface PdfNote {
    id: string;
    user_id: string;
    pdf_ref_id: string;
    page_number: number;
    content: string;
    color: string;
    created_at: string;
    updated_at: string;
}

