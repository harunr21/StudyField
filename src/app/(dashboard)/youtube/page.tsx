"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { YoutubePlaylist } from "@/lib/supabase/types";
import {
    extractPlaylistId,
    fetchPlaylistInfo,
    fetchPlaylistVideos,
    isYoutubeApiConfigured,
} from "@/lib/youtube";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Youtube,
    PlusCircle,
    Search,
    Loader2,
    MoreHorizontal,
    Trash2,
    ExternalLink,
    ListVideo,
    CheckCircle2,
    Clock,
    Play,
    AlertCircle,
    KeyRound,
} from "lucide-react";

// Helper: Format date
function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

export default function YoutubePage() {
    const [playlists, setPlaylists] = useState<YoutubePlaylist[]>([]);
    const [videoStats, setVideoStats] = useState<Record<string, { total: number; watched: number }>>({});
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [playlistUrl, setPlaylistUrl] = useState("");
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState("");
    const [addProgress, setAddProgress] = useState("");
    const [apiConfigured, setApiConfigured] = useState(true);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        setApiConfigured(isYoutubeApiConfigured());
    }, []);

    const fetchPlaylists = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("youtube_playlists")
            .select("*")
            .order("updated_at", { ascending: false });

        if (!error && data) {
            setPlaylists(data as YoutubePlaylist[]);

            // Fetch video stats for each playlist
            const stats: Record<string, { total: number; watched: number }> = {};
            for (const pl of data as YoutubePlaylist[]) {
                const { data: videos } = await supabase
                    .from("youtube_videos")
                    .select("is_watched")
                    .eq("playlist_ref_id", pl.id);

                if (videos) {
                    stats[pl.id] = {
                        total: videos.length,
                        watched: videos.filter((v: { is_watched: boolean }) => v.is_watched).length,
                    };
                }
            }
            setVideoStats(stats);
        }
        setLoading(false);
    }, [supabase]);

    useEffect(() => {
        fetchPlaylists();
    }, [fetchPlaylists]);

    const addPlaylist = async () => {
        setAddError("");
        setAddProgress("");
        const playlistId = extractPlaylistId(playlistUrl);

        if (!playlistId) {
            setAddError("Geçerli bir YouTube playlist URL'si veya ID'si girin.");
            return;
        }

        setAdding(true);

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            setAddError("Giriş yapmanız gerekiyor.");
            setAdding(false);
            return;
        }

        // Check if playlist already exists
        const { data: existing } = await supabase
            .from("youtube_playlists")
            .select("id")
            .eq("user_id", user.id)
            .eq("playlist_id", playlistId)
            .single();

        if (existing) {
            setAddError("Bu playlist zaten eklenmiş.");
            setAdding(false);
            return;
        }

        try {
            // Step 1: Fetch playlist info from YouTube API v3
            setAddProgress("Playlist bilgileri çekiliyor...");
            const playlistInfo = await fetchPlaylistInfo(playlistId);

            // Step 2: Save playlist to Supabase
            setAddProgress("Playlist kaydediliyor...");
            const { data: newPlaylist, error: insertError } = await supabase
                .from("youtube_playlists")
                .insert({
                    user_id: user.id,
                    playlist_id: playlistId,
                    title: playlistInfo.title,
                    description: playlistInfo.description,
                    thumbnail_url: playlistInfo.thumbnailUrl,
                    channel_title: playlistInfo.channelTitle,
                    video_count: playlistInfo.videoCount,
                })
                .select()
                .single();

            if (insertError || !newPlaylist) {
                setAddError("Playlist kaydedilirken bir hata oluştu.");
                setAdding(false);
                return;
            }

            // Step 3: Fetch all videos from the playlist
            setAddProgress(`Videolar çekiliyor (${playlistInfo.videoCount} video)...`);
            const videos = await fetchPlaylistVideos(playlistId);

            // Step 4: Save all videos to Supabase
            setAddProgress(`${videos.length} video kaydediliyor...`);
            if (videos.length > 0) {
                const videoRows = videos.map((v) => ({
                    user_id: user.id,
                    playlist_ref_id: newPlaylist.id,
                    video_id: v.videoId,
                    title: v.title,
                    description: v.description,
                    thumbnail_url: v.thumbnailUrl,
                    channel_title: v.channelTitle,
                    duration: v.durationFormatted,
                    position: v.position,
                }));

                // Insert in batches of 50 to avoid payload limits
                for (let i = 0; i < videoRows.length; i += 50) {
                    const batch = videoRows.slice(i, i + 50);
                    await supabase.from("youtube_videos").insert(batch);
                    setAddProgress(`Videolar kaydediliyor... (${Math.min(i + 50, videoRows.length)}/${videoRows.length})`);
                }
            }

            setPlaylistUrl("");
            setDialogOpen(false);
            setAdding(false);
            setAddProgress("");
            router.push(`/youtube/${newPlaylist.id}`);
        } catch (err) {
            setAddError(err instanceof Error ? err.message : "Bir hata oluştu.");
            setAdding(false);
            setAddProgress("");
        }
    };

    const deletePlaylist = async (id: string) => {
        if (!confirm("Bu playlist'i ve tüm videolarını silmek istediğine emin misin?")) return;
        await supabase.from("youtube_playlists").delete().eq("id", id);
        fetchPlaylists();
    };

    const filteredPlaylists = playlists.filter((pl) =>
        pl.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pl.channel_title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // API Key not configured warning
    if (!apiConfigured) {
        return (
            <div className="p-6 md:p-10 max-w-6xl mx-auto">
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
                        <KeyRound className="h-8 w-8 text-amber-500" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">YouTube API Anahtarı Gerekli</h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-md">
                        YouTube modülünü kullanmak için bir YouTube Data API v3 anahtarı gerekli.
                    </p>
                    <div className="bg-card border border-border/50 rounded-xl p-5 max-w-lg text-left space-y-3">
                        <div className="flex items-start gap-3">
                            <span className="flex-shrink-0 h-6 w-6 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center text-xs font-bold">1</span>
                            <p className="text-sm text-muted-foreground">
                                <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-red-400 underline underline-offset-2">Google Cloud Console</a>&apos;a gidin ve bir proje oluşturun.
                            </p>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="flex-shrink-0 h-6 w-6 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center text-xs font-bold">2</span>
                            <p className="text-sm text-muted-foreground">
                                <strong>APIs &amp; Services → Library</strong> bölümünden <strong>YouTube Data API v3</strong>&apos;ü etkinleştirin.
                            </p>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="flex-shrink-0 h-6 w-6 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center text-xs font-bold">3</span>
                            <p className="text-sm text-muted-foreground">
                                <strong>APIs &amp; Services → Credentials</strong> bölümünden bir API anahtarı oluşturun.
                            </p>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="flex-shrink-0 h-6 w-6 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center text-xs font-bold">4</span>
                            <div className="text-sm text-muted-foreground">
                                <code className="bg-muted px-2 py-0.5 rounded text-xs">.env.local</code> dosyasına API anahtarını ekleyin:
                                <pre className="bg-muted rounded-lg p-3 mt-2 text-xs overflow-x-auto">
                                    NEXT_PUBLIC_YOUTUBE_API_KEY=AIzaSy...
                                </pre>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="flex-shrink-0 h-6 w-6 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center text-xs font-bold">5</span>
                            <p className="text-sm text-muted-foreground">
                                Dev sunucusunu yeniden başlatın (<code className="bg-muted px-2 py-0.5 rounded text-xs">npm run dev</code>).
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-10 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div>
                    <div className="flex items-center gap-2.5 mb-1">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                            <Youtube className="h-5 w-5 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight">YouTube</h1>
                    </div>
                    <p className="text-muted-foreground ml-[3px]">
                        Playlist videolarını takip et ve zaman damgalı notlar al.
                    </p>
                </div>
                <Dialog open={dialogOpen} onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) {
                        setAddError("");
                        setAddProgress("");
                    }
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-lg shadow-red-500/25">
                            <PlusCircle className="mr-1.5 h-4 w-4" />
                            Playlist Ekle
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>YouTube Playlist Ekle</DialogTitle>
                            <DialogDescription>
                                Playlist URL&apos;sini yapıştırın. Tüm videolar otomatik olarak çekilecek.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 mt-2">
                            <Input
                                placeholder="https://youtube.com/playlist?list=PLxxxxx..."
                                value={playlistUrl}
                                onChange={(e) => {
                                    setPlaylistUrl(e.target.value);
                                    setAddError("");
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !adding) addPlaylist();
                                }}
                                disabled={adding}
                                className="h-11"
                            />
                            {addError && (
                                <div className="flex items-start gap-2 text-sm text-destructive">
                                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                    <span>{addError}</span>
                                </div>
                            )}
                            {addProgress && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                                    <span>{addProgress}</span>
                                </div>
                            )}
                            <Button
                                onClick={addPlaylist}
                                disabled={adding || !playlistUrl.trim()}
                                className="w-full bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white"
                            >
                                {adding ? (
                                    <>
                                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                        İçe aktarılıyor...
                                    </>
                                ) : (
                                    <>
                                        <PlusCircle className="mr-1.5 h-4 w-4" />
                                        Playlist&apos;i İçe Aktar
                                    </>
                                )}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Search */}
            <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    placeholder="Playlistlerde ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-11 bg-card/50 border-border/50"
                />
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            )}

            {/* Empty State */}
            {!loading && filteredPlaylists.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
                        <Youtube className="h-8 w-8 text-red-500" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">
                        {searchQuery ? "Sonuç bulunamadı" : "Henüz playlist yok"}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                        {searchQuery
                            ? "Farklı bir arama terimi deneyin"
                            : "YouTube playlist URL'si ekleyerek videoları takip etmeye başla"}
                    </p>
                    {!searchQuery && (
                        <Button
                            onClick={() => setDialogOpen(true)}
                            className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white"
                        >
                            <PlusCircle className="mr-1.5 h-4 w-4" />
                            İlk Playlist&apos;ini Ekle
                        </Button>
                    )}
                </div>
            )}

            {/* Playlist Grid */}
            {!loading && filteredPlaylists.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredPlaylists.map((playlist) => {
                        const stats = videoStats[playlist.id] || { total: 0, watched: 0 };
                        const progress = stats.total > 0 ? Math.round((stats.watched / stats.total) * 100) : 0;

                        return (
                            <div
                                key={playlist.id}
                                onClick={() => router.push(`/youtube/${playlist.id}`)}
                                className="group relative cursor-pointer rounded-xl border border-border/50 bg-card overflow-hidden transition-all duration-200 hover:border-border hover:shadow-lg hover:shadow-red-500/5 hover:-translate-y-0.5"
                            >
                                {/* Thumbnail */}
                                <div className="relative aspect-video bg-muted overflow-hidden">
                                    {playlist.thumbnail_url ? (
                                        <img
                                            src={playlist.thumbnail_url}
                                            alt={playlist.title}
                                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-500/10 to-rose-500/10">
                                            <Youtube className="h-12 w-12 text-red-500/40" />
                                        </div>
                                    )}
                                    {/* Play overlay */}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="h-12 w-12 rounded-full bg-red-500 flex items-center justify-center shadow-xl">
                                                <Play className="h-5 w-5 text-white ml-0.5" />
                                            </div>
                                        </div>
                                    </div>
                                    {/* Video count badge */}
                                    <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md flex items-center gap-1">
                                        <ListVideo className="h-3 w-3" />
                                        {playlist.video_count} video
                                    </div>
                                    {/* Progress bar at bottom of thumbnail */}
                                    {stats.total > 0 && (
                                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                                            <div
                                                className="h-full bg-gradient-to-r from-red-500 to-rose-500 transition-all duration-500"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="p-4">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <h3 className="font-semibold line-clamp-2 text-sm leading-tight">
                                            {playlist.title}
                                        </h3>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                <button className="p-1 rounded-md hover:bg-accent transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100">
                                                    <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        window.open(
                                                            `https://www.youtube.com/playlist?list=${playlist.playlist_id}`,
                                                            "_blank"
                                                        );
                                                    }}
                                                >
                                                    <ExternalLink className="mr-2 h-4 w-4" />
                                                    YouTube&apos;da Aç
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        deletePlaylist(playlist.id);
                                                    }}
                                                    className="text-destructive focus:text-destructive"
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Sil
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>

                                    {playlist.channel_title && (
                                        <p className="text-xs text-muted-foreground mb-3">
                                            {playlist.channel_title}
                                        </p>
                                    )}

                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <div className="flex items-center gap-3">
                                            <span className="flex items-center gap-1">
                                                <ListVideo className="h-3.5 w-3.5" />
                                                {stats.total} video
                                            </span>
                                            {stats.watched > 0 && (
                                                <span className="flex items-center gap-1 text-emerald-500">
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                    {stats.watched} tamamlandı
                                                </span>
                                            )}
                                        </div>
                                        <span className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            {formatDate(playlist.created_at)}
                                        </span>
                                    </div>

                                    {/* Progress */}
                                    {stats.total > 0 && (
                                        <div className="mt-3">
                                            <div className="flex items-center justify-between text-xs mb-1.5">
                                                <span className="text-muted-foreground">İlerleme</span>
                                                <span className={`font-medium ${progress === 100 ? "text-emerald-500" : "text-red-400"}`}>
                                                    %{progress}
                                                </span>
                                            </div>
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
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
