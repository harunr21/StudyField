"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { PdfDocument, PdfNote } from "@/lib/supabase/types";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    ArrowLeft,
    FileText,
    Loader2,
    Star,
    StarOff,
    StickyNote,
    Plus,
    Trash2,
    ChevronLeft,
    ChevronRight,
    ZoomIn,
    ZoomOut,
    Maximize2,
    Minimize2,
    Download,
    ExternalLink,
    PanelRightClose,
    PanelRightOpen,
    MoreVertical,
    Tag,
    X,
    Send,
    Clock,
    Edit3,
    Check,
    AlertCircle,
} from "lucide-react";

// Note colors
const NOTE_COLORS = [
    { name: "Mavi", value: "blue", bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", dot: "bg-blue-400" },
    { name: "Yeşil", value: "green", bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", dot: "bg-emerald-400" },
    { name: "Sarı", value: "yellow", bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", dot: "bg-amber-400" },
    { name: "Kırmızı", value: "red", bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", dot: "bg-red-400" },
    { name: "Mor", value: "purple", bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", dot: "bg-purple-400" },
];

import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function getColorClasses(color: string) {
    return NOTE_COLORS.find((c) => c.value === color) || NOTE_COLORS[0];
}

function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function PdfViewerPage() {
    const params = useParams();
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const pdfId = params.id as string;

    // Document state
    const [document, setDocument] = useState<PdfDocument | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [numPages, setNumPages] = useState<number>(0);

    // PDF viewer state
    const [currentPage, setCurrentPage] = useState(1);
    const [zoom, setZoom] = useState(100);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Notes state
    const [notes, setNotes] = useState<PdfNote[]>([]);
    const [notesPanelOpen, setNotesPanelOpen] = useState(true);
    const [newNoteContent, setNewNoteContent] = useState("");
    const [newNoteColor, setNewNoteColor] = useState("blue");
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState("");
    const [addingNote, setAddingNote] = useState(false);

    // Title editing
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleValue, setTitleValue] = useState("");

    // Tags
    const [newTag, setNewTag] = useState("");
    const [showTagInput, setShowTagInput] = useState(false);

    // Update zoom input when zoom changes
    const [zoomInput, setZoomInput] = useState(zoom.toString());

    useEffect(() => {
        setZoomInput(zoom.toString());
    }, [zoom]);

    const handleZoomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setZoomInput(e.target.value);
    };

    const handleZoomInputSubmit = () => {
        const val = parseInt(zoomInput);
        if (!isNaN(val)) {
            const newZoom = Math.max(10, Math.min(500, val));
            setZoom(newZoom);
            setZoomInput(newZoom.toString());
        } else {
            setZoomInput(zoom.toString());
        }
    };

    const handleZoomInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            handleZoomInputSubmit();
            (e.target as HTMLInputElement).blur();
        }
    };

    // Ctrl + Scroll Zoom
    const pdfContainerRef = useRef<HTMLDivElement>(null);
    const [isZoomActive, setIsZoomActive] = useState(false);
    const isZoomActiveRef = useRef(false);

    // Sync ref
    useEffect(() => {
        isZoomActiveRef.current = isZoomActive;
    }, [isZoomActive]);

    // Handle clicks outside to deactivate
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (pdfContainerRef.current && !pdfContainerRef.current.contains(event.target as Node)) {
                setIsZoomActive(false);
            }
        };

        window.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        const container = pdfContainerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                if (isZoomActiveRef.current) {
                    const delta = e.deltaY > 0 ? -10 : 10;
                    setZoom((prev) => Math.min(500, Math.max(10, prev + delta)));
                }
            }
        };

        container.addEventListener("wheel", handleWheel, { passive: false });
        return () => container.removeEventListener("wheel", handleWheel);
    }, []);

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages);
        // If we have a stored page count that's different, update it? 
        // Or just trust the PDF.
    }

    // Fetch document
    useEffect(() => {
        let cancelled = false;

        const fetchDocument = async () => {
            const { data, error } = await supabase
                .from("pdf_documents")
                .select("*")
                .eq("id", pdfId)
                .single();

            if (cancelled) return;

            if (error || !data) {
                setNotFound(true);
                setLoading(false);
                return;
            }

            setDocument(data as PdfDocument);
            setCurrentPage(data.last_page || 1);
            setNumPages(data.page_count || 0);
            setTitleValue(data.title);
            setLoading(false);
        };

        fetchDocument();
        return () => { cancelled = true; };
    }, [pdfId, supabase]);

    // Fetch notes
    const fetchNotes = useCallback(async () => {
        const { data } = await supabase
            .from("pdf_notes")
            .select("*")
            .eq("pdf_ref_id", pdfId)
            .order("page_number", { ascending: true })
            .order("created_at", { ascending: true });

        if (data) {
            setNotes(data as PdfNote[]);
        }
    }, [pdfId, supabase]);

    useEffect(() => {
        if (!loading && document) {
            fetchNotes();
        }
    }, [loading, document, fetchNotes]);

    // Save last page on change
    useEffect(() => {
        if (document && currentPage > 0) {
            const timeout = setTimeout(() => {
                supabase
                    .from("pdf_documents")
                    .update({ last_page: currentPage })
                    .eq("id", pdfId);
            }, 1000);
            return () => clearTimeout(timeout);
        }
    }, [currentPage, document, pdfId, supabase]);

    // CRUD Operations
    const addNote = async () => {
        if (!newNoteContent.trim()) return;
        setAddingNote(true);

        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            setAddingNote(false);
            return;
        }

        const { error } = await supabase.from("pdf_notes").insert({
            user_id: user.id,
            pdf_ref_id: pdfId,
            page_number: currentPage,
            content: newNoteContent.trim(),
            color: newNoteColor,
        });

        if (!error) {
            setNewNoteContent("");
            fetchNotes();
        }
        setAddingNote(false);
    };

    const deleteNote = async (noteId: string) => {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
        await supabase.from("pdf_notes").delete().eq("id", noteId);
    };

    const updateNote = async (noteId: string, content: string) => {
        if (!content.trim()) return;
        setNotes((prev) =>
            prev.map((n) =>
                n.id === noteId ? { ...n, content: content.trim() } : n
            )
        );
        await supabase
            .from("pdf_notes")
            .update({ content: content.trim() })
            .eq("id", noteId);
        setEditingNoteId(null);
    };

    const toggleFavorite = async () => {
        if (!document) return;
        const newVal = !document.is_favorite;
        setDocument({ ...document, is_favorite: newVal });
        await supabase
            .from("pdf_documents")
            .update({ is_favorite: newVal })
            .eq("id", pdfId);
    };

    const saveTitle = async () => {
        if (!titleValue.trim() || !document) return;
        setDocument({ ...document, title: titleValue.trim() });
        await supabase
            .from("pdf_documents")
            .update({ title: titleValue.trim() })
            .eq("id", pdfId);
        setEditingTitle(false);
    };

    const addTag = async () => {
        if (!newTag.trim() || !document) return;
        const tag = newTag.trim().toLowerCase();
        if (document.tags?.includes(tag)) {
            setNewTag("");
            return;
        }
        const updatedTags = [...(document.tags || []), tag];
        setDocument({ ...document, tags: updatedTags });
        await supabase
            .from("pdf_documents")
            .update({ tags: updatedTags })
            .eq("id", pdfId);
        setNewTag("");
        setShowTagInput(false);
    };

    const removeTag = async (tag: string) => {
        if (!document) return;
        const updatedTags = (document.tags || []).filter((t) => t !== tag);
        setDocument({ ...document, tags: updatedTags });
        await supabase
            .from("pdf_documents")
            .update({ tags: updatedTags })
            .eq("id", pdfId);
    };

    // Page navigation
    const goToPage = (page: number) => {
        if (!document) return;
        const maxPage = numPages || document.page_count || 9999;
        const newPage = Math.max(1, Math.min(page, maxPage));
        setCurrentPage(newPage);
    };

    // Notes filtered by current page
    const currentPageNotes = notes.filter(
        (n) => n.page_number === currentPage
    );
    const allNotesGrouped = useMemo(() => {
        const grouped: Record<number, PdfNote[]> = {};
        notes.forEach((n) => {
            if (!grouped[n.page_number]) grouped[n.page_number] = [];
            grouped[n.page_number].push(n);
        });
        return grouped;
    }, [notes]);

    // Fullscreen toggle
    const toggleFullscreen = () => {
        if (!globalThis.document.fullscreenElement) {
            globalThis.document.documentElement.requestFullscreen();
            setIsFullscreen(true);
        } else {
            globalThis.document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (notFound || !document) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] text-center p-6">
                <div className="h-16 w-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                    <FileText className="h-8 w-8 text-blue-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                    Döküman bulunamadı
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                    Bu döküman silinmiş veya erişiminiz yok olabilir.
                </p>
                <Button variant="outline" onClick={() => router.push("/pdf")}>
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    Dökümanlara Dön
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            {/* Top Bar */}
            <div className="flex-shrink-0 border-b border-border/50 bg-card/50 backdrop-blur-sm px-4 py-2">
                <div className="flex items-center justify-between gap-3">
                    {/* Left: Back + Title */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push("/pdf")}
                            className="flex-shrink-0"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div className="min-w-0 flex-1">
                            {editingTitle ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        autoFocus
                                        value={titleValue}
                                        onChange={(e) =>
                                            setTitleValue(e.target.value)
                                        }
                                        onBlur={saveTitle}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") saveTitle();
                                            if (e.key === "Escape") {
                                                setTitleValue(document.title);
                                                setEditingTitle(false);
                                            }
                                        }}
                                        className="font-semibold text-sm bg-transparent border-b border-blue-500 outline-none w-full max-w-xs"
                                    />
                                </div>
                            ) : (
                                <h1
                                    className="font-semibold text-sm truncate cursor-pointer hover:text-blue-400 transition-colors"
                                    onClick={() => setEditingTitle(true)}
                                    title="Düzenlemek için tıklayın"
                                >
                                    {document.title}
                                </h1>
                            )}
                            <div className="flex items-center gap-2 mt-0.5">
                                {/* Tags */}
                                {document.tags?.map((tag) => (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 group/tag"
                                    >
                                        {tag}
                                        <button
                                            onClick={() => removeTag(tag)}
                                            className="opacity-0 group-hover/tag:opacity-100 transition-opacity"
                                        >
                                            <X className="h-2.5 w-2.5" />
                                        </button>
                                    </span>
                                ))}
                                {showTagInput ? (
                                    <input
                                        autoFocus
                                        value={newTag}
                                        onChange={(e) =>
                                            setNewTag(e.target.value)
                                        }
                                        onBlur={() => {
                                            if (newTag.trim()) addTag();
                                            else setShowTagInput(false);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") addTag();
                                            if (e.key === "Escape")
                                                setShowTagInput(false);
                                        }}
                                        placeholder="Etiket..."
                                        className="text-[10px] bg-transparent border-b border-blue-500/50 outline-none w-16"
                                    />
                                ) : (
                                    <button
                                        onClick={() => setShowTagInput(true)}
                                        className="text-muted-foreground hover:text-blue-400 transition-colors"
                                    >
                                        <Tag className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Center: Page Navigation */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage <= 1}
                            className="h-8 w-8 p-0"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex items-center gap-1 text-sm">
                            <input
                                type="number"
                                value={currentPage}
                                onChange={(e) =>
                                    goToPage(parseInt(e.target.value) || 1)
                                }
                                className="w-12 text-center bg-accent/50 border border-border/50 rounded-md h-7 text-xs outline-none focus:border-blue-500"
                                min={1}
                                max={numPages || undefined}
                            />
                            {numPages > 0 && (
                                <span className="text-xs text-muted-foreground">
                                    / {numPages}
                                </span>
                            )}
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={
                                numPages > 0 &&
                                currentPage >= numPages
                            }
                            className="h-8 w-8 p-0"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Right: Controls */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                                setZoom((z) => Math.max(50, z - 25))
                            }
                            className="h-8 w-8 p-0"
                        >
                            <ZoomOut className="h-4 w-4" />
                        </Button>
                        <div className="w-12 mx-1 relative flex items-center justify-center">
                            <input
                                value={zoomInput}
                                onChange={handleZoomInputChange}
                                onBlur={handleZoomInputSubmit}
                                onKeyDown={handleZoomInputKeyDown}
                                className="w-full text-center bg-transparent text-xs text-muted-foreground focus:text-foreground outline-none border-b border-transparent focus:border-blue-500 transition-colors"
                            />
                            <span className="absolute right-0 text-[10px] text-muted-foreground/50 pointer-events-none translate-x-1.5">%</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                                setZoom((z) => Math.min(200, z + 25))
                            }
                            className="h-8 w-8 p-0"
                        >
                            <ZoomIn className="h-4 w-4" />
                        </Button>

                        <div className="w-px h-5 bg-border/50 mx-1" />

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={toggleFavorite}
                            className="h-8 w-8 p-0"
                        >
                            {document.is_favorite ? (
                                <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                            ) : (
                                <StarOff className="h-4 w-4" />
                            )}
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={toggleFullscreen}
                            className="h-8 w-8 p-0"
                        >
                            {isFullscreen ? (
                                <Minimize2 className="h-4 w-4" />
                            ) : (
                                <Maximize2 className="h-4 w-4" />
                            )}
                        </Button>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                >
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    onClick={() =>
                                        window.open(document.file_url, "_blank")
                                    }
                                >
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Yeni Sekmede Aç
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <a
                                        href={document.file_url}
                                        download={document.file_name}
                                    >
                                        <Download className="mr-2 h-4 w-4" />
                                        İndir
                                    </a>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <div className="w-px h-5 bg-border/50 mx-1" />

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                                setNotesPanelOpen(!notesPanelOpen)
                            }
                            className="h-8 w-8 p-0"
                            title={
                                notesPanelOpen
                                    ? "Notları Gizle"
                                    : "Notları Göster"
                            }
                        >
                            {notesPanelOpen ? (
                                <PanelRightClose className="h-4 w-4" />
                            ) : (
                                <PanelRightOpen className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* PDF Viewer */}
                <div
                    ref={pdfContainerRef}
                    className={`flex-1 overflow-auto bg-muted/30 flex items-start justify-center p-4 outline-none transition-colors ${isZoomActive ? "ring-1 ring-inset ring-blue-500/20 bg-blue-500/5" : ""
                        }`}
                    onClick={() => setIsZoomActive(true)}
                >
                    <div className="relative shadow-xl">
                        <Document
                            file={document.file_url}
                            onLoadSuccess={onDocumentLoadSuccess}
                            loading={
                                <div className="flex items-center justify-center p-10">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            }
                            error={
                                <div className="flex flex-col items-center justify-center p-10 text-destructive bg-destructive/10 rounded-lg">
                                    <AlertCircle className="h-8 w-8 mb-2" />
                                    <p>PDF yüklenirken hata oluştu.</p>
                                </div>
                            }
                            className="flex justify-center"
                        >
                            <Page
                                pageNumber={currentPage}
                                scale={zoom / 100}
                                renderTextLayer={true}
                                renderAnnotationLayer={true}
                                className="shadow-lg"
                                loading={
                                    <div className="flex items-center justify-center h-[800px] w-[600px] bg-white">
                                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                    </div>
                                }
                            />
                        </Document>
                    </div>
                </div>

                {/* Notes Panel */}
                {notesPanelOpen && (
                    <div className="w-80 lg:w-96 flex-shrink-0 border-l border-border/50 bg-card/30 flex flex-col overflow-hidden">
                        {/* Notes Header */}
                        <div className="flex-shrink-0 px-4 py-3 border-b border-border/50">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <StickyNote className="h-4 w-4 text-blue-400" />
                                    <h2 className="font-semibold text-sm">
                                        Notlar
                                    </h2>
                                    <span className="text-xs text-muted-foreground bg-accent/50 px-1.5 py-0.5 rounded-full">
                                        {notes.length}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <span>Sayfa {currentPage}</span>
                                    {currentPageNotes.length > 0 && (
                                        <span className="text-blue-400">
                                            ({currentPageNotes.length})
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Notes List */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {/* Current page notes */}
                            {currentPageNotes.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1">
                                        Bu Sayfadaki Notlar
                                    </p>
                                    {currentPageNotes.map((note) => (
                                        <NoteCard
                                            key={note.id}
                                            note={note}
                                            isEditing={
                                                editingNoteId === note.id
                                            }
                                            editingContent={editingContent}
                                            onStartEdit={() => {
                                                setEditingNoteId(note.id);
                                                setEditingContent(
                                                    note.content
                                                );
                                            }}
                                            onCancelEdit={() =>
                                                setEditingNoteId(null)
                                            }
                                            onSaveEdit={() =>
                                                updateNote(
                                                    note.id,
                                                    editingContent
                                                )
                                            }
                                            onEditChange={setEditingContent}
                                            onDelete={() =>
                                                deleteNote(note.id)
                                            }
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Other pages notes */}
                            {Object.entries(allNotesGrouped)
                                .filter(
                                    ([page]) =>
                                        parseInt(page) !== currentPage
                                )
                                .sort(
                                    ([a], [b]) =>
                                        parseInt(a) - parseInt(b)
                                )
                                .map(([page, pageNotes]) => (
                                    <div key={page} className="space-y-2">
                                        <button
                                            onClick={() =>
                                                goToPage(parseInt(page))
                                            }
                                            className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 hover:text-blue-400 transition-colors cursor-pointer"
                                        >
                                            Sayfa {page} ({pageNotes.length})
                                        </button>
                                        {pageNotes.map((note) => (
                                            <NoteCard
                                                key={note.id}
                                                note={note}
                                                isEditing={
                                                    editingNoteId === note.id
                                                }
                                                editingContent={
                                                    editingContent
                                                }
                                                onStartEdit={() => {
                                                    setEditingNoteId(
                                                        note.id
                                                    );
                                                    setEditingContent(
                                                        note.content
                                                    );
                                                }}
                                                onCancelEdit={() =>
                                                    setEditingNoteId(null)
                                                }
                                                onSaveEdit={() =>
                                                    updateNote(
                                                        note.id,
                                                        editingContent
                                                    )
                                                }
                                                onEditChange={
                                                    setEditingContent
                                                }
                                                onDelete={() =>
                                                    deleteNote(note.id)
                                                }
                                                dimmed
                                            />
                                        ))}
                                    </div>
                                ))}

                            {notes.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <StickyNote className="h-8 w-8 text-muted-foreground/30 mb-3" />
                                    <p className="text-sm text-muted-foreground">
                                        Henüz not yok
                                    </p>
                                    <p className="text-xs text-muted-foreground/60 mt-1">
                                        Aşağıdan not ekleyebilirsiniz
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Add Note */}
                        <div className="flex-shrink-0 border-t border-border/50 p-3">
                            {/* Color selector */}
                            <div className="flex items-center gap-1.5 mb-2">
                                {NOTE_COLORS.map((color) => (
                                    <button
                                        key={color.value}
                                        onClick={() =>
                                            setNewNoteColor(color.value)
                                        }
                                        className={`h-5 w-5 rounded-full ${color.dot} transition-all ${newNoteColor === color.value
                                            ? "ring-2 ring-offset-2 ring-offset-background ring-blue-500 scale-110"
                                            : "opacity-50 hover:opacity-80"
                                            }`}
                                        title={color.name}
                                    />
                                ))}
                                <span className="text-[10px] text-muted-foreground ml-auto">
                                    S. {currentPage}
                                </span>
                            </div>
                            <div className="flex items-end gap-2">
                                <textarea
                                    value={newNoteContent}
                                    onChange={(e) =>
                                        setNewNoteContent(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                        if (
                                            e.key === "Enter" &&
                                            !e.shiftKey
                                        ) {
                                            e.preventDefault();
                                            addNote();
                                        }
                                    }}
                                    placeholder="Not ekle..."
                                    rows={2}
                                    className="flex-1 resize-none rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-sm outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder:text-muted-foreground/50"
                                />
                                <Button
                                    size="sm"
                                    onClick={addNote}
                                    disabled={
                                        !newNoteContent.trim() || addingNote
                                    }
                                    className="h-9 w-9 p-0 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white flex-shrink-0"
                                >
                                    {addingNote ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================
// Note Card Component
// ============================================
function NoteCard({
    note,
    isEditing,
    editingContent,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onEditChange,
    onDelete,
    dimmed = false,
}: {
    note: PdfNote;
    isEditing: boolean;
    editingContent: string;
    onStartEdit: () => void;
    onCancelEdit: () => void;
    onSaveEdit: () => void;
    onEditChange: (value: string) => void;
    onDelete: () => void;
    dimmed?: boolean;
}) {
    const colors = getColorClasses(note.color);

    return (
        <div
            className={`group rounded-lg ${colors.bg} ${colors.border} border p-3 transition-all duration-200 hover:shadow-sm ${dimmed ? "opacity-60 hover:opacity-100" : ""
                }`}
        >
            {isEditing ? (
                <div className="space-y-2">
                    <textarea
                        autoFocus
                        value={editingContent}
                        onChange={(e) => onEditChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                onSaveEdit();
                            }
                            if (e.key === "Escape") onCancelEdit();
                        }}
                        rows={3}
                        className="w-full resize-none rounded-md bg-background/50 border border-border/50 px-2 py-1.5 text-sm outline-none focus:border-blue-500/50"
                    />
                    <div className="flex justify-end gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onCancelEdit}
                            className="h-7 text-xs"
                        >
                            İptal
                        </Button>
                        <Button
                            size="sm"
                            onClick={onSaveEdit}
                            className="h-7 text-xs bg-blue-500 hover:bg-blue-600 text-white"
                        >
                            <Check className="h-3 w-3 mr-1" />
                            Kaydet
                        </Button>
                    </div>
                </div>
            ) : (
                <>
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                        {note.content}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" />
                                {formatDate(note.created_at)}
                            </span>
                            <span className="text-[10px] text-muted-foreground/40">•</span>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-background/50 border border-border/50 shadow-sm ${colors.text}`}>
                                Sayfa {note.page_number}
                            </span>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={onStartEdit}
                                className="p-1 rounded hover:bg-background/50 transition-colors"
                                title="Düzenle"
                            >
                                <Edit3 className="h-3 w-3 text-muted-foreground" />
                            </button>
                            <button
                                onClick={onDelete}
                                className="p-1 rounded hover:bg-background/50 transition-colors"
                                title="Sil"
                            >
                                <Trash2 className="h-3 w-3 text-destructive" />
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
