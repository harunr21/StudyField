"use client";

import { ReactNode, useMemo, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { StudySession } from "@/lib/supabase/types";
import { formatClockValue } from "@/lib/dashboard-stats";
import { Clock3, Loader2, Timer, PlayCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type SessionFilter = "all" | "manual" | "pomodoro" | "active" | "completed";

function formatDateTime(value: string) {
    const date = new Date(value);
    return date.toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function resolveDuration(session: StudySession): number {
    if (session.duration_seconds > 0) return session.duration_seconds;
    if (!session.ended_at) {
        const started = new Date(session.started_at).getTime();
        return Math.max(0, Math.floor((Date.now() - started) / 1000));
    }
    const started = new Date(session.started_at).getTime();
    const ended = new Date(session.ended_at).getTime();
    return Math.max(0, Math.floor((ended - started) / 1000));
}

export default function SessionsPage() {
    const supabase = useMemo(() => createClient(), []);
    const [loading, setLoading] = useState(true);
    const [sessions, setSessions] = useState<StudySession[]>([]);
    const [filter, setFilter] = useState<SessionFilter>("all");
    const [query, setQuery] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            setLoading(true);
            setError(null);

            const { data, error } = await supabase
                .from("study_sessions")
                .select("*")
                .order("started_at", { ascending: false })
                .limit(200);

            if (cancelled) return;

            if (error) {
                setError(error.message || "Seans gecmisi okunamadi.");
                setSessions([]);
                setLoading(false);
                return;
            }

            setSessions((data ?? []) as StudySession[]);
            setLoading(false);
        };

        run();

        return () => {
            cancelled = true;
        };
    }, [supabase]);

    const filtered = sessions.filter((session) => {
        if (filter === "manual" && session.source_type !== "manual") return false;
        if (filter === "pomodoro" && session.source_type !== "pomodoro") return false;
        if (filter === "active" && session.ended_at) return false;
        if (filter === "completed" && !session.ended_at) return false;

        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
            session.source_type.toLowerCase().includes(q) ||
            (session.notes || "").toLowerCase().includes(q)
        );
    });

    const totalSeconds = filtered.reduce((sum, item) => sum + resolveDuration(item), 0);

    return (
        <div className="p-6 md:p-10 max-w-6xl mx-auto">
            <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight mb-2">Seans Gecmisi</h1>
                <p className="text-muted-foreground">
                    Tum odak seanslarini takip et, filtrele ve gecmisini incele.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <SummaryCard label="Toplam Seans" value={filtered.length.toLocaleString("tr-TR")} icon={<PlayCircle className="h-4 w-4 text-violet-400" />} />
                <SummaryCard label="Toplam Sure" value={formatClockValue(totalSeconds)} icon={<Clock3 className="h-4 w-4 text-emerald-400" />} />
                <SummaryCard
                    label="Aktif Seans"
                    value={filtered.filter((s) => !s.ended_at).length.toLocaleString("tr-TR")}
                    icon={<Timer className="h-4 w-4 text-amber-400" />}
                />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Kaynak tipi veya notta ara..."
                        className="pl-9"
                    />
                </div>
                <div className="flex items-center gap-2 overflow-x-auto">
                    {[
                        { id: "all", label: "Tumu" },
                        { id: "manual", label: "Manual" },
                        { id: "pomodoro", label: "Pomodoro" },
                        { id: "active", label: "Aktif" },
                        { id: "completed", label: "Tamamlanan" },
                    ].map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setFilter(item.id as SessionFilter)}
                            className={`h-9 px-3 rounded-md border text-sm whitespace-nowrap transition-colors ${
                                filter === item.id
                                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                                    : "border-border/60 hover:bg-accent"
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading && (
                <div className="rounded-xl border border-border/50 p-10 flex items-center justify-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Seanslar yukleniyor...
                </div>
            )}

            {!loading && error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                    {error}
                </div>
            )}

            {!loading && !error && filtered.length === 0 && (
                <div className="rounded-xl border border-border/50 p-10 text-center text-muted-foreground">
                    Filtreye uygun seans bulunamadi.
                </div>
            )}

            {!loading && !error && filtered.length > 0 && (
                <div className="rounded-xl border border-border/50 overflow-hidden">
                    <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs text-muted-foreground border-b border-border/50 bg-card/40">
                        <div className="col-span-3">Baslangic</div>
                        <div className="col-span-2">Durum</div>
                        <div className="col-span-2">Tip</div>
                        <div className="col-span-2 text-right">Sure</div>
                        <div className="col-span-3">Not</div>
                    </div>
                    {filtered.map((session) => (
                        <div
                            key={session.id}
                            className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-border/40 last:border-b-0 text-sm"
                        >
                            <div className="col-span-3 text-muted-foreground">{formatDateTime(session.started_at)}</div>
                            <div className="col-span-2">
                                {session.ended_at ? (
                                    <span className="inline-flex rounded-full px-2 py-0.5 text-xs bg-emerald-500/10 text-emerald-600">
                                        Tamamlandi
                                    </span>
                                ) : (
                                    <span className="inline-flex rounded-full px-2 py-0.5 text-xs bg-amber-500/10 text-amber-600">
                                        Aktif
                                    </span>
                                )}
                            </div>
                            <div className="col-span-2 capitalize">{session.source_type}</div>
                            <div className="col-span-2 text-right font-medium">{formatClockValue(resolveDuration(session))}</div>
                            <div className="col-span-3 text-muted-foreground truncate">{session.notes || "-"}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function SummaryCard({
    label,
    value,
    icon,
}: {
    label: string;
    value: string;
    icon: ReactNode;
}) {
    return (
        <div className="rounded-xl border border-border/50 bg-card/50 p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
                {icon}
                <span className="text-xs">{label}</span>
            </div>
            <p className="text-2xl font-semibold tracking-tight">{value}</p>
        </div>
    );
}
