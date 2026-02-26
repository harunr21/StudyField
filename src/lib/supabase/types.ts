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

// User Settings Types
export interface UserSettings {
    user_id: string;
    theme: "light" | "dark" | "system";
    language: "tr" | "en";
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
    tag: string | null;
    created_at: string;
    updated_at: string;
}
