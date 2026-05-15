"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { YoutubePlaylist } from "@/lib/supabase/types";
import { formatClockValue, parseDurationToSeconds } from "@/lib/time";
import {
    extractPlaylistId,
    fetchPlaylistInfo,
    fetchPlaylistVideos,
    isYoutubeApiConfigured,
    searchPlaylists,
    type YTSearchResult,
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
    CalendarDays,
    Play,
    AlertCircle,
    KeyRound,
    Eye,
    EyeOff,
    Lock,
    Tag,
} from "lucide-react";
import { PlaylistTagEditor } from "@/components/playlist-tag-editor";

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
    const [videoStats, setVideoStats] = useState<Record<string, { total: number; watched: number; durationSeconds: number }>>({});
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [playlistUrl, setPlaylistUrl] = useState("");
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState("");
    const [addProgress, setAddProgress] = useState("");
    const [apiConfigured, setApiConfigured] = useState(true);
    const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
    const [editingTagsPlaylistId, setEditingTagsPlaylistId] = useState<string | null>(null);
    const [editingTags, setEditingTags] = useState<string[]>([]);
    const [dialogTab, setDialogTab] = useState<"url" | "search">("url");
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState<YTSearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);

    useEffect(() => {
        let cancelled = false;

        const checkApiConfig = async () => {
            try {
                const configured = await isYoutubeApiConfigured();
                if (!cancelled) {
                    setApiConfigured(configured);
                }
            } catch {
                if (!cancelled) {
                    setApiConfigured(false);
                }
            }
        };

        checkApiConfig();
        return () => {
            cancelled = true;
        };
    }, []);

    // Initial data fetch
    useEffect(() => {
        let cancelled = false;

        const fetchPlaylists = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (cancelled || !user) return;

            const { data, error } = await supabase
                .from("youtube_playlists")
                .select("*")
                .eq("user_id", user.id)
                .order("updated_at", { ascending: false });

            if (cancelled) return;

            if (!error && data) {
                setPlaylists(data as YoutubePlaylist[]);

                // Fetch video stats for all playlists efficiently
                const playlistIds = (data as YoutubePlaylist[]).map((pl) => pl.id);
                if (playlistIds.length > 0) {
                    const { data: allVideos } = await supabase
                        .from("youtube_videos")
                        .select("playlist_ref_id, is_watched, duration")
                        .eq("user_id", user.id)
                        .in("playlist_ref_id", playlistIds);

                    if (!cancelled) {
                        const stats: Record<string, { total: number; watched: number; durationSeconds: number }> = {};

                        // Initialize stats for all playlists
                        for (const id of playlistIds) {
                            stats[id] = { total: 0, watched: 0, durationSeconds: 0 };
                        }

                        if (allVideos) {
                            for (const video of allVideos) {
                                const plId = video.playlist_ref_id;
                                if (stats[plId]) {
                                    stats[plId].total++;
                                    if (video.is_watched) {
                                        stats[plId].watched++;
                                    }
                                    stats[plId].durationSeconds += parseDurationToSeconds(video.duration ?? "");
                                }
                            }
                        }
                        setVideoStats(stats);
                    }
                }
            }
            if (!cancelled) setLoading(false);
        };

        fetchPlaylists();

        return () => {
            cancelled = true;
        };
    }, [supabase]);

    useEffect(() => {
        if (dialogTab !== "search") return;
        const trimmed = searchTerm.trim();
        if (trimmed.length < 2) {
            setSearchResults([]);
            return;
        }
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(async () => {
            setSearching(true);
            try {
                const results = await searchPlaylists(trimmed);
                setSearchResults(results);
            } catch {
                setSearchResults([]);
            } finally {
                setSearching(false);
            }
        }, 400);
        return () => {
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        };
    }, [searchTerm, dialogTab]);

    const addPlaylist = async (overridePlaylistId?: string) => {
        setAddError("");
        setAddProgress("");
        const playlistId = overridePlaylistId ?? extractPlaylistId(playlistUrl);

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
                    tags: [],
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

    const deletePlaylist = useCallback(async (id: string) => {
        if (!confirm("Bu playlist'i ve tüm videolarını silmek istediğine emin misin?")) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const prevPlaylists = playlists;
        const prevStats = videoStats;

        // Optimistic update
        setPlaylists(prev => prev.filter(pl => pl.id !== id));
        setVideoStats(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });

        const { error } = await supabase
            .from("youtube_playlists")
            .delete()
            .eq("id", id)
            .eq("user_id", user.id);

        if (error) {
            // Roll back on failure
            setPlaylists(prevPlaylists);
            setVideoStats(prevStats);
        }
    }, [supabase, playlists, videoStats]);

    const updateTags = useCallback(async (id: string, newTags: string[]) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setPlaylists((prev) => prev.map((pl) => (pl.id === id ? { ...pl, tags: newTags } : pl)));
        await supabase.from("youtube_playlists").update({ tags: newTags }).eq("id", id).eq("user_id", user.id);
    }, [supabase]);

    const toggleShared = useCallback(async (id: string, current: boolean) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const next = !current;
        // Optimistic update
        setPlaylists(prev => prev.map(pl => (pl.id === id ? { ...pl, is_shared: next } : pl)));
        const { error } = await supabase
            .from("youtube_playlists")
            .update({ is_shared: next })
            .eq("id", id)
            .eq("user_id", user.id);
        if (error) {
            // Roll back
            setPlaylists(prev => prev.map(pl => (pl.id === id ? { ...pl, is_shared: current } : pl)));
        }
    }, [supabase]);

    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        playlists.forEach((pl) => (pl.tags ?? []).forEach((t) => tagSet.add(t)));
        return Array.from(tagSet).sort();
    }, [playlists]);

    const filteredPlaylists = useMemo(() => playlists.filter((pl) => {
        const matchesSearch =
            pl.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            pl.channel_title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesTag = !activeTagFilter || (pl.tags ?? []).includes(activeTagFilter);
        return matchesSearch && matchesTag;
    }), [playlists, searchQuery, activeTagFilter]);

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
                                    YOUTUBE_API_KEY=AIzaSy...
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
                        setDialogTab("url");
                        setSearchTerm("");
                        setSearchResults([]);
                    }
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-lg shadow-red-500/25">
                            <PlusCircle className="mr-1.5 h-4 w-4" />
                            Playlist Ekle
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>YouTube Playlist Ekle</DialogTitle>
                        </DialogHeader>

                        {/* Tab Switcher */}
                        <div className="flex gap-1 rounded-lg border border-border/50 bg-muted/50 p-1">
                            <button
                                onClick={() => setDialogTab("url")}
                                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                    dialogTab === "url"
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                URL ile Ekle
                            </button>
                            <button
                                onClick={() => setDialogTab("search")}
                                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                    dialogTab === "search"
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                YouTube&apos;da Ara
                            </button>
                        </div>

                        {/* URL Tab */}
                        {dialogTab === "url" && (
                            <div className="space-y-4">
                                <DialogDescription>
                                    Playlist URL&apos;sini yapıştırın. Tüm videolar otomatik olarak çekilecek.
                                </DialogDescription>
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
                                    onClick={() => addPlaylist()}
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
                        )}

                        {/* Search Tab */}
                        {dialogTab === "search" && (
                            <div className="space-y-3">
                                <DialogDescription>
                                    YouTube&apos;da playlist ara ve koleksiyonuna tek tıkla ekle.
                                    <span className="block text-[11px] mt-0.5 text-amber-500/80">
                                        Arama API quota tüketir — debounce uygulanıyor.
                                    </span>
                                </DialogDescription>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        placeholder="Arama yap… (min. 2 karakter)"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10 h-11"
                                        autoFocus
                                    />
                                </div>
                                {searching && (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Aranıyor…
                                    </div>
                                )}
                                {addProgress && (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                                        <span>{addProgress}</span>
                                    </div>
                                )}
                                {addError && (
                                    <div className="flex items-start gap-2 text-sm text-destructive">
                                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                        <span>{addError}</span>
                                    </div>
                                )}
                                {searchResults.length > 0 && !searching && (
                                    <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                                        {searchResults.map((result) => (
                                            <div
                                                key={result.playlistId}
                                                className="flex items-center gap-3 rounded-lg border border-border/50 bg-card p-2.5"
                                            >
                                                <div className="relative w-20 aspect-video rounded overflow-hidden bg-muted flex-shrink-0">
                                                    {result.thumbnailUrl ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={result.thumbnailUrl}
                                                            alt={result.title}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <Youtube className="h-5 w-5 text-red-500/40" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium line-clamp-2 leading-snug">
                                                        {result.title}
                                                    </p>
                                                    {result.channelTitle && (
                                                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                                            {result.channelTitle}
                                                        </p>
                                                    )}
                                                </div>
                                                <Button
                                                    size="sm"
                                                    onClick={() => addPlaylist(result.playlistId)}
                                                    disabled={adding}
                                                    className="flex-shrink-0 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white"
                                                >
                                                    {adding ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <PlusCircle className="h-3.5 w-3.5" />
                                                    )}
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {!searching && searchTerm.length >= 2 && searchResults.length === 0 && (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                        Sonuç bulunamadı.
                                    </p>
                                )}
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>

            {/* Search */}
            <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    placeholder="Playlistlerde ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-11 bg-card/50 border-border/50"
                />
            </div>

            {/* Tag Filters */}
            {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-5">
                    {allTags.map((tag) => (
                        <button
                            key={tag}
                            onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                                activeTagFilter === tag
                                    ? "bg-red-500 text-white"
                                    : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            }`}
                        >
                            <Tag className="h-3 w-3" />
                            {tag}
                        </button>
                    ))}
                    {activeTagFilter && (
                        <button
                            onClick={() => setActiveTagFilter(null)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Filtreyi temizle ×
                        </button>
                    )}
                </div>
            )}

            {/* Tag Editing Dialog */}
            <Dialog
                open={!!editingTagsPlaylistId}
                onOpenChange={(open) => {
                    if (!open) setEditingTagsPlaylistId(null);
                }}
            >
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Tagları Düzenle</DialogTitle>
                        <DialogDescription>
                            Playlist&apos;e tag ekleyerek filtreleme yapabilirsin.
                        </DialogDescription>
                    </DialogHeader>
                    <PlaylistTagEditor
                        tags={editingTags}
                        onTagsChange={(newTags) => {
                            setEditingTags(newTags);
                            if (editingTagsPlaylistId) updateTags(editingTagsPlaylistId, newTags);
                        }}
                    />
                </DialogContent>
            </Dialog>

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
                        const stats = videoStats[playlist.id] || { total: 0, watched: 0, durationSeconds: 0 };
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
                                    {/* Hidden badge */}
                                    {playlist.is_shared === false && (
                                        <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md flex items-center gap-1">
                                            <Lock className="h-3 w-3" />
                                            Gizli
                                        </div>
                                    )}
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
                                            <DropdownMenuContent align="end" className="w-52">
                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        window.open(
                                                            `https://www.youtube.com/playlist?list=${playlist.playlist_id}`,
                                                            "_blank",
                                                            "noopener,noreferrer"
                                                        );
                                                    }}
                                                >
                                                    <ExternalLink className="mr-2 h-4 w-4" />
                                                    YouTube&apos;da Aç
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleShared(playlist.id, playlist.is_shared ?? true);
                                                    }}
                                                >
                                                    {playlist.is_shared === false ? (
                                                        <>
                                                            <Eye className="mr-2 h-4 w-4" />
                                                            Arkadaşlara göster
                                                        </>
                                                    ) : (
                                                        <>
                                                            <EyeOff className="mr-2 h-4 w-4" />
                                                            Arkadaşlardan gizle
                                                        </>
                                                    )}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingTags(playlist.tags ?? []);
                                                        setEditingTagsPlaylistId(playlist.id);
                                                    }}
                                                >
                                                    <Tag className="mr-2 h-4 w-4" />
                                                    Tagları Düzenle
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
                                        <p className="text-xs text-muted-foreground mb-2">
                                            {playlist.channel_title}
                                        </p>
                                    )}
                                    {(playlist.tags ?? []).length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-2">
                                            {(playlist.tags ?? []).map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px]"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <div className="flex items-center gap-3">
                                            <span className="flex items-center gap-1">
                                                <ListVideo className="h-3.5 w-3.5" />
                                                {stats.total} video
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3.5 w-3.5" />
                                                {formatClockValue(stats.durationSeconds)}
                                            </span>
                                            {stats.watched > 0 && (
                                                <span className="flex items-center gap-1 text-emerald-500">
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                    {stats.watched} tamamlandı
                                                </span>
                                            )}
                                        </div>
                                        <span className="flex items-center gap-1">
                                            <CalendarDays className="h-3 w-3" />
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
