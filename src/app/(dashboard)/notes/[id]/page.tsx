"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Page } from "@/lib/supabase/types";
import { useRouter, useParams } from "next/navigation";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    ArrowLeft,
    Star,
    StarOff,
    Loader2,
    Check,
    Cloud,
    CloudOff,
} from "lucide-react";

export default function NoteEditorPage() {
    const params = useParams();
    const router = useRouter();
    const pageId = params.id as string;
    const supabase = createClient();

    const [page, setPage] = useState<Page | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [title, setTitle] = useState("");
    const [icon, setIcon] = useState("📄");
    const [showIconPicker, setShowIconPicker] = useState(false);

    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const contentRef = useRef<Record<string, unknown>>({});

    const icons = [
        "📄", "📝", "📚", "📖", "🎯", "💡", "🔥", "⚡", "🚀", "💻",
        "📌", "🗂️", "📋", "🧠", "✨", "🌟", "📊", "🎓", "🔬", "🎨",
        "🏆", "🎵", "🌍", "🔒", "📡", "🛠️", "🧪", "📐", "🖥️", "⭐",
    ];

    // Fetch page data
    useEffect(() => {
        const fetchPage = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from("pages")
                .select("*")
                .eq("id", pageId)
                .single();

            if (error || !data) {
                router.push("/notes");
                return;
            }

            const pageData = data as Page;
            setPage(pageData);
            setTitle(pageData.title);
            setIcon(pageData.icon);
            contentRef.current = pageData.content;
            setLoading(false);
        };

        fetchPage();
    }, [pageId, router, supabase]);

    // Auto-save function
    const saveContent = useCallback(
        async (updates: Partial<Page>) => {
            setSaving(true);
            const { error } = await supabase
                .from("pages")
                .update(updates)
                .eq("id", pageId);

            if (!error) {
                setLastSaved(new Date());
            }
            setSaving(false);
        },
        [pageId, supabase]
    );

    // Debounced content save
    const handleContentUpdate = useCallback(
        (content: Record<string, unknown>) => {
            contentRef.current = content;

            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }

            saveTimeoutRef.current = setTimeout(() => {
                saveContent({ content });
            }, 1000); // Save after 1 second of inactivity
        },
        [saveContent]
    );

    // Title save
    const handleTitleChange = useCallback(
        (newTitle: string) => {
            setTitle(newTitle);

            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }

            saveTimeoutRef.current = setTimeout(() => {
                saveContent({ title: newTitle || "Başlıksız" });
            }, 500);
        },
        [saveContent]
    );

    // Icon change
    const handleIconChange = useCallback(
        (newIcon: string) => {
            setIcon(newIcon);
            setShowIconPicker(false);
            saveContent({ icon: newIcon });
        },
        [saveContent]
    );

    // Toggle favorite
    const toggleFavorite = async () => {
        if (!page) return;
        const newFav = !page.is_favorite;
        setPage({ ...page, is_favorite: newFav });
        await supabase
            .from("pages")
            .update({ is_favorite: newFav })
            .eq("id", pageId);
    };

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!page) return null;

    return (
        <div className="max-w-4xl mx-auto">
            {/* Top Bar */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b border-border/30 backdrop-blur-sm bg-background/80">
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push("/notes")}
                        className="gap-1.5"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Notlar
                    </Button>
                </div>
                <div className="flex items-center gap-2">
                    {/* Save Status */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {saving ? (
                            <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Kaydediliyor...
                            </>
                        ) : lastSaved ? (
                            <>
                                <Check className="h-3 w-3 text-emerald-500" />
                                <Cloud className="h-3 w-3 text-emerald-500" />
                                Kaydedildi
                            </>
                        ) : (
                            <>
                                <CloudOff className="h-3 w-3" />
                                Bekleniyor
                            </>
                        )}
                    </div>

                    {/* Favorite */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleFavorite}
                        className="h-8 w-8 p-0"
                    >
                        {page.is_favorite ? (
                            <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                        ) : (
                            <StarOff className="h-4 w-4 text-muted-foreground" />
                        )}
                    </Button>
                </div>
            </div>

            {/* Editor Area */}
            <div className="px-6 md:px-16 py-8">
                {/* Icon + Title */}
                <div className="mb-6">
                    {/* Icon Picker */}
                    <div className="relative inline-block mb-2">
                        <button
                            onClick={() => setShowIconPicker(!showIconPicker)}
                            className="text-5xl hover:bg-accent rounded-lg p-2 transition-colors cursor-pointer"
                            title="İkon değiştir"
                        >
                            {icon}
                        </button>
                        {showIconPicker && (
                            <div className="absolute top-full left-0 z-50 mt-1 p-3 bg-popover border border-border rounded-xl shadow-2xl grid grid-cols-6 gap-1 w-[280px] animate-in fade-in-0 zoom-in-95">
                                {icons.map((emoji) => (
                                    <button
                                        key={emoji}
                                        onClick={() => handleIconChange(emoji)}
                                        className="text-2xl p-2 hover:bg-accent rounded-lg transition-colors"
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Title Input */}
                    <input
                        value={title}
                        onChange={(e) => handleTitleChange(e.target.value)}
                        placeholder="Başlıksız"
                        className="w-full text-4xl font-bold leading-[1.25] bg-transparent border-none outline-none placeholder:text-muted-foreground/30 tracking-tight pt-2 pb-3"
                    />
                </div>

                {/* Tiptap Editor */}
                <TiptapEditor
                    content={page.content}
                    onUpdate={handleContentUpdate}
                />
            </div>
        </div>
    );
}
