"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    Activity,
    BookOpenText,
    CheckCircle2,
    Clock3,
    FileBox,
    FileText,
    Youtube,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
    DailyActivityPoint,
    createLastSevenDays,
    dateKey,
    formatHourValue,
    getWeekStart,
    parseDurationToSeconds,
} from "@/lib/dashboard-stats";

interface StatsSnapshot {
    totalNotes: number;
    archivedNotes: number;
    totalPlaylists: number;
    totalVideos: number;
    watchedVideos: number;
    totalPdfDocuments: number;
    archivedPdfDocuments: number;
    totalPdfNotes: number;
    weeklyStudySeconds: number;
    weeklySessionSeconds: number;
    weeklySessionCount: number;
    todaySessionSeconds: number;
    dailyGoalMinutes: number;
    weeklyWatchedVideos: number;
    weeklyUpdatedNotes: number;
    weeklyPdfNotes: number;
    activity: DailyActivityPoint[];
}

const initialStats: StatsSnapshot = {
    totalNotes: 0,
    archivedNotes: 0,
    totalPlaylists: 0,
    totalVideos: 0,
    watchedVideos: 0,
    totalPdfDocuments: 0,
    archivedPdfDocuments: 0,
    totalPdfNotes: 0,
    weeklyStudySeconds: 0,
    weeklySessionSeconds: 0,
    weeklySessionCount: 0,
    todaySessionSeconds: 0,
    dailyGoalMinutes: 120,
    weeklyWatchedVideos: 0,
    weeklyUpdatedNotes: 0,
    weeklyPdfNotes: 0,
    activity: createLastSevenDays(),
};

interface DateOnlyRow {
    updated_at?: string;
    created_at?: string;
}

interface RecentVideoRow {
    duration: string;
    watched_at: string | null;
}

interface StudySessionRow {
    started_at: string;
    ended_at: string | null;
    duration_seconds: number;
}

interface UserSettingsRow {
    daily_goal_minutes: number;
}

