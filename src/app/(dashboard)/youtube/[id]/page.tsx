"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { YoutubePlaylist, YoutubeVideo } from "@/lib/supabase/types";
import { fetchPlaylistVideos, fetchPlaylistInfo } from "@/lib/youtube";
import { formatClockValue, parseDurationToSeconds } from "@/lib/time";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    ArrowLeft,
    Youtube,
    Search,
    Loader2,
    CheckCircle2,
    Circle,
    Play,
    ExternalLink,
    Trash2,
    Clock,
    StickyNote,
    ListVideo,
    MoreHorizontal,
    RefreshCw,
    Copy,
    Scissors,
    Sparkles,
    AlertCircle,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function PlaylistDetailPage() {
    const params = useParams();
    const router = useRouter();
    const playlistId = params.id as string;
    const supabase = useMemo(() => createClient(), []);

    const [playlist, setPlaylist] = useState<YoutubePlaylist | null>(null);
    const [videos, setVideos] = useState<YoutubeVideo[]>([]);
    const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
    const [initialLoading, setInitialLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [filter, setFilter] = useState<"all" | "watched" | "unwatched">("all");
    const [syncing, setSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState("");
    const [titleDialogOpen, setTitleDialogOpen] = useState(false);
    const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");

    // Sub-playlist creation state
    const [subPlaylistDialogOpen, setSubPlaylistDialogOpen] = useState(false);
    const [subPlaylistRange, setSubPlaylistRange] = useState<[number, number]>([1, 1]);
    const [subPlaylistName, setSubPlaylistName] = useState("");
    const [creatingSubPlaylist, setCreatingSubPlaylist] = useState(false);
    const [subPlaylistError, setSubPlaylistError] = useState("");
    const [subPlaylistSuccess, setSubPlaylistSuccess] = useState("");

    // Initial data fetch
    useEffect(() => {
        let cancelled = false;

        const fetchData = async () => {
            // Fetch playlist info
            const { data: plData, error: plError } = await supabase
                .from("youtube_playlists")
                .select("*")
                .eq("id", playlistId)
                .single();

            if (cancelled) return;

            if (plError || !plData) {
                router.push("/youtube");
                return;
            }

            setPlaylist(plData as YoutubePlaylist);

            // Fetch videos
            const { data: vidData } = await supabase
                .from("youtube_videos")
                .select("*")
                .eq("playlist_ref_id", playlistId)
                .order("position", { ascending: true });

            if (cancelled) return;

            if (vidData) {
                setVideos(vidData as YoutubeVideo[]);

                // Fetch note counts for all videos efficiently
                const videoIds = vidData.map((v) => v.id);
                if (videoIds.length > 0) {
                    const { data: allNotes } = await supabase
                        .from("youtube_video_notes")
                        .select("video_ref_id")
                        .in("video_ref_id", videoIds);

                    if (!cancelled && allNotes) {
                        const counts: Record<string, number> = {};
                        for (const note of allNotes) {
                            const videoId = note.video_ref_id;
                            counts[videoId] = (counts[videoId] || 0) + 1;
                        }
                        setNoteCounts(counts);
                    }
                }
            }

            setInitialLoading(false);
        };

        fetchData();

        return () => {
            cancelled = true;
        };
    }, [playlistId, router, supabase]);

    // Refresh data (without loading spinner)
    const refreshData = useCallback(async () => {
        const { data: plData } = await supabase
            .from("youtube_playlists")
            .select("*")
            .eq("id", playlistId)
            .single();

        if (plData) {
            setPlaylist(plData as YoutubePlaylist);
        }

        const { data: vidData } = await supabase
            .from("youtube_videos")
            .select("*")
            .eq("playlist_ref_id", playlistId)
            .order("position", { ascending: true });

        if (vidData) {
            setVideos(vidData as YoutubeVideo[]);

            const videoIds = vidData.map((v) => v.id);
            if (videoIds.length > 0) {
                const { data: allNotes } = await supabase
                    .from("youtube_video_notes")
                    .select("video_ref_id")
                    .in("video_ref_id", videoIds);

                if (allNotes) {
                    const counts: Record<string, number> = {};
                    for (const note of allNotes) {
                        const videoId = note.video_ref_id;
                        counts[videoId] = (counts[videoId] || 0) + 1;
                    }
                    setNoteCounts(counts);
                }
            }
        }
    }, [playlistId, supabase]);

    // Sync videos from YouTube API (re-fetch and update)
    const syncVideos = async () => {
        if (!playlist) return;
        setSyncing(true);
        setSyncMessage("YouTube'dan videolar çekiliyor...");

        try {
            // Refresh playlist info
            const playlistInfo = await fetchPlaylistInfo(playlist.playlist_id);

            // Update playlist info in Supabase
            await supabase
                .from("youtube_playlists")
                .update({
                    title: playlistInfo.title,
                    description: playlistInfo.description,
                    thumbnail_url: playlistInfo.thumbnailUrl,
                    channel_title: playlistInfo.channelTitle,
                    video_count: playlistInfo.videoCount,
                })
                .eq("id", playlist.id);

            // Fetch all videos from YouTube
            setSyncMessage(`${playlistInfo.videoCount} video çekiliyor...`);
            const ytVideos = await fetchPlaylistVideos(playlist.playlist_id);

            // Get existing video IDs from Supabase to preserve watch status
            const { data: existingVideos } = await supabase
                .from("youtube_videos")
                .select("video_id, is_watched, watched_at")
                .eq("playlist_ref_id", playlist.id);

            const existingMap = new Map<string, { is_watched: boolean; watched_at: string | null }>();
            if (existingVideos) {
                for (const ev of existingVideos) {
                    existingMap.set(ev.video_id, {
                        is_watched: ev.is_watched,
                        watched_at: ev.watched_at,
                    });
                }
            }

            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setSyncing(false);
                setSyncMessage("");
                return;
            }

            // Delete old videos and re-insert (preserving watch status)
            const ytVideoIds = new Set(ytVideos.map((v) => v.videoId));
            const existingVideoIds = new Set(existingMap.keys());

            // Find new videos to add
            const newVideos = ytVideos.filter((v) => !existingVideoIds.has(v.videoId));

            // Find removed videos (no longer in YouTube playlist)
            const removedVideoIds = [...existingVideoIds].filter((id) => !ytVideoIds.has(id));

            // Delete removed videos
            if (removedVideoIds.length > 0) {
                for (const vid of removedVideoIds) {
                    await supabase
                        .from("youtube_videos")
                        .delete()
                        .eq("playlist_ref_id", playlist.id)
                        .eq("video_id", vid);
                }
            }

            // Add new videos
            if (newVideos.length > 0) {
                setSyncMessage(`${newVideos.length} yeni video ekleniyor...`);
                const videoRows = newVideos.map((v) => ({
                    user_id: user.id,
                    playlist_ref_id: playlist.id,
                    video_id: v.videoId,
                    title: v.title,
                    description: v.description,
                    thumbnail_url: v.thumbnailUrl,
                    channel_title: v.channelTitle,
                    duration: v.durationFormatted,
                    position: v.position,
                }));

                for (let i = 0; i < videoRows.length; i += 50) {
                    const batch = videoRows.slice(i, i + 50);
                    await supabase.from("youtube_videos").insert(batch);
                }
            }

            // Update positions and titles for existing videos
            for (const ytVid of ytVideos) {
                if (existingVideoIds.has(ytVid.videoId)) {
                    await supabase
                        .from("youtube_videos")
                        .update({
                            title: ytVid.title,
                            thumbnail_url: ytVid.thumbnailUrl,
                            channel_title: ytVid.channelTitle,
                            duration: ytVid.durationFormatted,
                            position: ytVid.position,
                        })
                        .eq("playlist_ref_id", playlist.id)
                        .eq("video_id", ytVid.videoId);
                }
            }

            setSyncMessage(
                newVideos.length > 0
                    ? `✓ ${newVideos.length} yeni video eklendi!`
                    : removedVideoIds.length > 0
                        ? `✓ Güncellendi. ${removedVideoIds.length} video kaldırıldı.`
                        : "✓ Playlist güncel."
            );
            setTimeout(() => setSyncMessage(""), 3000);

            refreshData();
        } catch (err) {
            setSyncMessage(err instanceof Error ? `Hata: ${err.message}` : "Senkronizasyon hatası.");
            setTimeout(() => setSyncMessage(""), 4000);
        }

        setSyncing(false);
    };

    const toggleWatched = useCallback(async (video: YoutubeVideo) => {
        const newWatched = !video.is_watched;
        const watchedAt = newWatched ? new Date().toISOString() : null;

        // Optimistic update
        setVideos(prev =>
            prev.map(v =>
                v.id === video.id
                    ? { ...v, is_watched: newWatched, watched_at: watchedAt }
                    : v
            )
        );

        await supabase
            .from("youtube_videos")
            .update({
                is_watched: newWatched,
                watched_at: watchedAt,
            })
            .eq("id", video.id);
    }, [supabase]);

    const deleteVideo = useCallback(async (id: string) => {
        if (!confirm("Bu videoyu silmek istediğine emin misin?")) return;

        // Optimistic update
        setVideos(prev => prev.filter(v => v.id !== id));

        await supabase.from("youtube_videos").delete().eq("id", id);
    }, [supabase]);

    // Filtered videos (memoized)
    const filteredVideos = useMemo(() => {
        return videos
            .filter((v) => {
                if (filter === "watched") return v.is_watched;
                if (filter === "unwatched") return !v.is_watched;
                return true;
            })
            .filter((v) =>
                v.title.toLowerCase().includes(searchQuery.toLowerCase())
            );
    }, [videos, filter, searchQuery]);

    const watchedCount = useMemo(() => videos.filter((v) => v.is_watched).length, [videos]);
    const progress = useMemo(
        () => videos.length > 0 ? Math.round((watchedCount / videos.length) * 100) : 0,
        [watchedCount, videos.length]
    );
    const totalDurationSeconds = useMemo(
        () => videos.reduce((total, video) => total + parseDurationToSeconds(video.duration ?? ""), 0),
        [videos]
    );
    const unwatchedDurationSeconds = useMemo(
        () =>
            videos.reduce(
                (total, video) => total + (video.is_watched ? 0 : parseDurationToSeconds(video.duration ?? "")),
                0
            ),
        [videos]
    );
    const titleListText = useMemo(() => videos.map((video) => video.title).join("\n"), [videos]);

    const copyTitles = useCallback(async () => {
        if (!titleListText) return;

        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
                await navigator.clipboard.writeText(titleListText);
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = titleListText;
                textArea.style.position = "fixed";
                textArea.style.opacity = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const copied = document.execCommand("copy");
                document.body.removeChild(textArea);

                if (!copied) {
                    throw new Error("copy_failed");
                }
            }

            setCopyState("success");
            setTimeout(() => setCopyState("idle"), 2000);
        } catch {
            setCopyState("error");
            setTimeout(() => setCopyState("idle"), 2500);
        }
    }, [titleListText]);

    // Sub-playlist helpers
    const subPlaylistVideos = useMemo(() => {
        if (videos.length === 0) return [];
        // range is 1-indexed
        const start = Math.max(0, subPlaylistRange[0] - 1);
        const end = Math.min(videos.length, subPlaylistRange[1]);
        return videos.slice(start, end);
    }, [videos, subPlaylistRange]);

    const subPlaylistDuration = useMemo(
        () => subPlaylistVideos.reduce((total, v) => total + parseDurationToSeconds(v.duration ?? ""), 0),
        [subPlaylistVideos]
    );

    const openSubPlaylistDialog = useCallback(() => {
        if (videos.length < 2) return;
        const defaultEnd = Math.min(videos.length, 10);
        setSubPlaylistRange([1, defaultEnd]);
        setSubPlaylistName("");
        setSubPlaylistError("");
        setSubPlaylistSuccess("");
        setSubPlaylistDialogOpen(true);
    }, [videos.length]);

    const createSubPlaylist = useCallback(async () => {
        if (!playlist || subPlaylistVideos.length === 0) return;

        const name = subPlaylistName.trim() || `${playlist.title} (${subPlaylistRange[0]}-${subPlaylistRange[1]})`;

        setCreatingSubPlaylist(true);
        setSubPlaylistError("");
        setSubPlaylistSuccess("");

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setSubPlaylistError("Giriş yapmanız gerekiyor.");
                setCreatingSubPlaylist(false);
                return;
            }

            // Create a new playlist entry
            const { data: newPlaylist, error: insertError } = await supabase
                .from("youtube_playlists")
                .insert({
                    user_id: user.id,
                    playlist_id: `sub_${playlist.playlist_id}_${Date.now()}`,
                    title: name,
                    description: `"${playlist.title}" listesinden oluşturulan alt playlist (Video ${subPlaylistRange[0]}-${subPlaylistRange[1]})`,
                    thumbnail_url: subPlaylistVideos[0]?.thumbnail_url || playlist.thumbnail_url,
                    channel_title: playlist.channel_title,
                    video_count: subPlaylistVideos.length,
                })
                .select()
                .single();

            if (insertError || !newPlaylist) {
                setSubPlaylistError("Alt playlist oluşturulurken bir hata oluştu.");
                setCreatingSubPlaylist(false);
                return;
            }

            // Copy selected videos to the new playlist
            const videoRows = subPlaylistVideos.map((v, idx) => ({
                user_id: user.id,
                playlist_ref_id: newPlaylist.id,
                video_id: v.video_id,
                title: v.title,
                description: v.description,
                thumbnail_url: v.thumbnail_url,
                channel_title: v.channel_title,
                duration: v.duration,
                position: idx,
                is_watched: v.is_watched,
                watched_at: v.watched_at,
            }));

            for (let i = 0; i < videoRows.length; i += 50) {
                const batch = videoRows.slice(i, i + 50);
                await supabase.from("youtube_videos").insert(batch);
            }

            setSubPlaylistSuccess(`"${name}" başarıyla oluşturuldu!`);
            setTimeout(() => {
                setSubPlaylistDialogOpen(false);
                router.push(`/youtube/${newPlaylist.id}`);
            }, 1500);
        } catch (err) {
            setSubPlaylistError(err instanceof Error ? err.message : "Bir hata oluştu.");
        }

        setCreatingSubPlaylist(false);
    }, [playlist, subPlaylistVideos, subPlaylistName, subPlaylistRange, supabase, router]);

    if (initialLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!playlist) return null;

    return (
        <div className="max-w-5xl mx-auto p-6 md:p-10">
            {/* Back Button */}
            <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/youtube")}
                className="gap-1.5 mb-6 -ml-2"
            >
                <ArrowLeft className="h-4 w-4" />
                Playlistler
            </Button>

            {/* Playlist Header */}
            <div className="mb-8">
                <div className="flex flex-col md:flex-row gap-6">
                    {/* Thumbnail */}
                    <div className="flex-shrink-0 w-full md:w-72 aspect-video rounded-xl overflow-hidden bg-muted">
                        {playlist.thumbnail_url ? (
                            <img
                                src={playlist.thumbnail_url}
                                alt={playlist.title}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-500/10 to-rose-500/10">
                                <Youtube className="h-12 w-12 text-red-500/40" />
                            </div>
                        )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2 line-clamp-2">
                            {playlist.title}
                        </h1>
                        {playlist.channel_title && (
                            <p className="text-muted-foreground mb-4">{playlist.channel_title}</p>
                        )}

                        {/* Stats */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
                            <div className="bg-card/50 rounded-xl p-3 border border-border/50 text-center">
                                <p className="text-xl font-bold text-red-400">{videos.length}</p>
                                <p className="text-xs text-muted-foreground">Video</p>
                            </div>
                            <div className="bg-card/50 rounded-xl p-3 border border-border/50 text-center">
                                <p className="text-xl font-bold text-emerald-400">{watchedCount}</p>
                                <p className="text-xs text-muted-foreground">Tamamlandı</p>
                            </div>
                            <div className="bg-card/50 rounded-xl p-3 border border-border/50 text-center">
                                <p className={`text-xl font-bold ${progress === 100 ? "text-emerald-400" : "text-amber-400"}`}>
                                    %{progress}
                                </p>
                                <p className="text-xs text-muted-foreground">İlerleme</p>
                            </div>
                            <div className="bg-card/50 rounded-xl p-3 border border-border/50 text-center">
                                <p className="text-xl font-bold text-sky-400">{formatClockValue(totalDurationSeconds)}</p>
                                <p className="text-xs text-muted-foreground">Süre</p>
                            </div>
                            <div className="bg-card/50 rounded-xl p-3 border border-border/50 text-center">
                                <p className="text-xl font-bold text-violet-400">{formatClockValue(unwatchedDurationSeconds)}</p>
                                <p className="text-xs text-muted-foreground">Kalan Süre</p>
                            </div>
                        </div>

                        {/* Progress bar */}
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-700 ${progress === 100
                                    ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                                    : "bg-gradient-to-r from-red-500 to-rose-500"
                                    }`}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Videolarda ara..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-10 bg-card/50 border-border/50"
                    />
                </div>
                <div className="flex items-center gap-2">
                    {/* Filters */}
                    <div className="flex rounded-lg border border-border/50 overflow-hidden">
                        {[
                            { value: "all" as const, label: "Tümü" },
                            { value: "unwatched" as const, label: "İzlenmemiş" },
                            { value: "watched" as const, label: "İzlendi" },
                        ].map((f) => (
                            <button
                                key={f.value}
                                onClick={() => setFilter(f.value)}
                                className={`px-3 py-2 text-xs font-medium transition-colors ${filter === f.value
                                    ? "bg-red-500/10 text-red-400"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                                    }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>

                    {/* Sync Videos Button */}
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={syncVideos}
                        disabled={syncing}
                        className="gap-1.5"
                    >
                        <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                        Yenile
                    </Button>

                    <Dialog
                        open={titleDialogOpen}
                        onOpenChange={(open) => {
                            setTitleDialogOpen(open);
                            if (!open) {
                                setCopyState("idle");
                            }
                        }}
                    >
                        <DialogTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1.5">
                                <Copy className="h-4 w-4" />
                                Başlıkları Kopyala
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg">
                            <DialogHeader>
                                <DialogTitle>Video Başlıkları</DialogTitle>
                                <DialogDescription>
                                    Başlıklar alt alta listelendi. Tek tıkla tamamını panoya kopyalayabilirsiniz.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3">
                                <div className="max-h-[50vh] overflow-y-auto rounded-md border bg-card/60 p-3">
                                    {titleListText ? (
                                        <pre className="text-sm leading-relaxed whitespace-pre-wrap break-words font-sans">
                                            {titleListText}
                                        </pre>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">Henüz video başlığı bulunmuyor.</p>
                                    )}
                                </div>

                                <div className="flex items-center justify-between gap-2">
                                    <Button onClick={copyTitles} disabled={!titleListText} className="gap-1.5">
                                        <Copy className="h-4 w-4" />
                                        {copyState === "success" ? "Kopyalandı" : "Hepsini Kopyala"}
                                    </Button>
                                    {copyState === "error" && (
                                        <span className="text-xs text-destructive">
                                            Kopyalama başarısız. Tekrar deneyin.
                                        </span>
                                    )}
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>

                    {/* Sub-Playlist Creation Button */}
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={openSubPlaylistDialog}
                        disabled={videos.length < 2}
                        className="gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    >
                        <Scissors className="h-4 w-4" />
                        Alt Playlist
                    </Button>
                </div>

                {/* Sub-Playlist Dialog */}
                <Dialog
                    open={subPlaylistDialogOpen}
                    onOpenChange={(open) => {
                        setSubPlaylistDialogOpen(open);
                        if (!open) {
                            setSubPlaylistError("");
                            setSubPlaylistSuccess("");
                        }
                    }}
                >
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
                                    <Scissors className="h-4 w-4 text-white" />
                                </div>
                                Alt Playlist Oluştur
                            </DialogTitle>
                            <DialogDescription>
                                Video aralığı seçerek mevcut playlistten yeni bir alt playlist oluşturun.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-5 mt-2">
                            {/* Playlist Name Input */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Playlist Adı</label>
                                <Input
                                    placeholder={playlist ? `${playlist.title} (${subPlaylistRange[0]}-${subPlaylistRange[1]})` : "Alt Playlist"}
                                    value={subPlaylistName}
                                    onChange={(e) => setSubPlaylistName(e.target.value)}
                                    disabled={creatingSubPlaylist}
                                    className="h-10"
                                />
                            </div>

                            {/* Range selector */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-foreground">Video Aralığı</label>

                                {/* Range info cards */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-card/80 rounded-xl p-3 border border-border/50 text-center">
                                        <p className="text-lg font-bold text-red-400">{subPlaylistRange[0]}</p>
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Başlangıç</p>
                                    </div>
                                    <div className="bg-card/80 rounded-xl p-3 border border-border/50 text-center">
                                        <p className="text-lg font-bold text-rose-400">{subPlaylistRange[1]}</p>
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Bitiş</p>
                                    </div>
                                    <div className="bg-card/80 rounded-xl p-3 border border-border/50 text-center">
                                        <p className="text-lg font-bold text-amber-400">{subPlaylistVideos.length}</p>
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Video</p>
                                    </div>
                                </div>

                                {/* Dual Range Slider */}
                                <div className="px-1">
                                    <Slider
                                        min={1}
                                        max={videos.length}
                                        value={subPlaylistRange}
                                        onValueChange={setSubPlaylistRange}
                                        step={1}
                                    />
                                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                                        <span>1</span>
                                        <span>{videos.length}</span>
                                    </div>
                                </div>

                                {/* Manual input for precise range */}
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        min={1}
                                        max={subPlaylistRange[1]}
                                        value={subPlaylistRange[0]}
                                        onChange={(e) => {
                                            const val = Math.max(1, Math.min(Number(e.target.value), subPlaylistRange[1]));
                                            setSubPlaylistRange([val, subPlaylistRange[1]]);
                                        }}
                                        disabled={creatingSubPlaylist}
                                        className="h-9 text-center text-sm"
                                    />
                                    <span className="text-muted-foreground text-sm font-medium">—</span>
                                    <Input
                                        type="number"
                                        min={subPlaylistRange[0]}
                                        max={videos.length}
                                        value={subPlaylistRange[1]}
                                        onChange={(e) => {
                                            const val = Math.max(subPlaylistRange[0], Math.min(Number(e.target.value), videos.length));
                                            setSubPlaylistRange([subPlaylistRange[0], val]);
                                        }}
                                        disabled={creatingSubPlaylist}
                                        className="h-9 text-center text-sm"
                                    />
                                </div>
                            </div>

                            {/* Duration info */}
                            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card/50 rounded-lg px-3 py-2 border border-border/30">
                                <Clock className="h-4 w-4 text-sky-400" />
                                <span>Toplam süre: <strong className="text-foreground">{formatClockValue(subPlaylistDuration)}</strong></span>
                            </div>

                            {/* Preview of selected videos */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Seçilen Videolar</label>
                                <div className="max-h-[200px] overflow-y-auto rounded-lg border border-border/50 bg-card/30 divide-y divide-border/30">
                                    {subPlaylistVideos.map((video, idx) => (
                                        <div key={video.id} className="flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors">
                                            <span className="text-xs text-muted-foreground font-mono w-5 text-right flex-shrink-0">
                                                {subPlaylistRange[0] + idx}
                                            </span>
                                            <div className="flex-shrink-0 w-16 aspect-video rounded overflow-hidden bg-muted">
                                                <img
                                                    src={video.thumbnail_url || `https://img.youtube.com/vi/${video.video_id}/mqdefault.jpg`}
                                                    alt={video.title}
                                                    className="w-full h-full object-cover"
                                                    loading="lazy"
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium line-clamp-1">{video.title}</p>
                                                {video.duration && (
                                                    <p className="text-[10px] text-muted-foreground">{video.duration}</p>
                                                )}
                                            </div>
                                            {video.is_watched && (
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Error / Success */}
                            {subPlaylistError && (
                                <div className="flex items-start gap-2 text-sm text-destructive">
                                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                    <span>{subPlaylistError}</span>
                                </div>
                            )}
                            {subPlaylistSuccess && (
                                <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2">
                                    <Sparkles className="h-4 w-4 flex-shrink-0" />
                                    <span>{subPlaylistSuccess}</span>
                                </div>
                            )}

                            {/* Create button */}
                            <Button
                                onClick={createSubPlaylist}
                                disabled={creatingSubPlaylist || subPlaylistVideos.length === 0 || !!subPlaylistSuccess}
                                className="w-full bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-lg shadow-red-500/20"
                            >
                                {creatingSubPlaylist ? (
                                    <>
                                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                        Oluşturuluyor...
                                    </>
                                ) : (
                                    <>
                                        <Scissors className="mr-1.5 h-4 w-4" />
                                        {subPlaylistVideos.length} Video ile Alt Playlist Oluştur
                                    </>
                                )}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Sync message */}
            {syncMessage && (
                <div className={`flex items-center gap-2 text-sm mb-4 px-3 py-2 rounded-lg ${syncMessage.startsWith("✓")
                    ? "bg-emerald-500/10 text-emerald-400"
                    : syncMessage.startsWith("Hata")
                        ? "bg-destructive/10 text-destructive"
                        : "bg-card text-muted-foreground"
                    }`}>
                    {!syncMessage.startsWith("✓") && !syncMessage.startsWith("Hata") && (
                        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                    )}
                    <span>{syncMessage}</span>
                </div>
            )}

            {/* Video List */}
            {filteredVideos.length === 0 && !initialLoading && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
                        <ListVideo className="h-7 w-7 text-red-500" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">
                        {searchQuery || filter !== "all" ? "Video bulunamadı" : "Henüz video yok"}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        {searchQuery || filter !== "all"
                            ? "Filtreleri değiştirmeyi deneyin"
                            : "Videoları çekmek için 'Yenile' butonuna tıklayın"}
                    </p>
                </div>
            )}

            <div className="space-y-2">
                {filteredVideos.map((video, index) => (
                    <div
                        key={video.id}
                        className={`group flex items-center gap-4 p-3 rounded-xl border transition-all duration-200 hover:shadow-md ${video.is_watched
                            ? "border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/30"
                            : "border-border/50 bg-card hover:border-border"
                            }`}
                    >
                        {/* Watch toggle */}
                        <button
                            onClick={() => toggleWatched(video)}
                            className="flex-shrink-0 transition-transform hover:scale-110"
                            title={video.is_watched ? "İzlenmedi olarak işaretle" : "İzlendi olarak işaretle"}
                        >
                            {video.is_watched ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            ) : (
                                <Circle className="h-5 w-5 text-muted-foreground hover:text-red-400" />
                            )}
                        </button>

                        {/* Position number */}
                        <span className="text-xs text-muted-foreground w-6 text-center flex-shrink-0 font-mono">
                            {index + 1}
                        </span>

                        {/* Thumbnail */}
                        <div
                            className="flex-shrink-0 w-32 aspect-video rounded-lg overflow-hidden bg-muted cursor-pointer relative group/thumb"
                            onClick={() => router.push(`/youtube/${playlistId}/watch/${video.id}`)}
                        >
                            <img
                                src={video.thumbnail_url || `https://img.youtube.com/vi/${video.video_id}/mqdefault.jpg`}
                                alt={video.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/40 transition-colors flex items-center justify-center">
                                <Play className="h-6 w-6 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                            </div>
                            {/* Duration badge */}
                            {video.duration && (
                                <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                                    {video.duration}
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => router.push(`/youtube/${playlistId}/watch/${video.id}`)}
                        >
                            <h4 className={`font-medium text-sm line-clamp-2 mb-1 ${video.is_watched ? "text-muted-foreground" : ""}`}>
                                {video.title}
                            </h4>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                {video.channel_title && (
                                    <span>{video.channel_title}</span>
                                )}
                                {video.duration && (
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {video.duration}
                                    </span>
                                )}
                                {noteCounts[video.id] > 0 && (
                                    <span className="flex items-center gap-1 text-amber-500">
                                        <StickyNote className="h-3 w-3" />
                                        {noteCounts[video.id]} not
                                    </span>
                                )}
                                {video.watched_at && (
                                    <span className="flex items-center gap-1 text-emerald-500">
                                        <CheckCircle2 className="h-3 w-3" />
                                        İzlendi
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="p-1.5 rounded-md hover:bg-accent transition-colors">
                                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem
                                        onClick={() =>
                                            window.open(
                                                `https://www.youtube.com/watch?v=${video.video_id}`,
                                                "_blank"
                                            )
                                        }
                                    >
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        YouTube&apos;da Aç
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => deleteVideo(video.id)}
                                        className="text-destructive focus:text-destructive"
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Sil
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
