"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserSettings } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "next-themes";
import { Loader2, Save, RotateCcw, AlertCircle } from "lucide-react";

type EditableSettings = Pick<
    UserSettings,
    "theme" | "language" | "week_starts_on" | "daily_goal_minutes"
>;

const DEFAULT_SETTINGS: EditableSettings = {
    theme: "system",
    language: "tr",
    week_starts_on: 1,
    daily_goal_minutes: 120,
};

export default function SettingsPage() {
    const supabase = useMemo(() => createClient(), []);
    const { setTheme } = useTheme();

    const [settings, setSettings] = useState<EditableSettings>(DEFAULT_SETTINGS);
    const [initializing, setInitializing] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const loadSettings = useCallback(async () => {
        setInitializing(true);
        setError(null);

        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            setError("Kullanici bilgisi alinamadi.");
            setInitializing(false);
            return;
        }

        const { data, error: fetchError } = await supabase
            .from("user_settings")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();

        if (fetchError) {
            setError("Ayarlar okunamadi. `supabase/migrate_settings.sql` dosyasini calistirin.");
            setInitializing(false);
            return;
        }

        if (!data) {
            setSettings(DEFAULT_SETTINGS);
            setTheme(DEFAULT_SETTINGS.theme);
            setInitializing(false);
            return;
        }

        const safeSettings: EditableSettings = {
            theme: data.theme ?? DEFAULT_SETTINGS.theme,
            language: data.language ?? DEFAULT_SETTINGS.language,
            week_starts_on: data.week_starts_on ?? DEFAULT_SETTINGS.week_starts_on,
            daily_goal_minutes: data.daily_goal_minutes ?? DEFAULT_SETTINGS.daily_goal_minutes,
        };

        setSettings(safeSettings);
        setTheme(safeSettings.theme);
        setInitializing(false);
    }, [setTheme, supabase]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            void loadSettings();
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [loadSettings]);

    const saveSettings = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);

        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            setError("Kullanici bilgisi alinamadi.");
            setSaving(false);
            return;
        }

        const payload: EditableSettings = {
            ...settings,
            daily_goal_minutes: Math.min(1440, Math.max(15, settings.daily_goal_minutes)),
        };

        const { error: upsertError } = await supabase.from("user_settings").upsert({
            user_id: user.id,
            ...payload,
        });

        if (upsertError) {
            setError("Ayarlar kaydedilemedi. Veritabani migration'ini kontrol edin.");
            setSaving(false);
            return;
        }

        setSettings(payload);
        setTheme(payload.theme);
        setSuccess("Ayarlar kaydedildi.");
        setSaving(false);
    };

    const resetDefaults = () => {
        setSettings(DEFAULT_SETTINGS);
        setTheme(DEFAULT_SETTINGS.theme);
        setSuccess(null);
        setError(null);
    };

    if (initializing) {
        return (
            <div className="p-6 md:p-10 max-w-4xl mx-auto">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ayarlar yukleniyor...
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-10 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Ayarlar</h1>
            <p className="text-muted-foreground mb-8">Uygulama tercihlerini yonet.</p>

            <div className="rounded-2xl border border-border/50 bg-card/40 p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label htmlFor="theme">Tema</Label>
                        <select
                            id="theme"
                            value={settings.theme}
                            onChange={(e) =>
                                setSettings((prev) => ({
                                    ...prev,
                                    theme: e.target.value as EditableSettings["theme"],
                                }))
                            }
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                            <option value="system">Sistem</option>
                            <option value="light">Acik</option>
                            <option value="dark">Koyu</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="language">Dil</Label>
                        <select
                            id="language"
                            value={settings.language}
                            onChange={(e) =>
                                setSettings((prev) => ({
                                    ...prev,
                                    language: e.target.value as EditableSettings["language"],
                                }))
                            }
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                            <option value="tr">Turkce</option>
                            <option value="en">English</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="week-starts-on">Hafta Baslangici</Label>
                        <select
                            id="week-starts-on"
                            value={settings.week_starts_on}
                            onChange={(e) =>
                                setSettings((prev) => ({
                                    ...prev,
                                    week_starts_on: Number(e.target.value) as 0 | 1,
                                }))
                            }
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                            <option value={1}>Pazartesi</option>
                            <option value={0}>Pazar</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="daily-goal">Gunluk Hedef (dakika)</Label>
                        <Input
                            id="daily-goal"
                            type="number"
                            min={15}
                            max={1440}
                            step={5}
                            value={settings.daily_goal_minutes}
                            onChange={(e) =>
                                setSettings((prev) => ({
                                    ...prev,
                                    daily_goal_minutes: Number(e.target.value) || DEFAULT_SETTINGS.daily_goal_minutes,
                                }))
                            }
                        />
                        <p className="text-xs text-muted-foreground">Onerilen aralik: 60 - 240 dakika.</p>
                    </div>
                </div>

                {error && (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {success && (
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-600">
                        {success}
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <Button onClick={saveSettings} disabled={saving} className="gap-1.5">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Kaydet
                    </Button>
                    <Button variant="outline" onClick={resetDefaults} disabled={saving} className="gap-1.5">
                        <RotateCcw className="h-4 w-4" />
                        Varsayilana Don
                    </Button>
                </div>
            </div>
        </div>
    );
}