export default function StatsPage() {
    const [stats, setStats] = useState<StatsSnapshot>(initialStats);
    const [loading, setLoading] = useState(true);
    const supabase = useMemo(() => createClient(), []);

    useEffect(() => {
        let cancelled = false;

        const fetchStats = async () => {
            setLoading(true);

            const weekStart = getWeekStart();
            const weekStartTime = weekStart.getTime();

            const sevenDaysStart = new Date();
            sevenDaysStart.setHours(0, 0, 0, 0);
            sevenDaysStart.setDate(sevenDaysStart.getDate() - 6);
            const sevenDaysStartIso = sevenDaysStart.toISOString();

            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayStartTime = todayStart.getTime();

            const [
                notesActiveResult,
                notesArchivedResult,
                notesRecentResult,
                playlistsResult,
                videosTotalResult,
                videosWatchedResult,
                videosRecentResult,
                pdfActiveResult,
                pdfArchivedResult,
                pdfNotesTotalResult,
                pdfNotesRecentResult,
                studySessionsRecentResult,
                userSettingsResult,
            ] = await Promise.all([
                supabase
                    .from("pages")
                    .select("id", { count: "exact", head: true })
                    .eq("is_archived", false),
                supabase
                    .from("pages")
                    .select("id", { count: "exact", head: true })
                    .eq("is_archived", true),
                supabase
                    .from("pages")
                    .select("updated_at")
                    .gte("updated_at", sevenDaysStartIso),
                supabase.from("youtube_playlists").select("id", { count: "exact", head: true }),
                supabase.from("youtube_videos").select("id", { count: "exact", head: true }),
                supabase
                    .from("youtube_videos")
                    .select("id", { count: "exact", head: true })
                    .eq("is_watched", true),
                supabase
                    .from("youtube_videos")
                    .select("duration, watched_at")
                    .not("watched_at", "is", null)
                    .gte("watched_at", sevenDaysStartIso),
                supabase
                    .from("pdf_documents")
                    .select("id", { count: "exact", head: true })
                    .eq("is_archived", false),
                supabase
                    .from("pdf_documents")
                    .select("id", { count: "exact", head: true })
                    .eq("is_archived", true),
                supabase.from("pdf_notes").select("id", { count: "exact", head: true }),
                supabase
                    .from("pdf_notes")
                    .select("created_at")
                    .gte("created_at", sevenDaysStartIso),
                supabase
                    .from("study_sessions")
                    .select("started_at,ended_at,duration_seconds")
                    .gte("started_at", sevenDaysStartIso),
                supabase
                    .from("user_settings")
                    .select("daily_goal_minutes")
                    .maybeSingle(),
            ]);

            if (cancelled) return;

            const activity = createLastSevenDays();
            const activityMap = new Map(activity.map((point) => [point.dateKey, point]));

            let weeklyUpdatedNotes = 0;
            const notesRecent = (notesRecentResult.data as DateOnlyRow[]) ?? [];
            for (const note of notesRecent) {
                if (!note.updated_at) continue;

                const noteDate = new Date(note.updated_at);
                if (Number.isNaN(noteDate.getTime())) continue;

                if (noteDate.getTime() >= weekStartTime) {
                    weeklyUpdatedNotes++;
                }

                const dayKey = dateKey(note.updated_at);
                const point = activityMap.get(dayKey);
                if (!point) continue;

                point.notes += 1;
                point.total += 1;
            }

            let weeklyWatchedVideos = 0;
            let weeklyStudySeconds = 0;
            const recentVideos = (videosRecentResult.data as RecentVideoRow[]) ?? [];
            for (const video of recentVideos) {
                if (!video.watched_at) continue;

                const watchedDate = new Date(video.watched_at);
                if (Number.isNaN(watchedDate.getTime())) continue;

                if (watchedDate.getTime() >= weekStartTime) {
                    weeklyWatchedVideos++;
                    weeklyStudySeconds += parseDurationToSeconds(video.duration);
                }

                const dayKey = dateKey(video.watched_at);
                const point = activityMap.get(dayKey);
                if (!point) continue;

                point.videos += 1;
                point.total += 1;
            }

            let weeklyPdfNotes = 0;
            const pdfNotesRecent = (pdfNotesRecentResult.data as DateOnlyRow[]) ?? [];
            for (const pdfNote of pdfNotesRecent) {
                if (!pdfNote.created_at) continue;

                const noteDate = new Date(pdfNote.created_at);
                if (Number.isNaN(noteDate.getTime())) continue;

                if (noteDate.getTime() >= weekStartTime) {
                    weeklyPdfNotes++;
                }

                const dayKey = dateKey(pdfNote.created_at);
                const point = activityMap.get(dayKey);
                if (!point) continue;

                point.pdfNotes += 1;
                point.total += 1;
            }

            let weeklySessionSeconds = 0;
            let weeklySessionCount = 0;
            let todaySessionSeconds = 0;
            const nowMs = Date.now();
            const studySessions = (studySessionsRecentResult.data as StudySessionRow[]) ?? [];

            for (const session of studySessions) {
                const startedAtMs = new Date(session.started_at).getTime();
                if (Number.isNaN(startedAtMs)) continue;

                const endedAtMs = session.ended_at ? new Date(session.ended_at).getTime() : nowMs;
                const fallbackDuration = Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000));
                const durationSeconds = session.duration_seconds > 0 ? session.duration_seconds : fallbackDuration;

                if (startedAtMs >= weekStartTime) {
                    weeklySessionSeconds += durationSeconds;
                    weeklySessionCount++;
                }

                if (startedAtMs >= todayStartTime) {
                    todaySessionSeconds += durationSeconds;
                }
            }

            const userSettings = userSettingsResult.data as UserSettingsRow | null;
            const dailyGoalMinutes = userSettings?.daily_goal_minutes ?? 120;

            setStats({
                totalNotes: notesActiveResult.count ?? 0,
                archivedNotes: notesArchivedResult.count ?? 0,
                totalPlaylists: playlistsResult.count ?? 0,
                totalVideos: videosTotalResult.count ?? 0,
                watchedVideos: videosWatchedResult.count ?? 0,
                totalPdfDocuments: pdfActiveResult.count ?? 0,
                archivedPdfDocuments: pdfArchivedResult.count ?? 0,
                totalPdfNotes: pdfNotesTotalResult.count ?? 0,
                weeklyStudySeconds,
                weeklySessionSeconds,
                weeklySessionCount,
                todaySessionSeconds,
                dailyGoalMinutes,
                weeklyWatchedVideos,
                weeklyUpdatedNotes,
                weeklyPdfNotes,
                activity,
            });

            setLoading(false);
        };

        fetchStats();

        return () => {
            cancelled = true;
        };
    }, [supabase]);

    const videoCompletionRate = stats.totalVideos > 0
        ? Math.round((stats.watchedVideos / stats.totalVideos) * 100)
        : 0;

    const maxDailyTotal = Math.max(...stats.activity.map((day) => day.total), 1);
    const dailyGoalSeconds = Math.max(1, stats.dailyGoalMinutes * 60);
    const dailyGoalRate = Math.min(100, Math.round((stats.todaySessionSeconds / dailyGoalSeconds) * 100));

    return (
        <div className="p-6 md:p-10 max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Istatistikler</h1>
            <p className="text-muted-foreground mb-8">
                Calisma aliskanliklarini ve ilerleme durumunu izle.
            </p>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div
                            key={index}
                            className="h-32 rounded-2xl border border-border/50 bg-card/50 animate-pulse"
                        />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <StatCard
                        icon={<FileText className="h-4 w-4 text-violet-400" />}
                        label="Toplam Not"
                        value={stats.totalNotes.toLocaleString("tr-TR")}
                        subValue={`${stats.archivedNotes.toLocaleString("tr-TR")} arsiv`}
                    />
                    <StatCard
                        icon={<Youtube className="h-4 w-4 text-red-400" />}
                        label="Playlist"
                        value={stats.totalPlaylists.toLocaleString("tr-TR")}
                        subValue={`${stats.totalVideos.toLocaleString("tr-TR")} video`}
                    />
                    <StatCard
                        icon={<FileBox className="h-4 w-4 text-blue-400" />}
                        label="PDF Dokuman"
                        value={stats.totalPdfDocuments.toLocaleString("tr-TR")}
                        subValue={`${stats.archivedPdfDocuments.toLocaleString("tr-TR")} arsiv`}
                    />
                    <StatCard
                        icon={<Clock3 className="h-4 w-4 text-emerald-400" />}
                        label="Odak (Haftalik)"
                        value={`${formatHourValue(stats.weeklySessionSeconds)} saat`}
                        subValue={`${stats.weeklySessionCount.toLocaleString("tr-TR")} seans`}
                    />
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 rounded-2xl border border-border/50 bg-card/50 p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <Activity className="h-5 w-5 text-muted-foreground" />
                        <h2 className="text-lg font-semibold">Son 7 Gun Aktivite</h2>
                    </div>

                    <div className="grid grid-cols-7 gap-3">
                        {stats.activity.map((day) => {
                            const totalHeight = Math.max(10, Math.round((day.total / maxDailyTotal) * 120));
                            const videoHeight = day.total > 0 ? Math.max(2, Math.round((day.videos / day.total) * totalHeight)) : 0;
                            const noteHeight = day.total > 0 ? Math.max(2, Math.round((day.notes / day.total) * totalHeight)) : 0;
                            const pdfHeight = Math.max(totalHeight - videoHeight - noteHeight, 0);

                            return (
                                <div key={day.dateKey} className="flex flex-col items-center gap-2">
                                    <div className="h-32 w-full rounded-lg bg-background/40 border border-border/40 flex items-end justify-center p-1">
                                        {day.total > 0 ? (
                                            <div className="w-full max-w-8 rounded-md overflow-hidden flex flex-col-reverse">
                                                <div className="bg-blue-500/70" style={{ height: `${pdfHeight}px` }} />
                                                <div className="bg-violet-500/80" style={{ height: `${noteHeight}px` }} />
                                                <div className="bg-red-500/80" style={{ height: `${videoHeight}px` }} />
                                            </div>
                                        ) : (
                                            <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                                        )}
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs text-muted-foreground">{day.label}</p>
                                        <p className="text-xs font-medium">{day.total}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-2 mt-6 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                            Not guncellemeleri
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                            Izlenen videolar
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                            PDF notlari
                        </span>
                    </div>
                </div>

                <div className="rounded-2xl border border-border/50 bg-card/50 p-6 space-y-6">
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                            <h2 className="text-lg font-semibold">Ilerleme</h2>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between text-sm mb-1">
                                    <span>YouTube tamamlama</span>
                                    <span className="font-semibold">{videoCompletionRate}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-background/70 overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-red-500 to-rose-500"
                                        style={{ width: `${videoCompletionRate}%` }}
                                    />
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between text-sm mb-1">
                                    <span>Gunluk odak hedefi</span>
                                    <span className="font-semibold">
                                        %{dailyGoalRate} ({Math.round(stats.todaySessionSeconds / 60)} / {stats.dailyGoalMinutes} dk)
                                    </span>
                                </div>
                                <div className="h-2 rounded-full bg-background/70 overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500"
                                        style={{ width: `${dailyGoalRate}%` }}
                                    />
                                </div>
                            </div>
                            <ProgressLine
                                label="Bu hafta not guncellemesi"
                                value={stats.weeklyUpdatedNotes}
                                accent="text-violet-400"
                            />
                            <ProgressLine
                                label="Bu hafta odak seansi"
                                value={stats.weeklySessionCount}
                                accent="text-emerald-400"
                            />
                            <ProgressLine
                                label="Bu hafta PDF notu"
                                value={stats.weeklyPdfNotes}
                                accent="text-blue-400"
                            />
                            <ProgressLine
                                label="Bu hafta izlenen video"
                                value={stats.weeklyWatchedVideos}
                                accent="text-red-400"
                            />
                            <ProgressLine
                                label="Video izleme suresi (saat)"
                                value={Math.round(stats.weeklyStudySeconds / 3600)}
                                accent="text-red-300"
                            />
                        </div>
                    </div>

                    <div className="pt-2 border-t border-border/50">
                        <div className="flex items-center gap-2 mb-3">
                            <BookOpenText className="h-5 w-5 text-muted-foreground" />
                            <h3 className="font-semibold">Hizli Erisim</h3>
                        </div>
                        <div className="space-y-2">
                            <QuickLink href="/notes" label="Notlari ac" />
                            <QuickLink href="/youtube" label="YouTube playlistleri" />
                            <QuickLink href="/pdf" label="PDF kutuphanesi" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({
    icon,
    label,
    value,
    subValue,
}: {
    icon: ReactNode;
    label: string;
    value: string;
    subValue: string;
}) {
    return (
        <div className="rounded-2xl border border-border/50 bg-card/60 p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-3">
                {icon}
                <span className="text-xs">{label}</span>
            </div>
            <p className="text-2xl font-bold tracking-tight mb-1">{value}</p>
            <p className="text-xs text-muted-foreground">{subValue}</p>
        </div>
    );
}

function ProgressLine({
    label,
    value,
    accent,
}: {
    label: string;
    value: number;
    accent: string;
}) {
    return (
        <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className={`font-semibold ${accent}`}>{value.toLocaleString("tr-TR")}</span>
        </div>
    );
}

function QuickLink({ href, label }: { href: string; label: string }) {
    return (
        <Link
            href={href}
            className="block rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-sm transition-colors hover:bg-background/70"
        >
            {label}
        </Link>
    );
}
