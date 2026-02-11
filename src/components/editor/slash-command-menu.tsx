"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    CheckSquare,
    Quote,
    Code2,
    Minus,
    Type,
} from "lucide-react";

interface SlashCommandMenuProps {
    query: string;
    position: { top: number; left: number };
    onSelect: (command: string) => void;
    onClose: () => void;
}

const commands = [
    {
        id: "heading1",
        label: "Başlık 1",
        description: "Büyük başlık",
        icon: Heading1,
        keywords: ["h1", "heading", "baslik", "başlık"],
    },
    {
        id: "heading2",
        label: "Başlık 2",
        description: "Orta başlık",
        icon: Heading2,
        keywords: ["h2", "heading", "baslik", "başlık"],
    },
    {
        id: "heading3",
        label: "Başlık 3",
        description: "Küçük başlık",
        icon: Heading3,
        keywords: ["h3", "heading", "baslik", "başlık"],
    },
    {
        id: "bulletList",
        label: "Madde Listesi",
        description: "Sırasız madde listesi",
        icon: List,
        keywords: ["bullet", "list", "ul", "madde", "liste"],
    },
    {
        id: "orderedList",
        label: "Numaralı Liste",
        description: "Sıralı numara listesi",
        icon: ListOrdered,
        keywords: ["ordered", "list", "ol", "numara", "sıralı"],
    },
    {
        id: "taskList",
        label: "Yapılacaklar",
        description: "Onay kutusu ile yapılacak listesi",
        icon: CheckSquare,
        keywords: ["task", "todo", "check", "yapılacak", "görev"],
    },
    {
        id: "blockquote",
        label: "Alıntı",
        description: "Blok alıntı",
        icon: Quote,
        keywords: ["quote", "blockquote", "alıntı"],
    },
    {
        id: "codeBlock",
        label: "Kod Bloğu",
        description: "Sözdizimi vurgulu kod bloğu",
        icon: Code2,
        keywords: ["code", "block", "kod"],
    },
    {
        id: "horizontalRule",
        label: "Ayırıcı Çizgi",
        description: "Yatay ayırıcı çizgi",
        icon: Minus,
        keywords: ["hr", "divider", "separator", "ayırıcı", "çizgi"],
    },
];

export interface SlashCommandMenuHandle {
    handleKeyDown: (e: KeyboardEvent) => boolean;
}

export const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, SlashCommandMenuProps>(({
    query,
    position,
    onSelect,
    onClose,
}, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const menuRef = useRef<HTMLDivElement>(null);

    const filteredCommands = commands.filter((cmd) => {
        if (!query) return true;
        const lowerQuery = query.toLowerCase();
        return (
            cmd.label.toLowerCase().includes(lowerQuery) ||
            cmd.keywords.some((kw) => kw.includes(lowerQuery))
        );
    });

    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    useImperativeHandle(ref, () => ({
        handleKeyDown: (e: KeyboardEvent) => {
            if (filteredCommands.length === 0) return false;

            if (e.key === "ArrowDown") {
                setSelectedIndex((prev) =>
                    prev < filteredCommands.length - 1 ? prev + 1 : 0
                );
                return true;
            } else if (e.key === "ArrowUp") {
                setSelectedIndex((prev) =>
                    prev > 0 ? prev - 1 : filteredCommands.length - 1
                );
                return true;
            } else if (e.key === "Enter") {
                if (filteredCommands[selectedIndex]) {
                    onSelect(filteredCommands[selectedIndex].id);
                    return true;
                }
            } else if (e.key === "Escape") {
                onClose();
                return true;
            }
            return false;
        },
    }));

    if (filteredCommands.length === 0) {
        return null;
    }

    return (
        <div
            ref={menuRef}
            className="absolute z-50 w-72 rounded-xl border border-border bg-popover p-1.5 shadow-2xl shadow-black/20 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 outline-none"
            style={{ top: position.top, left: position.left }}
        >
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Blok Türleri
            </div>
            {filteredCommands.map((cmd, index) => (
                <button
                    key={cmd.id}
                    onClick={() => onSelect(cmd.id)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors ${index === selectedIndex
                        ? "bg-violet-500/10 text-violet-400"
                        : "text-foreground hover:bg-accent"
                        }`}
                >
                    <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg border ${index === selectedIndex
                            ? "border-violet-500/30 bg-violet-500/10"
                            : "border-border bg-background"
                            }`}
                    >
                        <cmd.icon className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                        <div className="font-medium">{cmd.label}</div>
                        <div className="text-xs text-muted-foreground">
                            {cmd.description}
                        </div>
                    </div>
                </button>
            ))}
        </div>
    );
});

SlashCommandMenu.displayName = "SlashCommandMenu";
