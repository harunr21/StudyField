"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { formatClockValue, parseDurationToSeconds } from "@/lib/time";
import { getProfileByUsername } from "@/lib/friends";
import type { Profile, YoutubePlaylist, YoutubeVideo } from "@/lib/supabase/types";
import {
    ArrowLeft,
    CheckCircle2,
    Circle,
    Clock,
    ExternalLink,
    Eye,
    ListVideo,
    Loader2,
    Search,
    Youtube,
} from "lucide-react";

export default function FriendPlaylistPage() {
    const params = useParams();
    const username = (params.username as string)?.toLowerCase();
    const playlistId = params.playlistId as string;
    const supabase = useMemo(() => createClient(), []);

    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [playlist, setPlaylist] = useState<YoutubePlaylist | null>(null);
    const [videos, setVideos] = useState<YoutubeVideo[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [filter, setFilter] = useState<"all" | "watched" | "unwatched">("all");

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const targetProfile = await getProfileByUsername(supabase, username);
            if (cancelled) return;
            if (!targetProfile) {
                setLoading(false);
                return;
            }
            setProfile(targetProfile);

            // RLS will return null if not authorized
            const { data: pl } = await supabase
                .from("youtube_playlists")
                .select("*")
                .eq("id", playlistId)
                .eq("user_id", targetProfile.user_id)
                .maybeSingle();

            if (cancelled) return;
            if (!pl) {
                setLoading(false);
                return;
            }
            setPlaylist(pl as YoutubePlaylist);

            const { data: vids } = await supabase
                .from("youtube_videos")
                .select("*")
                .eq("playlist_ref_id", playlistId)
                .order("position", { ascending: true });

            if (cancelled) return;
            setVideos((vids as YoutubeVideo[] | null) ?? []);
            setLoading(false);
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [supabase, username, playlistId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!profile || !playlist) {
        return (
            <div className="p-6 md:p-10 max-w-3xl mx-auto">
                <Link
                    href={profile ? `/users/${profile.username}` : "/friends"}
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
                >
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    Geri
                </Link>
                <div className="rounded-xl border border-dashed border-border/50 p-10 text-center">
                    <div className="font-medium mb-1">Liste görünmüyor</div>
                    <div className="text-sm text-muted-foreground">
                        Bu liste paylaşılmamış veya görme izniniz yok.
                    </div>
                </div>
            </div>
        );
    }

    const total = videos.length;
    const watched = videos.filter((v) => v.is_watched).length;
    const durationSeconds = videos.reduce(
        (acc, v) => acc + parseDurationToSeconds(v.duration ?? ""),
        0,
    );
    const progress = total > 0 ? Math.round((watched / total) * 100) : 0;

    const filtered = videos.filter((v) => {
        const matchesSearch = !searchQuery || v.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter =
            filter === "all" ||
            (filter === "watched" && v.is_watched) ||
            (filter === "unwatched" && !v.is_watched);
        return matchesSearch && matchesFilter;
    });

    return (
        <div className="p-6 md:p-10 max-w-5xl mx-auto">
            <Link
                href={`/users/${profile.username}`}
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
            >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                {profile.display_name?.trim() || `@${profile.username}`}
            </Link>

            {/* Header */}
            <div className="rounded-2xl border border-border/50 bg-card overflow-hidden mb-6">
                <div className="aspect-video sm:aspect-[3/1] bg-muted relative">
                    {playlist.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={playlist.thumbnail_url}
                            alt={playlist.title}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-500/10 to-rose-500/10">
                            <Youtube className="h-16 w-16 text-red-500/40" />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                        <div className="inline-flex items-center gap-1.5 text-xs text-white/80 mb-2">
                            <Eye className="h-3.5 w-3.5" />
                            Salt-okunur · @{profile.username}
                        </div>
                        <h1 className="text-2xl font-bold mb-1">{playlist.title}</h1>
                        {playlist.channel_title && (
                            <div className="text-sm text-white/80">{playlist.channel_title}</div>
                        )}
                    </div>
                </div>
                <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <Stat icon={<ListVideo className="h-4 w-4" />} label="Video" value={String(total)} />
                    <Stat
                        icon={<Clock className="h-4 w-4" />}
                        label="Süre"
                        value={formatClockValue(durationSeconds)}
                    />
                    <Stat
                        icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        label="İzlenen"
                        value={`${watched}/${total}`}
                    />
                    <Stat
                        icon={
                            <div className="h-4 w-4 rounded-full border-2 border-red-500 border-r-transparent" />
                        }
                        label="İlerleme"
                        value={`%${progress}`}
                    />
                </div>
                {total > 0 && (
                    <div className="px-5 pb-5">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${progress === 100
                                    ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                                    : "bg-gradient-to-r from-red-500 to-rose-500"
                                    }`}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Videolarda ara..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-10 bg-card/50 border-border/50"
                    />
                </div>
                <div className="flex gap-1 rounded-md border border-border/50 bg-card/50 p-0.5">
                    {(["all", "watched", "unwatched"] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition ${filter === f
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            {f === "all" ? "Hepsi" : f === "watched" ? "İzlenen" : "İzlenmemiş"}
                        </button>
                    ))}
                </div>
            </div>

            {/* Video list */}
            {filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/50 p-10 text-center text-sm text-muted-foreground">
                    Eşleşen video yok.
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map((v, i) => (
                        <div
                            key={v.id}
                            className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3"
                        >
                            <div className="text-xs text-muted-foreground w-6 text-right flex-shrink-0">
                                {i + 1}
                            </div>
                            {v.is_watched ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                            ) : (
                                <Circle className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
                            )}
                            <div className="relative w-32 aspect-video rounded-md overflow-hidden bg-muted flex-shrink-0">
                                {v.thumbnail_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={v.thumbnail_url}
                                        alt={v.title}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Youtube className="h-6 w-6 text-red-500/40" />
                                    </div>
                                )}
                                {v.duration && (
                                    <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">
                                        {v.duration}
                                    </span>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="font-medium text-sm line-clamp-2 leading-snug">
                                    {v.title}
                                </div>
                                {v.channel_title && (
                                    <div className="text-xs text-muted-foreground mt-1 truncate">
                                        {v.channel_title}
                                    </div>
                                )}
                            </div>
                            <a
                                href={`https://www.youtube.com/watch?v=${v.video_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition flex-shrink-0"
                                title="YouTube'da aç"
                            >
                                <ExternalLink className="h-4 w-4" />
                            </a>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Stat({
    icon,
    label,
    value,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
}) {
    return (
        <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                {icon}
                {label}
            </div>
            <div className="font-semibold">{value}</div>
        </div>
    );
}
