"use client";

import { useEffect, useState } from "react";
import { getMyProfile, saveMyProfile } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USERNAME_REGEX, type Profile } from "@/lib/types";
import { AlertCircle, CheckCircle2, Loader2, UserRound } from "lucide-react";
import Link from "next/link";

export default function ProfilePage() {
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [userEmail, setUserEmail] = useState<string>("");
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        let cancelled = false;
        getMyProfile().then((res) => {
            if (cancelled) return;
            if (res) {
                setUserEmail(res.email);
                if (res.profile) {
                    setProfile(res.profile);
                    setUsername(res.profile.username);
                    setDisplayName(res.profile.display_name);
                }
            }
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const save = async () => {
        setError("");
        setSuccess("");

        const normalized = username.trim().toLowerCase();
        if (!USERNAME_REGEX.test(normalized)) {
            setError("Kullanıcı adı 3-30 karakter olmalı, sadece küçük harf, rakam ve _ içerebilir.");
            return;
        }
        if (displayName.length > 60) {
            setError("Görünen ad en fazla 60 karakter olabilir.");
            return;
        }

        setSaving(true);
        const result = await saveMyProfile(normalized, displayName);
        if (result.error) {
            setError(result.error);
        } else if (result.profile) {
            setProfile(result.profile);
            setSuccess("Profil kaydedildi.");
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const initial = (displayName.trim() || username || userEmail || "U").charAt(0).toUpperCase();

    return (
        <div className="p-6 md:p-10 max-w-2xl mx-auto">
            <div className="mb-8">
                <div className="flex items-center gap-2.5 mb-1">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                        <UserRound className="h-5 w-5 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">Profil</h1>
                </div>
                <p className="text-muted-foreground ml-[3px]">Arkadaşların seni nasıl bulacağını ve göreceğini ayarla.</p>
            </div>

            <div className="rounded-xl border border-border/50 bg-card p-6 space-y-6">
                <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white text-2xl font-semibold flex items-center justify-center shadow-md">
                        {initial}
                    </div>
                    <div className="min-w-0">
                        <div className="text-sm text-muted-foreground">Hesap</div>
                        <div className="font-medium truncate">{userEmail || "—"}</div>
                        {profile?.username && (
                            <Link href={`/users/${profile.username}`} className="text-xs text-violet-400 hover:underline">
                                Profilini önizle →
                            </Link>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="username">Kullanıcı adı</Label>
                    <Input
                        id="username"
                        value={username}
                        onChange={(e) => {
                            setUsername(e.target.value.toLowerCase());
                            setError("");
                            setSuccess("");
                        }}
                        placeholder="ornek_kullanici"
                        className="h-11"
                        autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground">
                        3-30 karakter. Küçük harf, rakam ve _ kullanılabilir. Arkadaşların seni bu adla bulacak.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="display-name">Görünen ad</Label>
                    <Input
                        id="display-name"
                        value={displayName}
                        onChange={(e) => {
                            setDisplayName(e.target.value);
                            setError("");
                            setSuccess("");
                        }}
                        placeholder="Adın Soyadın"
                        className="h-11"
                        maxLength={60}
                    />
                </div>

                {error && (
                    <div className="flex items-start gap-2 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}
                {success && (
                    <div className="flex items-start gap-2 text-sm text-emerald-500">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{success}</span>
                    </div>
                )}

                <div className="flex justify-end">
                    <Button
                        onClick={save}
                        disabled={saving}
                        className="bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                Kaydediliyor...
                            </>
                        ) : profile ? (
                            "Değişiklikleri kaydet"
                        ) : (
                            "Profili oluştur"
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
