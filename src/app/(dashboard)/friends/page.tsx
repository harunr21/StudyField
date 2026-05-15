"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    fetchFriendshipsForUser,
    getProfileByUsername,
    type FriendshipWithProfile,
    USERNAME_REGEX,
} from "@/lib/friends";
import type { Profile } from "@/lib/supabase/types";
import {
    AlertCircle,
    Check,
    Loader2,
    MailPlus,
    UserMinus,
    UserPlus,
    Users,
    X,
} from "lucide-react";

export default function FriendsPage() {
    const supabase = useMemo(() => createClient(), []);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [myProfile, setMyProfile] = useState<Profile | null>(null);
    const [items, setItems] = useState<FriendshipWithProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [usernameInput, setUsernameInput] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const [info, setInfo] = useState("");

    const reload = useCallback(
        async (userId: string) => {
            const list = await fetchFriendshipsForUser(supabase, userId);
            setItems(list);
        },
        [supabase],
    );

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) {
                if (!cancelled) setLoading(false);
                return;
            }
            if (cancelled) return;
            setCurrentUserId(user.id);

            const { data: prof } = await supabase
                .from("profiles")
                .select("*")
                .eq("user_id", user.id)
                .maybeSingle();
            if (!cancelled) setMyProfile((prof as Profile | null) ?? null);

            await reload(user.id);
            if (!cancelled) setLoading(false);
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [supabase, reload]);

    const sendRequest = async () => {
        setError("");
        setInfo("");
        if (!currentUserId) return;
        if (!myProfile) {
            setError("Önce kendi profilini oluşturmalısın.");
            return;
        }
        const normalized = usernameInput.trim().toLowerCase();
        if (!USERNAME_REGEX.test(normalized)) {
            setError("Geçerli bir kullanıcı adı gir (3-30 karakter, küçük harf/rakam/_).");
            return;
        }
        if (normalized === myProfile.username) {
            setError("Kendine arkadaşlık isteği gönderemezsin.");
            return;
        }
        setSending(true);

        const target = await getProfileByUsername(supabase, normalized);
        if (!target) {
            setSending(false);
            setError("Bu kullanıcı adına sahip biri yok.");
            return;
        }

        const { error: insertError } = await supabase.from("friendships").insert({
            requester_id: currentUserId,
            addressee_id: target.user_id,
            status: "pending",
        });

        if (insertError) {
            if (insertError.code === "23505") {
                setError("Bu kişiyle zaten bir bağlantın var (bekliyor veya arkadaş).");
            } else {
                setError(insertError.message);
            }
            setSending(false);
            return;
        }

        setInfo(`@${target.username} kullanıcısına istek gönderildi.`);
        setUsernameInput("");
        setSending(false);
        await reload(currentUserId);
    };

    const accept = async (friendshipId: string) => {
        if (!currentUserId) return;
        await supabase
            .from("friendships")
            .update({ status: "accepted" })
            .eq("id", friendshipId);
        await reload(currentUserId);
    };

    const remove = async (friendshipId: string) => {
        if (!currentUserId) return;
        await supabase.from("friendships").delete().eq("id", friendshipId);
        await reload(currentUserId);
    };

    const incoming = items.filter(
        (i) => i.direction === "incoming" && i.friendship.status === "pending",
    );
    const outgoing = items.filter(
        (i) => i.direction === "outgoing" && i.friendship.status === "pending",
    );
    const accepted = items.filter((i) => i.friendship.status === "accepted");

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="p-6 md:p-10 max-w-3xl mx-auto">
            <div className="mb-8">
                <div className="flex items-center gap-2.5 mb-1">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <Users className="h-5 w-5 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">Arkadaşlar</h1>
                </div>
                <p className="text-muted-foreground ml-[3px]">
                    Arkadaşlarının oynatma listelerini ve ilerlemelerini gör.
                </p>
            </div>

            {!myProfile && (
                <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                        <div className="font-medium mb-0.5">Önce kullanıcı adını seç</div>
                        <div className="text-muted-foreground">
                            Arkadaş ekleyebilmen ve eklenebilmen için bir kullanıcı adın olmalı.{" "}
                            <Link href="/profile" className="text-amber-400 underline underline-offset-2">
                                Profilini oluştur
                            </Link>
                            .
                        </div>
                    </div>
                </div>
            )}

            {/* Add by username */}
            <div className="rounded-xl border border-border/50 bg-card p-5 mb-8">
                <div className="flex items-center gap-2 mb-3">
                    <MailPlus className="h-4 w-4 text-emerald-500" />
                    <h2 className="font-semibold">Kullanıcı adıyla ekle</h2>
                </div>
                <div className="flex gap-2">
                    <Input
                        placeholder="ornek_kullanici"
                        value={usernameInput}
                        onChange={(e) => {
                            setUsernameInput(e.target.value.toLowerCase());
                            setError("");
                            setInfo("");
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !sending) sendRequest();
                        }}
                        className="h-11 flex-1"
                        autoComplete="off"
                        disabled={!myProfile || sending}
                    />
                    <Button
                        onClick={sendRequest}
                        disabled={!myProfile || sending || !usernameInput.trim()}
                        className="h-11 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                    >
                        {sending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <>
                                <UserPlus className="mr-1.5 h-4 w-4" />
                                Gönder
                            </>
                        )}
                    </Button>
                </div>
                {error && (
                    <div className="mt-3 flex items-start gap-2 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}
                {info && (
                    <div className="mt-3 flex items-start gap-2 text-sm text-emerald-500">
                        <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{info}</span>
                    </div>
                )}
            </div>

            {/* Incoming requests */}
            {incoming.length > 0 && (
                <Section title={`Gelen istekler (${incoming.length})`}>
                    {incoming.map((item) => (
                        <Row key={item.friendship.id} profile={item.profile}>
                            <Button
                                size="sm"
                                onClick={() => accept(item.friendship.id)}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                            >
                                <Check className="mr-1 h-4 w-4" />
                                Kabul et
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => remove(item.friendship.id)}
                            >
                                <X className="mr-1 h-4 w-4" />
                                Reddet
                            </Button>
                        </Row>
                    ))}
                </Section>
            )}

            {/* Outgoing */}
            {outgoing.length > 0 && (
                <Section title={`Gönderilen istekler (${outgoing.length})`}>
                    {outgoing.map((item) => (
                        <Row key={item.friendship.id} profile={item.profile}>
                            <span className="text-xs text-muted-foreground">Bekleniyor</span>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => remove(item.friendship.id)}
                            >
                                <X className="mr-1 h-4 w-4" />
                                Geri al
                            </Button>
                        </Row>
                    ))}
                </Section>
            )}

            {/* Friends */}
            <Section
                title={`Arkadaşlar (${accepted.length})`}
                empty={
                    incoming.length === 0 && outgoing.length === 0 && accepted.length === 0
                        ? "Henüz kimseyle bağlantın yok. Yukarıdan bir kullanıcı adı ekleyerek başla."
                        : accepted.length === 0
                            ? "Henüz kabul edilmiş arkadaşın yok."
                            : undefined
                }
            >
                {accepted.map((item) => (
                    <Row key={item.friendship.id} profile={item.profile}>
                        <Link href={`/users/${item.profile.username}`}>
                            <Button size="sm" variant="outline">
                                Profil
                            </Button>
                        </Link>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                if (confirm(`@${item.profile.username} kişisini arkadaşlıktan çıkar?`)) {
                                    remove(item.friendship.id);
                                }
                            }}
                        >
                            <UserMinus className="mr-1 h-4 w-4" />
                            Çıkar
                        </Button>
                    </Row>
                ))}
            </Section>
        </div>
    );
}

function Section({
    title,
    children,
    empty,
}: {
    title: string;
    children?: React.ReactNode;
    empty?: string;
}) {
    return (
        <div className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                {title}
            </h2>
            {empty ? (
                <div className="rounded-xl border border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">
                    {empty}
                </div>
            ) : (
                <div className="space-y-2">{children}</div>
            )}
        </div>
    );
}

function Row({
    profile,
    children,
}: {
    profile: Profile;
    children: React.ReactNode;
}) {
    const initial = (profile.display_name?.trim() || profile.username).charAt(0).toUpperCase();
    return (
        <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-white text-sm font-semibold flex items-center justify-center flex-shrink-0">
                {initial}
            </div>
            <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                    {profile.display_name?.trim() || `@${profile.username}`}
                </div>
                <div className="text-xs text-muted-foreground truncate">@{profile.username}</div>
            </div>
            <div className="flex items-center gap-2">{children}</div>
        </div>
    );
}
