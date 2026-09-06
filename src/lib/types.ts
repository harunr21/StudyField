// Uygulama genelinde kullanilan satir tipleri (D1 / Drizzle semasi ile uyumlu).

export interface YoutubePlaylist {
    id: string;
    user_id: string;
    playlist_id: string;
    title: string;
    description: string;
    thumbnail_url: string;
    channel_title: string;
    video_count: number;
    is_shared: boolean;
    tags: string[];
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

export interface Profile {
    user_id: string;
    username: string;
    display_name: string;
    created_at: string;
    updated_at: string;
}

export interface Friendship {
    id: string;
    requester_id: string;
    addressee_id: string;
    status: "pending" | "accepted";
    created_at: string;
    updated_at: string;
}

export interface FriendshipWithProfile {
    friendship: Friendship;
    profile: Profile;
    /** Mevcut kullaniciya gore: istegi o mu aldi, o mu gonderdi. */
    direction: "incoming" | "outgoing";
}

export interface PlaylistStats {
    total: number;
    watched: number;
    durationSeconds: number;
}

export interface PlaylistWithStats extends YoutubePlaylist {
    stats: PlaylistStats;
}

export const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;

export function deriveInitial(profile: Pick<Profile, "display_name" | "username">): string {
    const source = profile.display_name?.trim() || profile.username;
    return source.charAt(0).toUpperCase();
}
