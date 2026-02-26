"use client";

import {
    BookOpen,
    Youtube,
    History,
    BarChart3,
    ArrowRight,
    Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatHourValue, getWeekStart, parseDurationToSeconds } from "@/lib/dashboard-stats";

const features = [
    {
        title: "YouTube",
        description: "Playlist videolarını takip et ve notlar al",
        icon: Youtube,
        href: "/youtube",
        gradient: "from-red-500 to-rose-600",
        shadowColor: "shadow-red-500/20",
    },
    {
        title: "Istatistikler",
        description: "Calisma ritmini ve video ilerlemeni takip et",
        icon: BarChart3,
        href: "/stats",
        gradient: "from-emerald-500 to-cyan-600",
        shadowColor: "shadow-emerald-500/20",
    },
    {
        title: "Seans Gecmisi",
        description: "Odak seanslarini incele ve tekrar baslat",
        icon: History,
        href: "/sessions",
        gradient: "from-violet-500 to-indigo-600",
        shadowColor: "shadow-violet-500/20",
    },
];

interface QuickStats {
    totalPlaylists: number;
    totalVideos: number;
    weeklyStudySeconds: number;
    weeklySessionCount: number;
}

export default function DashboardPage() {
    const [quickStats, setQuickStats] = useState<QuickStats>({
        totalPlaylists: 0,
        totalVideos: 0,
        weeklyStudySeconds: 0,
        weeklySessionCount: 0,
    });
    const [loadingStats, setLoadingStats] = useState(true);
    const supabase = useMemo(() => createClient(), []);

    useEffect(() => {
        let cancelled = false;

        const fetchQuickStats = async () => {
            setLoadingStats(true);
            const weekStartIso = getWeekStart().toISOString();

            const [playlistsResult, videosResult, weeklyVideosResult, weeklySessionsResult] = await Promise.all([
                supabase.from("youtube_playlists").select("id", { count: "exact", head: true }),
                supabase
                    .from("youtube_videos")
                    .select("id", { count: "exact", head: true }),
                supabase
                    .from("youtube_videos")
                    .select("duration, watched_at")
                    .not("watched_at", "is", null)
                    .gte("watched_at", weekStartIso),
                supabase
                    .from("study_sessions")
                    .select("id", { count: "exact", head: true })
                    .gte("started_at", weekStartIso),
            ]);

            if (cancelled) return;

            const weeklyVideos =
                (weeklyVideosResult.data as Array<{ duration: string; watched_at: string | null }>) ?? [];
            const weeklyStudySeconds = weeklyVideos.reduce((total, video) => {
                return total + parseDurationToSeconds(video.duration);
            }, 0);

            setQuickStats({
                totalPlaylists: playlistsResult.count ?? 0,
                totalVideos: videosResult.count ?? 0,
                weeklyStudySeconds,
                weeklySessionCount: weeklySessionsResult.count ?? 0,
            });
            setLoadingStats(false);
        };

        fetchQuickStats();

        return () => {
            cancelled = true;
        };
    }, [supabase]);

    const stats = [
        {
            label: "YouTube Playlist",
            value: loadingStats ? "..." : quickStats.totalPlaylists.toLocaleString("tr-TR"),
            color: "text-red-500",
        },
        {
            label: "Toplam Video",
            value: loadingStats ? "..." : quickStats.totalVideos.toLocaleString("tr-TR"),
            color: "text-sky-500",
        },
        {
            label: "Haftalik Video",
            value: loadingStats ? "... saat" : `${formatHourValue(quickStats.weeklyStudySeconds)} saat`,
            color: "text-emerald-500",
        },
        {
            label: "Haftalik Seans",
            value: loadingStats ? "..." : quickStats.weeklySessionCount.toLocaleString("tr-TR"),
            color: "text-violet-500",
        },
    ];

    return (
        <div className="p-6 md:p-10 max-w-6xl mx-auto">
            <div className="mb-12">
                <div className="flex items-center gap-2 mb-3">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">
                        Çalışma Alanı
                    </span>
                </div>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
                    Hoş geldin,{" "}
                    <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                        StudyField
                    </span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl">
                    YouTube calisma akisini, istatistiklerini ve odak seanslarini tek yerden yonet.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                {features.map((feature) => (
                    <Link
                        key={feature.title}
                        href={feature.href}
                        className="group relative"
                    >
                        <div
                            className={`relative overflow-hidden rounded-2xl border border-border/50 bg-card p-6 transition-all duration-300 hover:border-border hover:shadow-xl ${feature.shadowColor} hover:-translate-y-1`}
                        >
                            <div
                                className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feature.gradient} mb-4 shadow-lg ${feature.shadowColor}`}
                            >
                                <feature.icon className="h-6 w-6 text-white" />
                            </div>
                            <h3 className="text-lg font-semibold mb-2 group-hover:text-foreground transition-colors">
                                {feature.title}
                            </h3>
                            <p className="text-sm text-muted-foreground mb-4">
                                {feature.description}
                            </p>
                            <div className="flex items-center text-sm font-medium text-violet-500 group-hover:text-violet-400 transition-colors">
                                Keşfet
                                <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                            </div>
                            <div
                                className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300 rounded-2xl`}
                            />
                        </div>
                    </Link>
                ))}
            </div>

            <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Hızlı Bakış</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {stats.map((stat) => (
                        <div
                            key={stat.label}
                            className="text-center p-4 rounded-xl bg-background/50"
                        >
                            <p className={`text-2xl font-bold ${stat.color} ${loadingStats ? "animate-pulse" : ""}`}>
                                {stat.value}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {stat.label}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
