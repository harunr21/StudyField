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

// User Settings Types
export interface UserSettings {
    user_id: string;
    theme: "light" | "dark" | "system";
    language: "tr" | "en";
    default_note_icon: string;
    week_starts_on: 0 | 1;
    daily_goal_minutes: number;
    created_at: string;
    updated_at: string;
}

// Study Sessions Types
export interface StudySession {
    id: string;
    user_id: string;
    source_type: "manual" | "pomodoro" | "youtube" | "pdf" | "notes";
    source_ref_id: string | null;
    started_at: string;
    ended_at: string | null;
    duration_seconds: number;
    planned_duration_seconds: number | null;
    focus_score: number | null;
    notes: string;
    created_at: string;
    updated_at: string;
}

