"use client";

import { type Editor } from "@tiptap/react";
import {
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Code,
    Highlighter,
    Link,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";

interface FloatingToolbarProps {
    editor: Editor;
    position: { top: number; left: number };
}

export function FloatingToolbar({ editor, position }: FloatingToolbarProps) {
    const items = [
        {
            icon: Bold,
            title: "Kalın",
            action: () => editor.chain().focus().toggleBold().run(),
            isActive: () => editor.isActive("bold"),
        },
        {
            icon: Italic,
            title: "İtalik",
            action: () => editor.chain().focus().toggleItalic().run(),
            isActive: () => editor.isActive("italic"),
        },
        {
            icon: Underline,
            title: "Altı Çizili",
            action: () => editor.chain().focus().toggleUnderline().run(),
            isActive: () => editor.isActive("underline"),
        },
        {
            icon: Strikethrough,
            title: "Üstü Çizili",
            action: () => editor.chain().focus().toggleStrike().run(),
            isActive: () => editor.isActive("strike"),
        },
        {
            icon: Code,
            title: "Satır İçi Kod",
            action: () => editor.chain().focus().toggleCode().run(),
            isActive: () => editor.isActive("code"),
        },
        {
            icon: Highlighter,
            title: "Vurgula",
            action: () => editor.chain().focus().toggleHighlight().run(),
            isActive: () => editor.isActive("highlight"),
        },
        {
            icon: Link,
            title: "Bağlantı",
            action: () => {
                const previousUrl = editor.getAttributes("link").href;
                const url = window.prompt("URL girin:", previousUrl);
                if (url === null) return;
                if (url === "") {
                    editor.chain().focus().extendMarkRange("link").unsetLink().run();
                    return;
                }
                editor
                    .chain()
                    .focus()
                    .extendMarkRange("link")
                    .setLink({ href: url })
                    .run();
            },
            isActive: () => editor.isActive("link"),
        },
    ];

    return (
        <div
            className="absolute z-50 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-xl animate-in fade-in-0 zoom-in-95"
            style={{ top: position.top, left: position.left }}
            onMouseDown={(e) => e.preventDefault()} // Prevent losing selection
        >
            {items.map((item) => (
                <Toggle
                    key={item.title}
                    size="sm"
                    pressed={item.isActive()}
                    onPressedChange={() => item.action()}
                    aria-label={item.title}
                    className="h-8 w-8 p-0 data-[state=on]:bg-violet-500/20 data-[state=on]:text-violet-400"
                >
                    <item.icon className="h-4 w-4" />
                </Toggle>
            ))}
        </div>
    );
}
