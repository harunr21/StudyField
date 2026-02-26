"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Youtube, StickyNote, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { searchWorkspace, type GlobalSearchItem } from "@/lib/global-search";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function itemIcon(kind: GlobalSearchItem["kind"]) {
    if (kind === "youtube_video") return <Youtube className="h-4 w-4 text-red-400" />;
    return <StickyNote className="h-4 w-4 text-amber-400" />;
}

export function GlobalSearchDialog() {
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [items, setItems] = useState<GlobalSearchItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
            if (!isCmdK) return;
            event.preventDefault();
            setOpen(true);
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    useEffect(() => {
        if (!open) return;
        const id = setTimeout(() => inputRef.current?.focus(), 10);
        return () => clearTimeout(id);
    }, [open]);

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const runSearch = (nextQuery: string) => {
        setQuery(nextQuery);
        setError(null);

        if (debounceRef.current) clearTimeout(debounceRef.current);

        const trimmed = nextQuery.trim();
        if (trimmed.length < 2) {
            setItems([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const results = await searchWorkspace(supabase, trimmed);
                setItems(results);
            } catch {
                setError("Arama sirasinda bir hata olustu.");
                setItems([]);
            } finally {
                setLoading(false);
            }
        }, 220);
    };

    const openItem = (href: string) => {
        setOpen(false);
        router.push(href);
    };

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
                className="hidden sm:flex items-center gap-2 text-muted-foreground"
            >
                <Search className="h-4 w-4" />
                Ara
                <span className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    Ctrl K
                </span>
            </Button>

            <Button variant="outline" size="icon" onClick={() => setOpen(true)} className="sm:hidden">
                <Search className="h-4 w-4" />
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden" showCloseButton={false}>
                    <DialogTitle className="sr-only">Global Search</DialogTitle>

                    <div className="border-b border-border/50 px-4 py-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                ref={inputRef}
                                value={query}
                                onChange={(e) => runSearch(e.target.value)}
                                placeholder="Video veya video notu ara..."
                                className="pl-10 h-11 border-border/50"
                            />
                        </div>
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto p-2">
                        {loading && (
                            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Araniyor...
                            </div>
                        )}

                        {!loading && error && (
                            <div className="px-3 py-3 text-sm text-destructive">{error}</div>
                        )}

                        {!loading && !error && query.trim().length < 2 && (
                            <div className="px-3 py-3 text-sm text-muted-foreground">
                                Arama icin en az 2 karakter yazin.
                            </div>
                        )}

                        {!loading && !error && query.trim().length >= 2 && items.length === 0 && (
                            <div className="px-3 py-3 text-sm text-muted-foreground">Sonuc bulunamadi.</div>
                        )}

                        {!loading && !error && items.length > 0 && (
                            <div className="mb-2 last:mb-0">
                                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    YouTube
                                </div>
                                {items.map((item) => (
                                    <button
                                        key={`${item.kind}:${item.id}`}
                                        onClick={() => openItem(item.href)}
                                        className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-accent transition-colors flex items-start gap-3"
                                    >
                                        <span className="mt-0.5">{itemIcon(item.kind)}</span>
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium truncate">{item.title}</span>
                                            <span className="block text-xs text-muted-foreground truncate">{item.subtitle}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
