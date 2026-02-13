"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Page } from "@/lib/supabase/types";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    PlusCircle,
    FileText,
    Search,
    Star,
    Archive,
    ArchiveRestore,
    Loader2,
} from "lucide-react";
import { PageCard } from "./page-card";

interface NotesListProps {
    initialPages: Page[];
}

export function NotesList({ initialPages }: NotesListProps) {
    const [pages, setPages] = useState<Page[]>(initialPages);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [showArchived, setShowArchived] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    const fetchPages = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("pages")
            .select("*")
            .eq("is_archived", showArchived)
            .order("updated_at", { ascending: false });

        if (!error && data) {
            setPages(data as Page[]);
        }
        setLoading(false);
    }, [showArchived, supabase]);

    // Initial fetch only if not provided or if archive toggle changes
    useEffect(() => {
        // If initialPages are provided, we don't need to fetch immediately
        // BUT if showArchived changes, we need to fetch
        if (showArchived) {
            fetchPages();
        } else {
            // If going back to "active notes", use initial OR fetch
            // But initialPages is static from server. 
            // So better to always fetch on toggle change for consistency
            // However, on mount, we use initialPages.
        }
    }, [showArchived, fetchPages]);

    // Update pages when initialPages changes (e.g. server re-render)
    // But careful, we don't want to overwrite local state if user interacted
    // Actually, server component passes initial data, client component hydrates.
    // We should rely on realtime for updates, not prop updates.

    // Realtime subscription
    useEffect(() => {
        const channel = supabase
            .channel("pages-changes")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "pages" },
                () => {
                    // Refresh data on change
                    // We can re-fetch to be safe
                    fetchPages();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, fetchPages]);

    const quickCreatePage = async () => {
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const { data, error } = await supabase
            .from("pages")
            .insert({
                title: "Başlıksız",
                icon: "📄",
                user_id: user.id,
                content: {},
            })
            .select()
            .single();

        if (!error && data) {
            router.push(`/notes/${data.id}`);
        }
    };

    const toggleFavorite = async (page: Page) => {
        // Optimistic update
        setPages(prev => prev.map(p => p.id === page.id ? { ...p, is_favorite: !p.is_favorite } : p));

        await supabase
            .from("pages")
            .update({ is_favorite: !page.is_favorite })
            .eq("id", page.id);

        // No need to fetchPages here because realtime subscription will catch it?
        // Actually realtime might be triggered by our own change.
        // But optimistic update makes it snappy.
    };

    const toggleArchive = async (page: Page) => {
        // Remove from current view optimistically
        setPages(prev => prev.filter(p => p.id !== page.id));

        await supabase
            .from("pages")
            .update({ is_archived: !page.is_archived })
            .eq("id", page.id);

        // fetchPages will be triggered by realtime or we can call it.
        // But since we filtered it out, we are good for now.
    };

    const deletePage = async (id: string) => {
        if (!confirm("Bu notu kalıcı olarak silmek istediğine emin misin?")) return;

        // Optimistic remove
        setPages(prev => prev.filter(p => p.id !== id));

        await supabase.from("pages").delete().eq("id", id);
    };

    const filteredPages = pages.filter((page) =>
        page.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const favoritePages = filteredPages.filter((p) => p.is_favorite);
    const regularPages = filteredPages.filter((p) => !p.is_favorite);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString("tr-TR", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    return (
        <div className="p-6 md:p-10 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight mb-1">Notlarım</h1>
                    <p className="text-muted-foreground">
                        {showArchived ? "Arşivlenmiş notlar" : "Tüm notlarını burada organize et"}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowArchived(!showArchived)}
                        className="text-sm"
                    >
                        {showArchived ? (
                            <>
                                <ArchiveRestore className="mr-1.5 h-4 w-4" />
                                Aktif Notlar
                            </>
                        ) : (
                            <>
                                <Archive className="mr-1.5 h-4 w-4" />
                                Arşiv
                            </>
                        )}
                    </Button>
                    <Button
                        onClick={quickCreatePage}
                        className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-lg shadow-violet-500/25"
                    >
                        <PlusCircle className="mr-1.5 h-4 w-4" />
                        Yeni Not
                    </Button>
                </div>
            </div>

            {/* Search */}
            <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    placeholder="Notlarda ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-11 bg-card/50 border-border/50"
                />
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            )}

            {/* Empty State */}
            {!loading && filteredPages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
                        <FileText className="h-8 w-8 text-violet-500" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">
                        {searchQuery ? "Sonuç bulunamadı" : "Henüz not yok"}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                        {searchQuery
                            ? "Farklı bir arama terimi deneyin"
                            : "İlk notunu oluşturarak başla"}
                    </p>
                    {!searchQuery && (
                        <Button
                            onClick={quickCreatePage}
                            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white"
                        >
                            <PlusCircle className="mr-1.5 h-4 w-4" />
                            İlk Notunu Oluştur
                        </Button>
                    )}
                </div>
            )}

            {/* Favorites */}
            {!loading && favoritePages.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                        <Star className="h-3.5 w-3.5 text-amber-500" />
                        Favoriler
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {favoritePages.map((page, index) => (
                            <PageCard
                                key={page.id}
                                page={page}
                                className="animate-in fade-in slide-in-from-bottom-3 duration-500 fill-mode-backwards"
                                style={{ animationDelay: `${index * 0.05}s` }}
                                onOpen={() => router.push(`/notes/${page.id}`)}
                                onToggleFavorite={() => toggleFavorite(page)}
                                onToggleArchive={() => toggleArchive(page)}
                                onDelete={() => deletePage(page.id)}
                                formatDate={formatDate}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Regular Pages */}
            {!loading && regularPages.length > 0 && (
                <div>
                    {favoritePages.length > 0 && (
                        <h2 className="text-sm font-medium text-muted-foreground mb-3">
                            Tüm Notlar
                        </h2>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {regularPages.map((page, index) => (
                            <PageCard
                                key={page.id}
                                page={page}
                                className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-backwards"
                                style={{ animationDelay: `${index * 0.05}s` }}
                                onOpen={() => router.push(`/notes/${page.id}`)}
                                onToggleFavorite={() => toggleFavorite(page)}
                                onToggleArchive={() => toggleArchive(page)}
                                onDelete={() => deletePage(page.id)}
                                formatDate={formatDate}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
