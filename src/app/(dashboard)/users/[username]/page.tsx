"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
    getFriendshipBetween,
    getProfileByUsername,
} from "@/lib/friends";
import { formatClockValue, parseDurationToSeconds } from "@/lib/time";
import type { Friendship, Profile, YoutubePlaylist } from "@/lib/supabase/types";
import {
    ArrowLeft,
    CheckCircle2,
    Clock,
    Hourglass,
    ListVideo,
    Loader2,
    Lock,
    Play,
    UserPlus,
    UserRound,
    Users,
    X,
    Youtube,
} from "lucide-react";

interface PlaylistWithStats extends YoutubePlaylist {
    stats: { total: number; watched: number; durationSeconds: number };
}

type RelationshipState =
    | { kind: "self" }
    | { kind: "none" }
    | { kind: "friends"; friendshipId: string }
    | { kind: "incoming"; friendshipId: string }
    | { kind: "outgoing"; friendshipId: string };

export default function UserProfilePage() {
    const params = useParams();
    const username = (params.username as string)?.toLowerCase();
    const supabase = useMemo(() => createClient(), []);

    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [relationship, setRelationship] = useState<RelationshipState>({ kind: "none" });
    const [playlists, setPlaylists] = useState<PlaylistWithStats[]>([]);
    const [actionPending, setActionPending] = useState(false);

    const load = useCallback(async () => {
        if (!username) return;
        const {
            data: { user },
        } = await supabase.auth.getUser();

        const targetProfile = await getProfileByUsername(supabase, username);

        if (!targetProfile) {
            setProfile(null);
            setLoading(false);
            return;
        }
        setProfile(targetProfile);

        if (user && user.id === targetProfile.user_id) {
            setRelationship({ kind: "self" });
        } else if (user) {
            const f = await getFriendshipBetween(supabase, user.id, targetProfile.user_id);
            if (!f) {
                setRelationship({ kind: "none" });
            } else if (f.status === "accepted") {
                setRelationship({ kind: "friends", friendshipId: f.id });
            } else if (f.requester_id === user.id) {
                setRelationship({ kind: "outgoing", friendshipId: f.id });
            } else {
                setRelationship({ kind: "incoming", friendshipId: f.id });
            }
        }

        const { data: pls } = await supabase
            .from("youtube_playlists")
            .select("*")
            .eq("user_id", targetProfile.user_id)
            .order("updated_at", { ascending: false });

        const list = (pls as YoutubePlaylist[] | null) ?? [];

        const playlistIds = list.map((p) => p.id);
        const statsMap: Record<
            string,
            { total: number; watched: number; durationSeconds: number }
        > = {};
        for (const id of playlistIds) {
            statsMap[id] = { total: 0, watched: 0, durationSeconds: 0 };
        }
        if (playlistIds.length > 0) {
            const { data: vids } = await supabase
                .from("youtube_videos")
                .select("playlist_ref_id, is_watched, duration")
                .in("playlist_ref_id", playlistIds);
            if (vids) {
                for (const v of vids as Array<{
                    playlist_ref_id: string;
                    is_watched: boolean;
                    duration: string | null;
                }>) {
                    const s = statsMap[v.playlist_ref_id];
                    if (!s) continue;
                    s.total++;
                    if (v.is_watched) s.watched++;
                    s.durationSeconds += parseDurationToSeconds(v.duration ?? "");
                }
            }
        }

        setPlaylists(
            list.map((p) => ({
                ...p,
                stats: statsMap[p.id] ?? { total: 0, watched: 0, durationSeconds: 0 },
            })),
        );
        setLoading(false);
    }, [supabase, username]);

    useEffect(() => {
        load();
    }, [load]);

    const sendFriendRequest = async () => {
        if (!profile) return;
        setActionPending(true);
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
            setActionPending(false);
            return;
        }
        const { data, error } = await supabase
            .from("friendships")
            .insert({
                requester_id: user.id,
                addressee_id: profile.user_id,
                status: "pending",
            })
            .select()
            .single();
        if (!error && data) {
            setRelationship({
                kind: "outgoing",
                friendshipId: (data as Friendship).id,
            });
        }
        setActionPending(false);
    };

    const acceptIncoming = async () => {
        if (relationship.kind !== "incoming") return;
        setActionPending(true);
        await supabase
            .from("friendships")
            .update({ status: "accepted" })
            .eq("id", relationship.friendshipId);
        await load();
        setActionPending(false);
    };

    const cancelOrRemove = async () => {
        if (
            relationship.kind !== "outgoing" &&
            relationship.kind !== "incoming" &&
            relationship.kind !== "friends"
        ) {
            return;
        }
        setActionPending(true);
        await supabase.from("friendships").delete().eq("id", relationship.friendshipId);
        setRelationship({ kind: "none" });
        setPlaylists([]);
        setActionPending(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="p-6 md:p-10 max-w-3xl mx-auto">
                <Link
                    href="/friends"
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
                >
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    Arkadaşlar
                </Link>
                <div className="rounded-xl border border-dashed border-border/50 p-10 text-center">
                    <UserRound className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <div className="font-medium mb-1">Kullanıcı bulunamadı</div>
                    <div className="text-sm text-muted-foreground">
                        @{username} adlı bir kullanıcı yok.
                    </div>
                </div>
            </div>
        );
    }

    const initial = (profile.display_name?.trim() || profile.username).charAt(0).toUpperCase();
    const canSeePlaylists = relationship.kind === "self" || relationship.kind === "friends";

    return (
        <div className="p-6 md:p-10 max-w-5xl mx-auto">
            <Link
                href="/friends"
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
            >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Arkadaşlar
            </Link>

            {/* Profile header */}
            <div className="rounded-2xl border border-border/50 bg-card p-6 mb-8 flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white text-3xl font-semibold flex items-center justify-center shadow-md flex-shrink-0">
                    {initial}
                </div>
                <div className="min-w-0 flex-1">
                    <h1 className="text-2xl font-bold tracking-tight truncate">
                        {profile.display_name?.trim() || `@${profile.username}`}
                    </h1>
                    <div className="text-muted-foreground">@{profile.username}</div>
                </div>
                <div className="flex items-center gap-2">
                    {relationship.kind === "self" && (
                        <Link href="/profile">
                            <Button variant="outline">Profili düzenle</Button>
                        </Link>
                    )}
                    {relationship.kind === "none" && (
                        <Button
                            onClick={sendFriendRequest}
                            disabled={actionPending}
                            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                        >
                            {actionPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    <UserPlus className="mr-1.5 h-4 w-4" />
                                    Arkadaş ekle
                                </>
                            )}
                        </Button>
                    )}
                    {relationship.kind === "outgoing" && (
                        <>
                            <span className="text-xs text-muted-foreground">İstek bekliyor</span>
                            <Button
                                variant="outline"
                                onClick={cancelOrRemove}
                                disabled={actionPending}
                            >
                                <X className="mr-1 h-4 w-4" />
                                Geri al
                            </Button>
                        </>
                    )}
                    {relationship.kind === "incoming" && (
                        <>
                            <Button
                                onClick={acceptIncoming}
                                disabled={actionPending}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                            >
                                Kabul et
                            </Button>
                            <Button
                                variant="outline"
                                onClick={cancelOrRemove}
                                disabled={actionPending}
                            >
                                Reddet
                            </Button>
                        </>
                    )}
                    {relationship.kind === "friends" && (
                        <>
                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                                <Users className="h-3.5 w-3.5" />
                                Arkadaşsınız
                            </span>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    if (confirm(`@${profile.username} kişisini arkadaşlıktan çıkar?`)) {
                                        cancelOrRemove();
                                    }
                                }}
                                disabled={actionPending}
                            >
                                Çıkar
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Playlists */}
            <div className="mb-3 flex items-center gap-2">
                <Youtube className="h-4 w-4 text-red-500" />
                <h2 className="font-semibold">
                    {relationship.kind === "self" ? "Oynatma listelerin" : "Paylaşılan oynatma listeleri"}
                </h2>
            </div>

            {!canSeePlaylists && (
                <div className="rounded-xl border border-dashed border-border/50 p-10 text-center">
                    <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <div className="font-medium mb-1">İçerik gizli</div>
                    <div className="text-sm text-muted-foreground">
                        Oynatma listelerini görmek için önce arkadaş olmalısınız.
                    </div>
                </div>
            )}

            {canSeePlaylists && playlists.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/50 p-10 text-center">
                    <ListVideo className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <div className="font-medium mb-1">Görünür liste yok</div>
                    <div className="text-sm text-muted-foreground">
                        {relationship.kind === "self"
                            ? "Henüz hiç playlist eklemedin."
                            : "Bu kullanıcı paylaştığı bir liste yok ya da hepsini gizlemiş."}
                    </div>
                </div>
            )}

            {canSeePlaylists && playlists.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {playlists.map((pl) => {
                        const progress =
                            pl.stats.total > 0
                                ? Math.round((pl.stats.watched / pl.stats.total) * 100)
                                : 0;
                        const href =
                            relationship.kind === "self"
                                ? `/youtube/${pl.id}`
                                : `/users/${profile.username}/playlist/${pl.id}`;
                        return (
                            <Link
                                key={pl.id}
                                href={href}
                                className="group relative rounded-xl border border-border/50 bg-card overflow-hidden transition-all duration-200 hover:border-border hover:shadow-lg hover:shadow-red-500/5 hover:-translate-y-0.5"
                            >
                                <div className="relative aspect-video bg-muted overflow-hidden">
                                    {pl.thumbnail_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={pl.thumbnail_url}
                                            alt={pl.title}
                                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-500/10 to-rose-500/10">
                                            <Youtube className="h-12 w-12 text-red-500/40" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="h-12 w-12 rounded-full bg-red-500 flex items-center justify-center shadow-xl">
                                                <Play className="h-5 w-5 text-white ml-0.5" />
                                            </div>
                                        </div>
                                    </div>
                                    {relationship.kind === "self" && !pl.is_shared && (
                                        <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md inline-flex items-center gap-1">
                                            <Lock className="h-3 w-3" />
                                            Gizli
                                        </div>
                                    )}
                                    {pl.stats.total > 0 && (
                                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                                            <div
                                                className="h-full bg-gradient-to-r from-red-500 to-rose-500 transition-all duration-500"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="p-4">
                                    <h3 className="font-semibold line-clamp-2 text-sm leading-tight mb-2">
                                        {pl.title}
                                    </h3>
                                    {pl.channel_title && (
                                        <p className="text-xs text-muted-foreground mb-3 truncate">
                                            {pl.channel_title}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <ListVideo className="h-3.5 w-3.5" />
                                            {pl.stats.total}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="h-3.5 w-3.5" />
                                            {formatClockValue(pl.stats.durationSeconds)}
                                        </span>
                                        <span className="flex items-center gap-1 text-emerald-500">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            {pl.stats.watched}/{pl.stats.total}
                                        </span>
                                    </div>
                                    {pl.stats.total > 0 && (
                                        <div className="mt-3">
                                            <div className="flex items-center justify-between text-xs mb-1.5">
                                                <span className="text-muted-foreground inline-flex items-center gap-1">
                                                    <Hourglass className="h-3 w-3" />
                                                    İlerleme
                                                </span>
                                                <span
                                                    className={`font-medium ${progress === 100 ? "text-emerald-500" : "text-red-400"
                                                        }`}
                                                >
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
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
