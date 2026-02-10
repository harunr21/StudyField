"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { YoutubeVideo, YoutubeVideoNote } from "@/lib/supabase/types";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    ArrowLeft,
    Loader2,
    CheckCircle2,
    Circle,
    StickyNote,
    Clock,
    PlusCircle,
    Trash2,
    ExternalLink,
    ChevronLeft,
    ChevronRight,
    Send,
    Play,
    Pause,
} from "lucide-react";

// Format seconds to HH:MM:SS or MM:SS
function formatTimestamp(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
        return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
}

// Parse time input like "1:23" or "1:23:45" to seconds
function parseTimestamp(input: string): number | null {
    const parts = input.split(":").map(Number);
    if (parts.some(isNaN)) return null;

    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }
    if (parts.length === 1) {
        return parts[0];
    }
    return null;
}

// Declare YT types for the embedded player
declare global {
    interface Window {
        YT: {
            Player: new (
                elementId: string,
                config: {
                    videoId: string;
                    playerVars?: Record<string, unknown>;
                    events?: {
                        onReady?: (event: { target: YTPlayer }) => void;
                        onStateChange?: (event: { data: number }) => void;
                    };
                }
            ) => YTPlayer;
            PlayerState: {
                PLAYING: number;
                PAUSED: number;
                ENDED: number;
            };
        };
        onYouTubeIframeAPIReady: (() => void) | undefined;
    }
}

interface YTPlayer {
    getCurrentTime: () => number;
    seekTo: (seconds: number, allowSeekAhead: boolean) => void;
    playVideo: () => void;
    pauseVideo: () => void;
    getPlayerState: () => number;
    destroy: () => void;
}

