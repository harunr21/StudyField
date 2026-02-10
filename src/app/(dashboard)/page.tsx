"use client";

import {
    BookOpen,
    FileText,
    Youtube,
    FileBox,
    ArrowRight,
    Sparkles,
} from "lucide-react";
import Link from "next/link";

const features = [
    {
        title: "Notlarım",
        description: "Notion benzeri blok editör ile notlarını organize et",
        icon: FileText,
        href: "/notes",
        gradient: "from-violet-500 to-purple-600",
        shadowColor: "shadow-violet-500/20",
    },
    {
        title: "YouTube",
        description: "Playlist videolarını takip et ve notlar al",
        icon: Youtube,
        href: "/youtube",
        gradient: "from-red-500 to-rose-600",
        shadowColor: "shadow-red-500/20",
    },
    {
        title: "PDF Dökümanlar",
        description: "PDF'lerini yükle, görüntüle ve organize et",
        icon: FileBox,
        href: "/pdf",
        gradient: "from-blue-500 to-cyan-600",
        shadowColor: "shadow-blue-500/20",
    },
];

export default function DashboardPage() {
    return (
        <div className="p-6 md:p-10 max-w-6xl mx-auto">
            {/* Hero Section */}
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
                    Tüm çalışma araçların tek bir yerde. Notlar al, videoları takip et,
                    dökümanlarını organize et.
                </p>
            </div>

            {/* Feature Cards */}
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
                            {/* Subtle gradient overlay on hover */}
                            <div
                                className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300 rounded-2xl`}
                            />
                        </div>
                    </Link>
                ))}
            </div>

            {/* Quick Stats Section */}
            <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Hızlı Bakış</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: "Toplam Not", value: "0", color: "text-violet-500" },
                        { label: "YouTube Playlist", value: "0", color: "text-red-500" },
                        { label: "PDF Döküman", value: "0", color: "text-blue-500" },
                        { label: "Bu Hafta", value: "0 saat", color: "text-emerald-500" },
                    ].map((stat) => (
                        <div
                            key={stat.label}
                            className="text-center p-4 rounded-xl bg-background/50"
                        >
                            <p className={`text-2xl font-bold ${stat.color}`}>
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
