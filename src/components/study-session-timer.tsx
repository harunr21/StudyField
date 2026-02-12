"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatClockValue } from "@/lib/dashboard-stats";
import { Button } from "@/components/ui/button";
import { Loader2, Timer, Square, Play } from "lucide-react";

type ActiveSession = {
    id: string;
    started_at: string;
    source_type: "manual" | "pomodoro" | "youtube" | "pdf" | "notes";
    planned_duration_seconds: number | null;
};

const POMODORO_PRESETS = [25, 5];

export function StudySessionTimer() {
    const supabase = useMemo(() => createClient(), []);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [presetMinutes, setPresetMinutes] = useState(25);
    const [useCustomMinutes, setUseCustomMinutes] = useState(false);
    const [customMinutes, setCustomMinutes] = useState(30);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(() => {
        if (typeof window === "undefined") return "default";
        if (!("Notification" in window)) return "unsupported";
        return Notification.permission;
    });
    const notifiedSessionIdRef = useRef<string | null>(null);
    const autoStoppingSessionIdRef = useRef<string | null>(null);

    const syncElapsed = useCallback((startedAt: string) => {
        const started = new Date(startedAt).getTime();
        const now = Date.now();
        const diff = Math.max(0, Math.floor((now - started) / 1000));
        setElapsedSeconds(diff);
    }, []);

    const loadActiveSession = useCallback(async () => {
        setLoading(true);
        setStatusMessage(null);
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            setActiveSession(null);
            setElapsedSeconds(0);
            setLoading(false);
            return;
        }

        const { data, error } = await supabase
            .from("study_sessions")
            .select("id,started_at,source_type,planned_duration_seconds")
            .eq("user_id", user.id)
            .is("ended_at", null)
            .order("started_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            setStatusMessage("Seans verisi okunamadi. `migrate_study_sessions.sql` dosyasini kontrol edin.");
            setActiveSession(null);
            setElapsedSeconds(0);
            setLoading(false);
            return;
        }

        if (!data) {
            setActiveSession(null);
            setElapsedSeconds(0);
            setLoading(false);
            return;
        }

        const session = data as ActiveSession;
        setActiveSession(session);
        syncElapsed(session.started_at);
        setLoading(false);
    }, [supabase, syncElapsed]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadActiveSession();
    }, [loadActiveSession]);

    useEffect(() => {
        if (!activeSession) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        syncElapsed(activeSession.started_at);
        const interval = setInterval(() => {
            syncElapsed(activeSession.started_at);
        }, 1000);
        return () => clearInterval(interval);
    }, [activeSession, syncElapsed]);

    const requestNotificationPermission = async () => {
        if (typeof window === "undefined" || !("Notification" in window)) return;
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
    };

    const startSession = async (sourceType: "manual" | "pomodoro", plannedSeconds: number | null) => {
        if (saving || activeSession) return;
        setSaving(true);
        setStatusMessage(null);

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            setStatusMessage("Oturum bilgisi alinamadi. Lutfen tekrar giris yapin.");
            setSaving(false);
            return;
        }

        const startedAt = new Date().toISOString();
        const { data, error } = await supabase
            .from("study_sessions")
            .insert({
                user_id: user.id,
                source_type: sourceType,
                started_at: startedAt,
                planned_duration_seconds: plannedSeconds,
            })
            .select("id,started_at,source_type,planned_duration_seconds")
            .single();

        if (!error && data) {
            const session = data as ActiveSession;
            setActiveSession(session);
            notifiedSessionIdRef.current = null;
            syncElapsed(session.started_at);
            setStatusMessage(null);
        } else {
            setStatusMessage(error?.message ?? "Seans baslatilamadi.");
        }

        setSaving(false);
    };

    const stopSession = useCallback(async (options?: { completionMessage?: string; durationSeconds?: number }) => {
        if (!activeSession || saving) return;
        setSaving(true);
        if (!options?.completionMessage) {
            setStatusMessage(null);
        }
        const durationSeconds = Math.max(0, options?.durationSeconds ?? elapsedSeconds);

        const { error } = await supabase
            .from("study_sessions")
            .update({
                ended_at: new Date().toISOString(),
                duration_seconds: durationSeconds,
            })
            .eq("id", activeSession.id);

        if (error) {
            setStatusMessage(error.message ?? "Seans bitirilemedi.");
            setSaving(false);
            return;
        }

        setStatusMessage(options?.completionMessage ?? null);
        setActiveSession(null);
        notifiedSessionIdRef.current = null;
        autoStoppingSessionIdRef.current = null;
        setElapsedSeconds(0);
        setSaving(false);
    }, [activeSession, elapsedSeconds, saving, supabase]);

    useEffect(() => {
        if (!activeSession || activeSession.source_type !== "pomodoro") return;
        const planned = activeSession.planned_duration_seconds;
        if (!planned || planned <= 0) return;
        if (elapsedSeconds < planned) return;
        if (notifiedSessionIdRef.current === activeSession.id) return;
        if (autoStoppingSessionIdRef.current === activeSession.id) return;

        notifiedSessionIdRef.current = activeSession.id;
        autoStoppingSessionIdRef.current = activeSession.id;

        let completionMessage = "Pomodoro tamamlandi. Seans otomatik bitirildi.";
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification("Pomodoro tamamlandi", {
                body: "Sure doldu. Seans otomatik bitirildi.",
            });
        } else {
            completionMessage = "Pomodoro suresi doldu. Seans otomatik bitirildi.";
        }

        setTimeout(() => {
            void stopSession({ completionMessage, durationSeconds: planned });
        }, 0);
    }, [activeSession, elapsedSeconds, stopSession]);

    if (loading) {
        return (
            <Button variant="outline" size="sm" disabled className="gap-1.5">
                <Loader2 className="h-4 w-4 animate-spin" />
                Seans
            </Button>
        );
    }

    if (!activeSession) {
        return (
            <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={saving}
                        onClick={() => startSession("manual", null)}
                        className="gap-1.5"
                    >
                        <Play className="h-4 w-4" />
                        Seans Baslat
                    </Button>

                    <div className="hidden md:flex items-center gap-1.5">
                        <select
                            value={useCustomMinutes ? "custom" : String(presetMinutes)}
                            onChange={(e) => {
                                if (e.target.value === "custom") {
                                    setUseCustomMinutes(true);
                                    return;
                                }
                                setUseCustomMinutes(false);
                                setPresetMinutes(Number(e.target.value));
                            }}
                            className="h-9 rounded-md border border-input bg-background px-2 text-xs outline-none"
                        >
                            {POMODORO_PRESETS.map((minutes) => (
                                <option key={minutes} value={minutes}>
                                    {minutes} dk
                                </option>
                            ))}
                            <option value="custom">Ozel</option>
                        </select>
                        {useCustomMinutes && (
                            <input
                                type="number"
                                min={1}
                                max={180}
                                value={customMinutes}
                                onChange={(e) => setCustomMinutes(Number(e.target.value) || 1)}
                                className="h-9 w-20 rounded-md border border-input bg-background px-2 text-xs outline-none"
                                aria-label="Ozel pomodoro suresi"
                            />
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={saving}
                            onClick={async () => {
                                if (notificationPermission === "default") {
                                    await requestNotificationPermission();
                                }
                                const selectedMinutes = useCustomMinutes
                                    ? Math.min(180, Math.max(1, customMinutes))
                                    : presetMinutes;
                                await startSession("pomodoro", selectedMinutes * 60);
                            }}
                            className="gap-1.5"
                        >
                            <Timer className="h-4 w-4" />
                            Pomodoro
                        </Button>
                    </div>
                </div>
                {notificationPermission === "unsupported" && (
                    <p className="text-[11px] text-muted-foreground">Tarayici bildirimi desteklemiyor.</p>
                )}
                {statusMessage && <p className="text-[11px] text-destructive">{statusMessage}</p>}
            </div>
        );
    }

    const planned = activeSession.planned_duration_seconds ?? 0;
    const completion = planned > 0 ? Math.min(100, Math.round((elapsedSeconds / planned) * 100)) : null;

    return (
        <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600 font-medium">
                    {activeSession.source_type === "pomodoro" ? "Pomodoro" : "Seans"} {formatClockValue(elapsedSeconds)}
                    {completion !== null && <span className="ml-1">(%{completion})</span>}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => {
                        void stopSession();
                    }}
                    className="gap-1.5"
                >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                    Bitir
                </Button>
            </div>
            {statusMessage && <p className="text-[11px] text-destructive">{statusMessage}</p>}
        </div>
    );
}
