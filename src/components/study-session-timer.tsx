"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatClockValue } from "@/lib/dashboard-stats";
import { Button } from "@/components/ui/button";
import { Loader2, Timer, Square, Play } from "lucide-react";

type ActiveSession = {
    id: string;
    started_at: string;
    updated_at: string | null;
    source_type: "manual" | "pomodoro" | "youtube" | "pdf" | "notes";
    planned_duration_seconds: number | null;
    tag: string | null;
};

const POMODORO_PRESETS = [25, 5];
const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 dakika
const STALE_SESSION_THRESHOLD_MINUTES = 5; // 5 dakika boyunca heartbeat yoksa seansı kapat

export function StudySessionTimer() {
    const supabase = useMemo(() => createClient(), []);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [presetMinutes, setPresetMinutes] = useState(25);
    const [useCustomMinutes, setUseCustomMinutes] = useState(false);
    const [customMinutes, setCustomMinutes] = useState(30);
    const [isManualMode, setIsManualMode] = useState(false);
    const [sessionTag, setSessionTag] = useState("");
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(() => {
        if (typeof window === "undefined") return "default";
        if (!("Notification" in window)) return "unsupported";
        return Notification.permission;
    });
    const notifiedSessionIdRef = useRef<string | null>(null);
    const autoStoppingSessionIdRef = useRef<string | null>(null);
    const autoStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const helperMessage = statusMessage
        ?? (notificationPermission === "unsupported" ? "Tarayici bildirimi desteklenmiyor." : null);

    const syncElapsed = useCallback((startedAt: string) => {
        const started = new Date(startedAt).getTime();
        const now = Date.now();
        const diff = Math.max(0, Math.floor((now - started) / 1000));
        setElapsedSeconds(diff);
    }, []);

    // Seans hala aktif mi kontrol et ve çok eskiyse kapat
    const checkAndRecoverStaleSession = useCallback(async (session: ActiveSession) => {
        const lastActivity = session.updated_at
            ? new Date(session.updated_at).getTime()
            : new Date(session.started_at).getTime();
        const now = Date.now();
        const minutesSinceActivity = (now - lastActivity) / 1000 / 60;

        if (minutesSinceActivity > STALE_SESSION_THRESHOLD_MINUTES) {
            console.log("Stale session detected. Auto-closing...", session.id);
            // Seansı son bilinen aktivite zamanında bitir
            const durationSeconds = Math.floor((lastActivity - new Date(session.started_at).getTime()) / 1000);

            // Veritabanında kapat
            await supabase
                .from("study_sessions")
                .update({
                    ended_at: new Date(lastActivity).toISOString(),
                    duration_seconds: Math.max(0, durationSeconds)
                })
                .eq("id", session.id);

            setStatusMessage("Onceki yarim kalan seans (uzun sure islem yapilmadigi icin) otomatik kapatildi.");
            return null; // Artık aktif değil
        }
        return session; // Hala taze
    }, [supabase]);

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
            .select("id,started_at,updated_at,source_type,planned_duration_seconds,tag")
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

        let session = data as ActiveSession;

        // Stale check
        const recoveredSession = await checkAndRecoverStaleSession(session);
        if (!recoveredSession) {
            setActiveSession(null);
            setElapsedSeconds(0);
        } else {
            setActiveSession(recoveredSession);
            syncElapsed(recoveredSession.started_at);
        }

        setLoading(false);
    }, [supabase, syncElapsed, checkAndRecoverStaleSession]);

    // Heartbeat gönderen fonksiyon
    const sendHeartbeat = useCallback(async (sessionId: string) => {
        const now = new Date().toISOString();
        await supabase
            .from("study_sessions")
            .update({ updated_at: now })
            .eq("id", sessionId);

        // Yerel state'i de guncelle ki 'stale' kontrolune takilmasin (gerci loadActiveSession'da yapiliyor ama olsun)
        setActiveSession(prev => prev?.id === sessionId ? { ...prev, updated_at: now } : prev);
    }, [supabase]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadActiveSession();
    }, [loadActiveSession]);

    useEffect(() => {
        if (!activeSession) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        syncElapsed(activeSession.started_at);

        // UI Timer
        const interval = setInterval(() => {
            syncElapsed(activeSession.started_at);
        }, 1000);

        // Heartbeat Timer
        const heartbeatInterval = setInterval(() => {
            sendHeartbeat(activeSession.id);
        }, HEARTBEAT_INTERVAL_MS);

        return () => {
            clearInterval(interval);
            clearInterval(heartbeatInterval);
        };
    }, [activeSession, syncElapsed, sendHeartbeat]);

    const requestNotificationPermission = async () => {
        if (typeof window === "undefined" || !("Notification" in window)) return;
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
    };

    const startSession = async (
        sourceType: "manual" | "pomodoro",
        plannedSeconds: number | null,
        tag: string | null
    ) => {
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
                updated_at: startedAt, // Ilk baslangic update zamani
                planned_duration_seconds: plannedSeconds,
                tag,
            })
            .select("id,started_at,updated_at,source_type,planned_duration_seconds,tag")
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

    const stopSession = useCallback(async (options?: { completionMessage?: string; durationSeconds?: number; isAutoStop?: boolean }) => {
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
            if (options?.isAutoStop) {
                notifiedSessionIdRef.current = null;
                autoStoppingSessionIdRef.current = null;
            }
            setSaving(false);
            return;
        }

        setStatusMessage(options?.completionMessage ?? null);
        setActiveSession(null);
        if (autoStopTimeoutRef.current) {
            clearTimeout(autoStopTimeoutRef.current);
            autoStopTimeoutRef.current = null;
        }
        notifiedSessionIdRef.current = null;
        autoStoppingSessionIdRef.current = null;
        setElapsedSeconds(0);
        setSaving(false);
    }, [activeSession, elapsedSeconds, saving, supabase]);



    useEffect(() => {
        if (!activeSession) return;
        const planned = Number(activeSession.planned_duration_seconds ?? 0);
        if (!Number.isFinite(planned) || planned <= 0) return;
        if (elapsedSeconds < planned) return;
        if (notifiedSessionIdRef.current === activeSession.id) return;
        if (autoStoppingSessionIdRef.current === activeSession.id) return;

        notifiedSessionIdRef.current = activeSession.id;
        autoStoppingSessionIdRef.current = activeSession.id;

        let completionMessage = "Planlanan sure doldu. Seans otomatik bitirildi.";
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification("Seans tamamlandi", {
                body: "Sure doldu. Seans otomatik bitirildi.",
            });
        } else {
            completionMessage = "Seans suresi doldu. Seans otomatik bitirildi.";
        }

        setTimeout(() => {
            void stopSession({ completionMessage, durationSeconds: planned, isAutoStop: true });
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
            <div className="flex min-w-0 items-center gap-2">
                <div className="flex min-w-0 items-center gap-1.5 rounded-xl border border-border/60 bg-card/40 p-1">
                    <div className="flex items-center gap-1.5">
                        <select
                            value={isManualMode ? "manual" : useCustomMinutes ? "custom" : String(presetMinutes)}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === "manual") {
                                    setIsManualMode(true);
                                    setUseCustomMinutes(false);
                                    return;
                                }
                                setIsManualMode(false);
                                if (val === "custom") {
                                    setUseCustomMinutes(true);
                                    return;
                                }
                                setUseCustomMinutes(false);
                                setPresetMinutes(Number(val));
                            }}
                            className="h-8 rounded-md border border-input/70 bg-background px-2 text-xs outline-none"
                        >
                            <option value="manual">Serbest</option>
                            {POMODORO_PRESETS.map((minutes) => (
                                <option key={minutes} value={minutes}>
                                    {minutes} dk
                                </option>
                            ))}
                            <option value="custom">Ozel</option>
                        </select>
                        {useCustomMinutes && !isManualMode && (
                            <input
                                type="number"
                                min={1}
                                max={180}
                                value={customMinutes}
                                onChange={(e) => setCustomMinutes(Number(e.target.value) || 1)}
                                className="h-8 w-16 rounded-md border border-input/70 bg-background px-2 text-xs outline-none"
                                aria-label="Ozel pomodoro suresi"
                            />
                        )}
                        <input
                            type="text"
                            value={sessionTag}
                            onChange={(e) => setSessionTag(e.target.value)}
                            maxLength={60}
                            placeholder="Etiket"
                            className="h-8 w-24 sm:w-28 md:w-36 lg:w-40 rounded-md border border-input/70 bg-background px-2 text-xs outline-none"
                            aria-label="Seans etiketi"
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={saving}
                            onClick={async () => {
                                const normalizedTag = sessionTag.trim();
                                const tagValue = normalizedTag.length > 0 ? normalizedTag.slice(0, 60) : null;

                                if (isManualMode) {
                                    await startSession("manual", null, tagValue);
                                    return;
                                }

                                if (notificationPermission === "default") {
                                    await requestNotificationPermission();
                                }
                                const selectedMinutes = useCustomMinutes
                                    ? Math.min(180, Math.max(1, customMinutes))
                                    : presetMinutes;
                                await startSession("pomodoro", selectedMinutes * 60, tagValue);
                            }}
                            className="h-8 gap-1.5"
                        >
                            {isManualMode ? <Play className="h-4 w-4" /> : <Timer className="h-4 w-4" />}
                            Baslat
                        </Button>
                    </div>
                </div>
                {helperMessage && (
                    <p
                        className={`hidden xl:block max-w-[220px] truncate text-[11px] ${
                            statusMessage ? "text-destructive" : "text-muted-foreground"
                        }`}
                        title={helperMessage}
                    >
                        {helperMessage}
                    </p>
                )}
            </div>
        );
    }

    const planned = activeSession.planned_duration_seconds ?? 0;
    const clampedElapsedSeconds = planned > 0 ? Math.min(elapsedSeconds, planned) : elapsedSeconds;
    const completion = planned > 0 ? Math.min(100, Math.round((clampedElapsedSeconds / planned) * 100)) : null;

    return (
        <div className="flex min-w-0 items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-1">
                {activeSession.tag && (
                    <div className="max-w-[180px] truncate rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs text-sky-600 font-medium">
                        {activeSession.tag}
                    </div>
                )}
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600 font-medium">
                    {activeSession.source_type === "pomodoro" ? "Pomodoro" : "Seans"} {formatClockValue(clampedElapsedSeconds)}
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
            {statusMessage && (
                <p className="hidden xl:block max-w-[220px] truncate text-[11px] text-destructive" title={statusMessage}>
                    {statusMessage}
                </p>
            )}
        </div>
    );
}
