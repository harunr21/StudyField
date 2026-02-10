"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Page } from "@/lib/supabase/types";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    PlusCircle,
    FileText,
    Search,
    Star,
    StarOff,
    MoreHorizontal,
    Trash2,
    Archive,
    ArchiveRestore,
    Clock,
    Loader2,
} from "lucide-react";

export default function NotesPage() {
    const [pages, setPages] = useState<Page[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [showArchived, setShowArchived] = useState(false);
    const [newPageTitle, setNewPageTitle] = useState("");
    const [newPageIcon, setNewPageIcon] = useState("📄");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [creating, setCreating] = useState(false);
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

    useEffect(() => {
        fetchPages();
    }, [fetchPages]);

    // Realtime subscription
    useEffect(() => {
        const channel = supabase
            .channel("pages-changes")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "pages" },
                () => {
                    fetchPages();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, fetchPages]);

    const createPage = async () => {
        if (!newPageTitle.trim()) return;
        setCreating(true);

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const { data, error } = await supabase
            .from("pages")
            .insert({
                title: newPageTitle.trim(),
                icon: newPageIcon,
                user_id: user.id,
                content: {},
            })
            .select()
            .single();

        if (!error && data) {
            setNewPageTitle("");
            setNewPageIcon("📄");
            setDialogOpen(false);
            router.push(`/notes/${data.id}`);
        }
        setCreating(false);
    };

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
        await supabase
            .from("pages")
            .update({ is_favorite: !page.is_favorite })
            .eq("id", page.id);
        fetchPages();
    };

    const toggleArchive = async (page: Page) => {
        await supabase
            .from("pages")
            .update({ is_archived: !page.is_archived })
            .eq("id", page.id);
        fetchPages();
    };

    const deletePage = async (id: string) => {
        if (!confirm("Bu notu kalıcı olarak silmek istediğine emin misin?")) return;
        await supabase.from("pages").delete().eq("id", id);
        fetchPages();
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

    const icons = ["📄", "📝", "📚", "📖", "🎯", "💡", "🔥", "⚡", "🚀", "💻", "📌", "🗂️", "📋", "🧠", "✨", "🌟", "📊", "🎓", "🔬", "🎨"];

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
                        {favoritePages.map((page) => (
                            <PageCard
                                key={page.id}
                                page={page}
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
                        {regularPages.map((page) => (
                            <PageCard
                                key={page.id}
                                page={page}
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

// Page Card Component
function PageCard({
    page,
    onOpen,
    onToggleFavorite,
    onToggleArchive,
    onDelete,
    formatDate,
}: {
    page: Page;
    onOpen: () => void;
    onToggleFavorite: () => void;
    onToggleArchive: () => void;
    onDelete: () => void;
    formatDate: (d: string) => string;
}) {
    return (
        <div
            onClick={onOpen}
            className="group relative cursor-pointer rounded-xl border border-border/50 bg-card p-4 transition-all duration-200 hover:border-border hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5"
        >
            <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{page.icon}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite();
                        }}
                        className="p-1 rounded-md hover:bg-accent transition-colors"
                    >
                        {page.is_favorite ? (
                            <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                        ) : (
                            <StarOff className="h-4 w-4 text-muted-foreground" />
                        )}
                    </button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <button className="p-1 rounded-md hover:bg-accent transition-colors">
                                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleArchive();
                                }}
                            >
                                {page.is_archived ? (
                                    <>
                                        <ArchiveRestore className="mr-2 h-4 w-4" />
                                        Arşivden Çıkar
                                    </>
                                ) : (
                                    <>
                                        <Archive className="mr-2 h-4 w-4" />
                                        Arşivle
                                    </>
                                )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete();
                                }}
                                className="text-destructive focus:text-destructive"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Sil
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
            <h3 className="font-semibold mb-1 line-clamp-1">{page.title}</h3>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDate(page.updated_at)}
            </div>
        </div>
    );
}
