"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Link from "@tiptap/extension-link";
import { common, createLowlight } from "lowlight";
import { useCallback, useEffect, useRef, useState } from "react";
import { SlashCommandMenu, SlashCommandMenuHandle } from "./slash-command-menu";
import Image from "@tiptap/extension-image";
import { uploadImage } from "../../lib/upload-image";
import { FloatingToolbar } from "./floating-toolbar";

const lowlight = createLowlight(common);

interface TiptapEditorProps {
    content: Record<string, unknown>;
    onUpdate: (content: Record<string, unknown>) => void;
    editable?: boolean;
}

export function TiptapEditor({
    content,
    onUpdate,
    editable = true,
}: TiptapEditorProps) {
    const [slashMenuOpen, setSlashMenuOpen] = useState(false);
    const [slashMenuPos, setSlashMenuPos] = useState({ top: 0, left: 0 });
    const [toolbarVisible, setToolbarVisible] = useState(false);
    const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });
    const slashQueryRef = useRef("");
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const slashMenuRef = useRef<SlashCommandMenuHandle>(null);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                codeBlock: false,
                heading: {
                    levels: [1, 2, 3],
                },
            }),
            Image.configure({
                inline: true,
                allowBase64: true,
            }),
            Placeholder.configure({
                placeholder: ({ node }) => {
                    if (node.type.name === "heading") {
                        return `Başlık ${node.attrs.level}`;
                    }
                    return "Yazmaya başla veya '/' komutu kullan...";
                },
            }),
            TaskList,
            TaskItem.configure({
                nested: true,
            }),
            Underline,
            Highlight.configure({
                multicolor: true,
            }),
            TextAlign.configure({
                types: ["heading", "paragraph"],
            }),
            CodeBlockLowlight.configure({
                lowlight,
            }),
            Link.configure({
                openOnClick: false,
                autolink: true,
            }),
        ],
        content: content && Object.keys(content).length > 0 ? content : undefined,
        editable,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class:
                    "prose prose-invert max-w-none focus:outline-none min-h-[500px] px-1 py-2",
            },

            handleKeyDown: (_view, event) => {
                if (slashMenuOpen && slashMenuRef.current) {
                    return slashMenuRef.current.handleKeyDown(event as unknown as KeyboardEvent);
                }
                if (slashMenuOpen && event.key === "Escape") {
                    setSlashMenuOpen(false);
                    return true;
                }
                return false;
            },
            handlePaste: (view, event) => {
                if (event.clipboardData && event.clipboardData.files.length > 0) {
                    event.preventDefault();
                    const file = event.clipboardData.files[0];
                    if (file.type.startsWith("image/")) {
                        uploadImage(file).then((url) => {
                            if (url) {
                                view.dispatch(
                                    view.state.tr.replaceSelectionWith(
                                        view.state.schema.nodes.image.create({
                                            src: url,
                                        })
                                    )
                                );
                            }
                        });
                        return true;
                    }
                }
                return false;
            },
        },
        onSelectionUpdate: ({ editor }) => {
            const { from, to } = editor.state.selection;
            if (from !== to) {
                // Text is selected - show floating toolbar
                const coords = editor.view.coordsAtPos(from);
                const container = editorContainerRef.current;
                if (container) {
                    const rect = container.getBoundingClientRect();
                    setToolbarPos({
                        top: coords.top - rect.top - 50,
                        left: coords.left - rect.left,
                    });
                }
                setToolbarVisible(true);
            } else {
                setToolbarVisible(false);
            }
        },
        onUpdate: ({ editor }) => {
            const json = editor.getJSON();
            onUpdate(json as Record<string, unknown>);

            // Check for slash command
            const { from } = editor.state.selection;
            const textBefore = editor.state.doc.textBetween(
                Math.max(0, from - 20),
                from,
                "\n"
            );

            const slashIndex = textBefore.lastIndexOf("/");
            if (slashIndex !== -1) {
                const query = textBefore.slice(slashIndex + 1);
                slashQueryRef.current = query;

                // Get cursor position for menu placement
                const coords = editor.view.coordsAtPos(from);
                const container = editorContainerRef.current;
                if (container) {
                    const rect = container.getBoundingClientRect();
                    setSlashMenuPos({
                        top: coords.bottom - rect.top + 8,
                        left: coords.left - rect.left,
                    });
                }
                setSlashMenuOpen(true);
            } else {
                setSlashMenuOpen(false);
            }
        },
    });

    // Update editor content when prop changes externally
    useEffect(() => {
        if (editor && content && Object.keys(content).length > 0) {
            const currentContent = editor.getJSON();
            if (JSON.stringify(currentContent) !== JSON.stringify(content)) {
                editor.commands.setContent(content);
            }
        }
    }, [content, editor]);

    const handleSlashCommand = useCallback(
        (command: string) => {
            if (!editor) return;

            // Delete the slash and query text
            const { from } = editor.state.selection;
            const textBefore = editor.state.doc.textBetween(
                Math.max(0, from - 20),
                from,
                "\n"
            );
            const slashIndex = textBefore.lastIndexOf("/");
            if (slashIndex !== -1) {
                const deleteFrom = from - (textBefore.length - slashIndex);
                editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
            }

            switch (command) {
                case "heading1":
                    editor.chain().focus().toggleHeading({ level: 1 }).run();
                    break;
                case "heading2":
                    editor.chain().focus().toggleHeading({ level: 2 }).run();
                    break;
                case "heading3":
                    editor.chain().focus().toggleHeading({ level: 3 }).run();
                    break;
                case "bulletList":
                    editor.chain().focus().toggleBulletList().run();
                    break;
                case "orderedList":
                    editor.chain().focus().toggleOrderedList().run();
                    break;
                case "taskList":
                    editor.chain().focus().toggleTaskList().run();
                    break;
                case "blockquote":
                    editor.chain().focus().toggleBlockquote().run();
                    break;
                case "codeBlock":
                    editor.chain().focus().toggleCodeBlock().run();
                    break;
                case "horizontalRule":
                    editor.chain().focus().setHorizontalRule().run();
                    break;
            }

            setSlashMenuOpen(false);
        },
        [editor]
    );

    if (!editor) return null;

    return (
        <div ref={editorContainerRef} className="relative">
            {/* Floating Toolbar (appears on text selection) */}
            {toolbarVisible && editor && (
                <FloatingToolbar editor={editor} position={toolbarPos} />
            )}

            {/* Slash Command Menu */}
            {slashMenuOpen && (
                <SlashCommandMenu
                    ref={slashMenuRef}
                    query={slashQueryRef.current}
                    position={slashMenuPos}
                    onSelect={handleSlashCommand}
                    onClose={() => setSlashMenuOpen(false)}
                />
            )}

            {/* Editor Content */}
            <EditorContent editor={editor} />
        </div>
    );
}