export default function VideoWatchPage() {
    const params = useParams();
    const router = useRouter();
    const playlistId = params.id as string;
    const videoDbId = params.videoId as string;
    const supabase = createClient();

    const [video, setVideo] = useState<YoutubeVideo | null>(null);
    const [notes, setNotes] = useState<YoutubeVideoNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [noteContent, setNoteContent] = useState("");
    const [noteTimestamp, setNoteTimestamp] = useState("");
    const [savingNote, setSavingNote] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const playerRef = useRef<YTPlayer | null>(null);
    const timeIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const playerContainerRef = useRef<HTMLDivElement>(null);

    // Fetch video and notes data
    const fetchData = useCallback(async () => {
        setLoading(true);

        const { data: vidData, error: vidError } = await supabase
            .from("youtube_videos")
            .select("*")
            .eq("id", videoDbId)
            .single();

        if (vidError || !vidData) {
            router.push(`/youtube/${playlistId}`);
            return;
        }

        setVideo(vidData as YoutubeVideo);

        const { data: notesData } = await supabase
            .from("youtube_video_notes")
            .select("*")
            .eq("video_ref_id", videoDbId)
            .order("timestamp_seconds", { ascending: true });

        if (notesData) {
            setNotes(notesData as YoutubeVideoNote[]);
        }

        setLoading(false);
    }, [videoDbId, playlistId, router, supabase]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Initialize YouTube IFrame API
    useEffect(() => {
        if (!video) return;

        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

        const initPlayer = () => {
            if (playerRef.current) {
                playerRef.current.destroy();
            }
            playerRef.current = new window.YT.Player("yt-player", {
                videoId: video.video_id,
                playerVars: {
                    autoplay: 0,
                    modestbranding: 1,
                    rel: 0,
                },
                events: {
                    onReady: () => {
                        // Start time tracking
                        timeIntervalRef.current = setInterval(() => {
                            if (playerRef.current) {
                                try {
                                    setCurrentTime(playerRef.current.getCurrentTime());
                                    const state = playerRef.current.getPlayerState();
                                    setIsPlaying(state === 1); // 1 = playing
                                } catch {
                                    // Player not ready
                                }
                            }
                        }, 500);
                    },
                    onStateChange: (event: { data: number }) => {
                        setIsPlaying(event.data === 1);
                        // Auto mark as watched when video ends
                        if (event.data === 0 && video && !video.is_watched) {
                            markWatched();
                        }
                    },
                },
            });
        };

        if (window.YT && window.YT.Player) {
            initPlayer();
        } else {
            window.onYouTubeIframeAPIReady = initPlayer;
        }

        return () => {
            if (timeIntervalRef.current) {
                clearInterval(timeIntervalRef.current);
            }
            if (playerRef.current) {
                try {
                    playerRef.current.destroy();
                } catch {
                    // Already destroyed
                }
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [video?.video_id]);

    const markWatched = async () => {
        if (!video) return;
        await supabase
            .from("youtube_videos")
            .update({ is_watched: true, watched_at: new Date().toISOString() })
            .eq("id", video.id);
        setVideo({ ...video, is_watched: true, watched_at: new Date().toISOString() });
    };

    const toggleWatched = async () => {
        if (!video) return;
        const newWatched = !video.is_watched;
        await supabase
            .from("youtube_videos")
            .update({
                is_watched: newWatched,
                watched_at: newWatched ? new Date().toISOString() : null,
            })
            .eq("id", video.id);
        setVideo({
            ...video,
            is_watched: newWatched,
            watched_at: newWatched ? new Date().toISOString() : null,
        });
    };

    const seekTo = (seconds: number) => {
        if (playerRef.current) {
            playerRef.current.seekTo(seconds, true);
            playerRef.current.playVideo();
        }
    };

    const captureCurrentTime = () => {
        if (playerRef.current) {
            const time = Math.floor(playerRef.current.getCurrentTime());
            setNoteTimestamp(formatTimestamp(time));
        }
    };

    const addNote = async () => {
        if (!noteContent.trim()) return;
        setSavingNote(true);

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            setSavingNote(false);
            return;
        }

        let timestampSeconds = 0;
        if (noteTimestamp.trim()) {
            const parsed = parseTimestamp(noteTimestamp);
            if (parsed !== null) {
                timestampSeconds = parsed;
            }
        } else {
            // Use current player time
            if (playerRef.current) {
                timestampSeconds = Math.floor(playerRef.current.getCurrentTime());
            }
        }

        await supabase.from("youtube_video_notes").insert({
            user_id: user.id,
            video_ref_id: videoDbId,
            timestamp_seconds: timestampSeconds,
            content: noteContent.trim(),
        });

        setNoteContent("");
        setNoteTimestamp("");
        setSavingNote(false);
        fetchData();
    };

    const updateNote = async (noteId: string) => {
        if (!editContent.trim()) return;
        await supabase
            .from("youtube_video_notes")
            .update({ content: editContent.trim() })
            .eq("id", noteId);
        setEditingNoteId(null);
        setEditContent("");
        fetchData();
    };

    const deleteNote = async (noteId: string) => {
        await supabase.from("youtube_video_notes").delete().eq("id", noteId);
        fetchData();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!video) return null;

    return (
        <div className="h-[calc(100vh-3.5rem)] flex flex-col">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-background/80 backdrop-blur-sm flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/youtube/${playlistId}`)}
                        className="gap-1.5 flex-shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Playlist
                    </Button>
                    <div className="h-4 w-px bg-border" />
                    <h2 className="text-sm font-medium truncate">{video.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleWatched}
                        className={`gap-1.5 text-xs ${video.is_watched ? "text-emerald-500" : "text-muted-foreground"}`}
                    >
                        {video.is_watched ? (
                            <>
                                <CheckCircle2 className="h-4 w-4" />
                                İzlendi
                            </>
                        ) : (
                            <>
                                <Circle className="h-4 w-4" />
                                İzlenmedi
                            </>
                        )}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                            window.open(`https://www.youtube.com/watch?v=${video.video_id}`, "_blank")
                        }
                        className="gap-1.5 text-xs"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                    >
                        {sidebarOpen ? (
                            <ChevronRight className="h-4 w-4" />
                        ) : (
                            <ChevronLeft className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex min-h-0">
                {/* Video Player */}
                <div className={`flex-1 flex flex-col min-w-0 ${sidebarOpen ? "" : ""}`}>
                    <div className="flex-1 bg-black flex items-center justify-center" ref={playerContainerRef}>
                        <div id="yt-player" className="w-full h-full" />
                    </div>

                    {/* Video Info Bar */}
                    <div className="p-4 border-t border-border/30 bg-card/30 flex-shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="min-w-0">
                                <h3 className="font-semibold text-sm truncate">{video.title}</h3>
                                {video.channel_title && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{video.channel_title}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="h-3.5 w-3.5" />
                                <span>{formatTimestamp(Math.floor(currentTime))}</span>
                                <span className="mx-1">|</span>
                                <StickyNote className="h-3.5 w-3.5 text-amber-500" />
                                <span>{notes.length} not</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Notes Sidebar */}
                {sidebarOpen && (
                    <div className="w-96 border-l border-border/30 flex flex-col bg-card/20 flex-shrink-0">
                        {/* Notes Header */}
                        <div className="p-4 border-b border-border/30">
                            <div className="flex items-center gap-2 mb-1">
                                <StickyNote className="h-4 w-4 text-amber-500" />
                                <h3 className="font-semibold text-sm">Zaman Damgalı Notlar</h3>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Video anlarına bağlı notlar al
                            </p>
                        </div>

                        {/* Add Note Input */}
                        <div className="p-4 border-b border-border/30">
                            <div className="flex items-center gap-2 mb-2">
                                <button
                                    onClick={captureCurrentTime}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                    title="Mevcut zamanı yakala"
                                >
                                    <Clock className="h-3 w-3" />
                                    Zamanı Yakala
                                </button>
                                <input
                                    placeholder="0:00"
                                    value={noteTimestamp}
                                    onChange={(e) => setNoteTimestamp(e.target.value)}
                                    className="w-16 text-xs text-center bg-background/50 border border-border/50 rounded-lg px-2 py-1.5 placeholder:text-muted-foreground/50"
                                />
                            </div>
                            <div className="flex gap-2">
                                <textarea
                                    placeholder="Notunuzu yazın..."
                                    value={noteContent}
                                    onChange={(e) => setNoteContent(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            addNote();
                                        }
                                    }}
                                    rows={2}
                                    className="flex-1 text-sm bg-background/50 border border-border/50 rounded-xl px-3 py-2 resize-none placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-red-500/50"
                                />
                                <Button
                                    size="icon"
                                    onClick={addNote}
                                    disabled={savingNote || !noteContent.trim()}
                                    className="self-end h-9 w-9 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white flex-shrink-0"
                                >
                                    {savingNote ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        </div>

                        {/* Notes List */}
                        <div className="flex-1 overflow-y-auto p-2">
                            {notes.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                                    <StickyNote className="h-8 w-8 text-muted-foreground/30 mb-3" />
                                    <p className="text-sm text-muted-foreground mb-1">Henüz not yok</p>
                                    <p className="text-xs text-muted-foreground/70">
                                        Video izlerken önemli anları not al
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    {notes.map((note) => (
                                        <div
                                            key={note.id}
                                            className="group p-3 rounded-xl bg-background/50 border border-border/30 hover:border-border/60 transition-all"
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-1.5">
                                                <button
                                                    onClick={() => seekTo(note.timestamp_seconds)}
                                                    className="flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                                >
                                                    <Play className="h-2.5 w-2.5" />
                                                    {formatTimestamp(note.timestamp_seconds)}
                                                </button>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => {
                                                            setEditingNoteId(note.id);
                                                            setEditContent(note.content);
                                                        }}
                                                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                                                        title="Düzenle"
                                                    >
                                                        <StickyNote className="h-3 w-3" />
                                                    </button>
                                                    <button
                                                        onClick={() => deleteNote(note.id)}
                                                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                                        title="Sil"
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            </div>

                                            {editingNoteId === note.id ? (
                                                <div className="space-y-2">
                                                    <textarea
                                                        value={editContent}
                                                        onChange={(e) => setEditContent(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter" && !e.shiftKey) {
                                                                e.preventDefault();
                                                                updateNote(note.id);
                                                            }
                                                            if (e.key === "Escape") {
                                                                setEditingNoteId(null);
                                                            }
                                                        }}
                                                        rows={2}
                                                        className="w-full text-sm bg-background border border-border/50 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-red-500/50"
                                                        autoFocus
                                                    />
                                                    <div className="flex gap-2 justify-end">
                                                        <button
                                                            onClick={() => setEditingNoteId(null)}
                                                            className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground"
                                                        >
                                                            İptal
                                                        </button>
                                                        <button
                                                            onClick={() => updateNote(note.id)}
                                                            className="text-xs px-2 py-1 bg-red-500/10 text-red-400 rounded-md hover:bg-red-500/20"
                                                        >
                                                            Kaydet
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                                                    {note.content}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
