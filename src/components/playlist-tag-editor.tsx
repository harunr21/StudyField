"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

interface PlaylistTagEditorProps {
    tags: string[];
    onTagsChange: (tags: string[]) => void;
    disabled?: boolean;
}

export function PlaylistTagEditor({ tags, onTagsChange, disabled }: PlaylistTagEditorProps) {
    const [input, setInput] = useState("");

    const addTag = () => {
        const trimmed = input.trim().toLowerCase();
        if (!trimmed || trimmed.length > 30 || tags.includes(trimmed) || tags.length >= 10) {
            setInput("");
            return;
        }
        onTagsChange([...tags, trimmed]);
        setInput("");
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                {tags.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Henüz tag yok</span>
                ) : (
                    tags.map((tag) => (
                        <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-xs"
                        >
                            {tag}
                            {!disabled && (
                                <button
                                    type="button"
                                    onClick={() => onTagsChange(tags.filter((t) => t !== tag))}
                                    className="ml-0.5 hover:text-red-300 transition-colors"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </span>
                    ))
                )}
            </div>
            {!disabled && tags.length < 10 && (
                <Input
                    placeholder="Tag ekle, Enter ile onayla…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addTag();
                        }
                    }}
                    maxLength={30}
                    className="h-9 text-sm"
                />
            )}
            <p className="text-xs text-muted-foreground">{tags.length}/10 tag · Maks. 30 karakter</p>
        </div>
    );
}
