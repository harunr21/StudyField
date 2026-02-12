"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const POMODORO_PRESETS = [25, 50];

export function StudySessionTimer() {
    const supabase = useMemo(() => createClient(), []);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [presetMinutes, setPresetMinutes] = useState(25);

    const syncElapsed = useCallback((startedAt: string) => {
        const started = new Date(startedAt).getTime();
        const now = Date.now();
        const diff = Math.max(0, Math.floor((now - started) / 1000));
        setElapsedSeconds(diff);
    }, []);

    const loadActiveSession = useCallback(async () => {
        setLoading(true);
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            setActiveSession(null);
            setElapsedSeconds(0);
            setLoading(false);
            return;
        }

        const { data } = await supabase
            .from("study_sessions")
            .select("id,started_at,source_type,planned_duration_seconds")
            .eq("user_id", user.id)
            .is("ended_at", null)
            .order("started_at", { ascending: false })
            .limit(1)
            .maybeSingle();

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

    const startSession = async (sourceType: "manual" | "pomodoro", plannedSeconds: number | null) => {
        if (saving || activeSession) return;
        setSaving(true);

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
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
            syncElapsed(session.started_at);
        }

        setSaving(false);
    };

    const stopSession = async () => {
        if (!activeSession || saving) return;
        setSaving(true);
        const durationSeconds = Math.max(0, elapsedSeconds);

        await supabase
            .from("study_sessions")
            .update({
                ended_at: new Date().toISOString(),
                duration_seconds: durationSeconds,
            })
            .eq("id", activeSession.id);

        setActiveSession(null);
        setElapsedSeconds(0);
        setSaving(false);
    };

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
                        value={presetMinutes}
                        onChange={(e) => setPresetMinutes(Number(e.target.value))}
                        className="h-9 rounded-md border border-input bg-background px-2 text-xs outline-none"
                    >
                        {POMODORO_PRESETS.map((minutes) => (
                            <option key={minutes} value={minutes}>
                                {minutes} dk
                            </option>
                        ))}
                    </select>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={saving}
                        onClick={() => startSession("pomodoro", presetMinutes * 60)}
                        className="gap-1.5"
                    >
                        <Timer className="h-4 w-4" />
                        Pomodoro
                    </Button>
                </div>
            </div>
        );
    }

    const planned = activeSession.planned_duration_seconds ?? 0;
    const completion = planned > 0 ? Math.min(100, Math.round((elapsedSeconds / planned) * 100)) : null;

    return (
        <div className="flex items-center gap-2">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600 font-medium">
                {activeSession.source_type === "pomodoro" ? "Pomodoro" : "Seans"} {formatClockValue(elapsedSeconds)}
                {completion !== null && <span className="ml-1">(%{completion})</span>}
            </div>
            <Button
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={stopSession}
                className="gap-1.5"
            >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                Bitir
            </Button>
        </div>
    );
}
