"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { PdfDocument } from "@/lib/supabase/types";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    FileBox,
    PlusCircle,
    Search,
    Loader2,
    MoreHorizontal,
    Trash2,
    Clock,
    Upload,
    File,
    Star,
    StarOff,
    Archive,
    ArchiveRestore,
    FileText,
    StickyNote,
    Tag,
    X,
    Grid3X3,
    List,
    AlertCircle,
} from "lucide-react";

// Helper: Format file size
function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Helper: Format date
function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

// Helper: Format date with time
function formatDateTime(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function PdfPage() {
    const [documents, setDocuments] = useState<PdfDocument[]>([]);
    const [noteStats, setNoteStats] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [showArchived, setShowArchived] = useState(false);
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState("");
    const [uploadError, setUploadError] = useState("");
    const [dragActive, setDragActive] = useState(false);
    const [tagFilter, setTagFilter] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);

    // Fetch documents
    const fetchDocuments = useCallback(async () => {
        const { data, error } = await supabase
            .from("pdf_documents")
            .select("*")
            .eq("is_archived", showArchived)
            .order("updated_at", { ascending: false });

        if (!error && data) {
            setDocuments(data as PdfDocument[]);

            // Fetch note counts
            const docIds = (data as PdfDocument[]).map((d) => d.id);
            if (docIds.length > 0) {
                const { data: notes } = await supabase
                    .from("pdf_notes")
                    .select("pdf_ref_id")
                    .in("pdf_ref_id", docIds);

                if (notes) {
                    const stats: Record<string, number> = {};
                    for (const note of notes) {
                        stats[note.pdf_ref_id] = (stats[note.pdf_ref_id] || 0) + 1;
                    }
                    setNoteStats(stats);
                }
            }
        }
        setLoading(false);
    }, [showArchived, supabase]);

    useEffect(() => {
        fetchDocuments();
    }, [fetchDocuments]);

    // Get all unique tags
    const allTags = useMemo(() => {
        const tags = new Set<string>();
        documents.forEach((doc) => {
            if (doc.tags) {
                doc.tags.forEach((tag) => tags.add(tag));
            }
        });
        return Array.from(tags).sort();
    }, [documents]);

    // Upload PDF
    const uploadPdf = async (file: globalThis.File) => {
        if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
            setUploadError("Lütfen bir PDF dosyası seçin.");
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            setUploadError("Dosya boyutu 50MB'dan büyük olamaz.");
            return;
        }

        setUploading(true);
        setUploadError("");
        setUploadProgress("Dosya yükleniyor...");

        try {
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (!user) {
                setUploadError("Giriş yapmanız gerekiyor.");
                setUploading(false);
                return;
            }

            // Upload file to Supabase Storage
            const fileName = `${user.id}/${Date.now()}_${file.name}`;
            setUploadProgress("Dosya sunucuya yükleniyor...");

            const { error: uploadError } = await supabase.storage
                .from("pdfs")
                .upload(fileName, file, {
                    contentType: "application/pdf",
                    upsert: false,
                });

            if (uploadError) {
                setUploadError("Dosya yüklenirken bir hata oluştu: " + uploadError.message);
                setUploading(false);
                return;
            }

            // Get public URL
            const { data: urlData } = supabase.storage
                .from("pdfs")
                .getPublicUrl(fileName);

            // Save document metadata
            setUploadProgress("Döküman kaydediliyor...");
            const title = file.name.replace(/\.pdf$/i, "");

            const { data: newDoc, error: insertError } = await supabase
                .from("pdf_documents")
                .insert({
                    user_id: user.id,
                    title: title,
                    file_name: file.name,
                    file_url: urlData.publicUrl,
                    file_size: file.size,
                    page_count: 0,
                    is_favorite: false,
                    is_archived: false,
                    last_page: 1,
                    tags: [],
                })
                .select()
                .single();

            if (insertError || !newDoc) {
                setUploadError("Döküman kaydedilirken bir hata oluştu.");
                setUploading(false);
                return;
            }

            setDialogOpen(false);
            setUploading(false);
            setUploadProgress("");
            fetchDocuments();
            router.push(`/pdf/${newDoc.id}`);
        } catch (err) {
            setUploadError(
                err instanceof Error ? err.message : "Bir hata oluştu."
            );
            setUploading(false);
            setUploadProgress("");
        }
    };

    // File input handler
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) uploadPdf(file);
    };

    // Drag & Drop handlers
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file) uploadPdf(file);
    };

    // CRUD operations
    const toggleFavorite = useCallback(
        async (doc: PdfDocument) => {
            setDocuments((prev) =>
                prev.map((d) =>
                    d.id === doc.id
                        ? { ...d, is_favorite: !d.is_favorite }
                        : d
                )
            );
            await supabase
                .from("pdf_documents")
                .update({ is_favorite: !doc.is_favorite })
                .eq("id", doc.id);
        },
        [supabase]
    );

    const toggleArchive = useCallback(
        async (doc: PdfDocument) => {
            setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
            await supabase
                .from("pdf_documents")
                .update({ is_archived: !doc.is_archived })
                .eq("id", doc.id);
        },
        [supabase]
    );

    const deleteDocument = useCallback(
        async (doc: PdfDocument) => {
            if (
                !confirm(
                    "Bu dökümanı ve tüm notlarını kalıcı olarak silmek istediğine emin misin?"
                )
            )
                return;

            setDocuments((prev) => prev.filter((d) => d.id !== doc.id));

            // Delete file from storage
            const filePath = doc.file_url.split("/pdfs/")[1];
            if (filePath) {
                await supabase.storage.from("pdfs").remove([decodeURIComponent(filePath)]);
            }

            // Delete notes
            await supabase
                .from("pdf_notes")
                .delete()
                .eq("pdf_ref_id", doc.id);

            // Delete document
            await supabase.from("pdf_documents").delete().eq("id", doc.id);
        },
        [supabase]
    );

    const updateTitle = useCallback(
        async (id: string, title: string) => {
            setDocuments((prev) =>
                prev.map((d) => (d.id === id ? { ...d, title } : d))
            );
            await supabase
                .from("pdf_documents")
                .update({ title })
                .eq("id", id);
        },
        [supabase]
    );

    // Filtering
    const filteredDocuments = useMemo(() => {
        let docs = documents;

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            docs = docs.filter(
                (d) =>
                    d.title.toLowerCase().includes(q) ||
                    d.file_name.toLowerCase().includes(q) ||
                    d.tags?.some((t) => t.toLowerCase().includes(q))
            );
        }

        if (tagFilter) {
            docs = docs.filter((d) => d.tags?.includes(tagFilter));
        }

        return docs;
    }, [documents, searchQuery, tagFilter]);

    const favoriteDocuments = filteredDocuments.filter((d) => d.is_favorite);
    const regularDocuments = filteredDocuments.filter((d) => !d.is_favorite);

    return (
        <div className="p-6 md:p-10 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div>
                    <div className="flex items-center gap-2.5 mb-1">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <FileBox className="h-5 w-5 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            PDF Dökümanlar
                        </h1>
                    </div>
                    <p className="text-muted-foreground ml-[3px]">
                        {showArchived
                            ? "Arşivlenmiş dökümanlar"
                            : "PDF'lerini yükle, görüntüle ve notlarınla ilişkilendir."}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* View Mode Toggle */}
                    <div className="flex items-center border border-border/50 rounded-lg overflow-hidden">
                        <button
                            onClick={() => setViewMode("grid")}
                            className={`p-2 transition-colors ${viewMode === "grid"
                                ? "bg-accent text-foreground"
                                : "text-muted-foreground hover:bg-accent/50"
                                }`}
                        >
                            <Grid3X3 className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setViewMode("list")}
                            className={`p-2 transition-colors ${viewMode === "list"
                                ? "bg-accent text-foreground"
                                : "text-muted-foreground hover:bg-accent/50"
                                }`}
                        >
                            <List className="h-4 w-4" />
                        </button>
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowArchived(!showArchived)}
                        className="text-sm"
                    >
                        {showArchived ? (
                            <>
                                <ArchiveRestore className="mr-1.5 h-4 w-4" />
                                Aktif Dökümanlar
                            </>
                        ) : (
                            <>
                                <Archive className="mr-1.5 h-4 w-4" />
                                Arşiv
                            </>
                        )}
                    </Button>

                    <Dialog
                        open={dialogOpen}
                        onOpenChange={(open) => {
                            setDialogOpen(open);
                            if (!open) {
                                setUploadError("");
                                setUploadProgress("");
                            }
                        }}
                    >
                        <DialogTrigger asChild>
                            <Button className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white shadow-lg shadow-blue-500/25">
                                <PlusCircle className="mr-1.5 h-4 w-4" />
                                PDF Yükle
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>PDF Yükle</DialogTitle>
                                <DialogDescription>
                                    PDF dosyanızı sürükleyip bırakın veya
                                    seçin.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 mt-2">
                                {/* Drag & Drop Area */}
                                <div
                                    onDragEnter={handleDrag}
                                    onDragLeave={handleDrag}
                                    onDragOver={handleDrag}
                                    onDrop={handleDrop}
                                    onClick={() =>
                                        fileInputRef.current?.click()
                                    }
                                    className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${dragActive
                                        ? "border-blue-500 bg-blue-500/5 scale-[1.02]"
                                        : "border-border/50 hover:border-blue-400/50 hover:bg-accent/30"
                                        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".pdf"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                    <div className="flex flex-col items-center gap-3">
                                        <div
                                            className={`h-14 w-14 rounded-2xl flex items-center justify-center transition-colors ${dragActive
                                                ? "bg-blue-500/20"
                                                : "bg-blue-500/10"
                                                }`}
                                        >
                                            <Upload
                                                className={`h-7 w-7 transition-colors ${dragActive
                                                    ? "text-blue-400"
                                                    : "text-blue-500/60"
                                                    }`}
                                            />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">
                                                {dragActive
                                                    ? "Dosyayı bırakın"
                                                    : "PDF dosyası seçin veya sürükleyin"}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Maksimum 50MB
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {uploadError && (
                                    <div className="flex items-start gap-2 text-sm text-destructive">
                                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                        <span>{uploadError}</span>
                                    </div>
                                )}
                                {uploadProgress && (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                                        <span>{uploadProgress}</span>
                                    </div>
                                )}
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Search & Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Dökümanlarda ara..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-11 bg-card/50 border-border/50"
                    />
                </div>
            </div>

            {/* Tags */}
            {allTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                    {tagFilter && (
                        <button
                            onClick={() => setTagFilter(null)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                        >
                            <X className="h-3 w-3" />
                            Filtreyi Kaldır
                        </button>
                    )}
                    {allTags.map((tag) => (
                        <button
                            key={tag}
                            onClick={() =>
                                setTagFilter(tagFilter === tag ? null : tag)
                            }
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tagFilter === tag
                                ? "bg-blue-500 text-white"
                                : "bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground"
                                }`}
                        >
                            <Tag className="h-3 w-3" />
                            {tag}
                        </button>
                    ))}
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            )}

            {/* Empty State */}
            {!loading && filteredDocuments.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
                        <FileBox className="h-8 w-8 text-blue-500" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">
                        {searchQuery || tagFilter
                            ? "Sonuç bulunamadı"
                            : showArchived
                                ? "Arşivde döküman yok"
                                : "Henüz döküman yok"}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                        {searchQuery || tagFilter
                            ? "Farklı bir arama terimi deneyin"
                            : "PDF dosyalarını yükleyerek dökümanlarını organize etmeye başla"}
                    </p>
                    {!searchQuery && !tagFilter && !showArchived && (
                        <Button
                            onClick={() => setDialogOpen(true)}
                            className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white"
                        >
                            <PlusCircle className="mr-1.5 h-4 w-4" />
                            İlk PDF&apos;ini Yükle
                        </Button>
                    )}
                </div>
            )}

            {/* Favorites Section */}
            {!loading && favoriteDocuments.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                        <Star className="h-3.5 w-3.5 text-amber-500" />
                        Favoriler
                    </h2>
                    {viewMode === "grid" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {favoriteDocuments.map((doc) => (
                                <PdfGridCard
                                    key={doc.id}
                                    doc={doc}
                                    noteCount={noteStats[doc.id] || 0}
                                    onOpen={() => router.push(`/pdf/${doc.id}`)}
                                    onToggleFavorite={() =>
                                        toggleFavorite(doc)
                                    }
                                    onToggleArchive={() =>
                                        toggleArchive(doc)
                                    }
                                    onDelete={() => deleteDocument(doc)}
                                    onUpdateTitle={(title) =>
                                        updateTitle(doc.id, title)
                                    }
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {favoriteDocuments.map((doc) => (
                                <PdfListCard
                                    key={doc.id}
                                    doc={doc}
                                    noteCount={noteStats[doc.id] || 0}
                                    onOpen={() => router.push(`/pdf/${doc.id}`)}
                                    onToggleFavorite={() =>
                                        toggleFavorite(doc)
                                    }
                                    onToggleArchive={() =>
                                        toggleArchive(doc)
                                    }
                                    onDelete={() => deleteDocument(doc)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Regular Documents */}
            {!loading && regularDocuments.length > 0 && (
                <div>
                    {favoriteDocuments.length > 0 && (
                        <h2 className="text-sm font-medium text-muted-foreground mb-3">
                            Tüm Dökümanlar
                        </h2>
                    )}
                    {viewMode === "grid" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {regularDocuments.map((doc) => (
                                <PdfGridCard
                                    key={doc.id}
                                    doc={doc}
                                    noteCount={noteStats[doc.id] || 0}
                                    onOpen={() => router.push(`/pdf/${doc.id}`)}
                                    onToggleFavorite={() =>
                                        toggleFavorite(doc)
                                    }
                                    onToggleArchive={() =>
                                        toggleArchive(doc)
                                    }
                                    onDelete={() => deleteDocument(doc)}
                                    onUpdateTitle={(title) =>
                                        updateTitle(doc.id, title)
                                    }
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {regularDocuments.map((doc) => (
                                <PdfListCard
                                    key={doc.id}
                                    doc={doc}
                                    noteCount={noteStats[doc.id] || 0}
                                    onOpen={() => router.push(`/pdf/${doc.id}`)}
                                    onToggleFavorite={() =>
                                        toggleFavorite(doc)
                                    }
                                    onToggleArchive={() =>
                                        toggleArchive(doc)
                                    }
                                    onDelete={() => deleteDocument(doc)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================
// Grid Card Component
// ============================================
function PdfGridCard({
    doc,
    noteCount,
    onOpen,
    onToggleFavorite,
    onToggleArchive,
    onDelete,
    onUpdateTitle,
}: {
    doc: PdfDocument;
    noteCount: number;
    onOpen: () => void;
    onToggleFavorite: () => void;
    onToggleArchive: () => void;
    onDelete: () => void;
    onUpdateTitle: (title: string) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(doc.title);

    const handleSaveTitle = () => {
        if (editTitle.trim() && editTitle.trim() !== doc.title) {
            onUpdateTitle(editTitle.trim());
        } else {
            setEditTitle(doc.title);
        }
        setEditing(false);
    };

    return (
        <div
            onClick={onOpen}
            className="group relative cursor-pointer rounded-xl border border-border/50 bg-card overflow-hidden transition-all duration-200 hover:border-border hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-0.5"
        >
            {/* PDF Preview Header */}
            <div className="relative h-36 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 flex items-center justify-center overflow-hidden">
                <div className="flex flex-col items-center gap-2">
                    <div className="h-16 w-14 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20 flex items-center justify-center backdrop-blur-sm">
                        <FileText className="h-7 w-7 text-blue-400/80" />
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider">
                        PDF
                    </span>
                </div>

                {/* File size badge */}
                <div className="absolute bottom-2 right-2 bg-black/50 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-md">
                    {formatFileSize(doc.file_size)}
                </div>

                {/* Page count */}
                {doc.page_count > 0 && (
                    <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1">
                        <File className="h-2.5 w-2.5" />
                        {doc.page_count} sayfa
                    </div>
                )}

                {/* Reading progress */}
                {doc.page_count > 0 && doc.last_page > 1 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500"
                            style={{
                                width: `${Math.min(
                                    (doc.last_page / doc.page_count) * 100,
                                    100
                                )}%`,
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                    {editing ? (
                        <input
                            autoFocus
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onBlur={handleSaveTitle}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveTitle();
                                if (e.key === "Escape") {
                                    setEditTitle(doc.title);
                                    setEditing(false);
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="font-semibold text-sm bg-transparent border-b border-blue-500 outline-none w-full"
                        />
                    ) : (
                        <h3
                            className="font-semibold line-clamp-2 text-sm leading-tight"
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                setEditing(true);
                            }}
                        >
                            {doc.title}
                        </h3>
                    )}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavorite();
                            }}
                            className="p-1 rounded-md hover:bg-accent transition-colors opacity-0 group-hover:opacity-100"
                        >
                            {doc.is_favorite ? (
                                <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                            ) : (
                                <StarOff className="h-4 w-4 text-muted-foreground" />
                            )}
                        </button>
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                asChild
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button className="p-1 rounded-md hover:bg-accent transition-colors opacity-0 group-hover:opacity-100">
                                    <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="w-48"
                            >
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditing(true);
                                    }}
                                >
                                    <FileText className="mr-2 h-4 w-4" />
                                    Yeniden Adlandır
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleArchive();
                                    }}
                                >
                                    {doc.is_archived ? (
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
                                <DropdownMenuSeparator />
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

                {/* Tags */}
                {doc.tags && doc.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                        {doc.tags.map((tag) => (
                            <span
                                key={tag}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                        {noteCount > 0 && (
                            <span className="flex items-center gap-1 text-blue-400">
                                <StickyNote className="h-3 w-3" />
                                {noteCount} not
                            </span>
                        )}
                    </div>
                    <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(doc.created_at)}
                    </span>
                </div>
            </div>
        </div>
    );
}

// ============================================
// List Card Component
// ============================================
function PdfListCard({
    doc,
    noteCount,
    onOpen,
    onToggleFavorite,
    onToggleArchive,
    onDelete,
}: {
    doc: PdfDocument;
    noteCount: number;
    onOpen: () => void;
    onToggleFavorite: () => void;
    onToggleArchive: () => void;
    onDelete: () => void;
}) {
    return (
        <div
            onClick={onOpen}
            className="group cursor-pointer rounded-xl border border-border/50 bg-card p-4 transition-all duration-200 hover:border-border hover:shadow-md hover:shadow-blue-500/5 flex items-center gap-4"
        >
            {/* Icon */}
            <div className="flex-shrink-0 h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-blue-400/80" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate">{doc.title}</h3>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span>{formatFileSize(doc.file_size)}</span>
                    {doc.page_count > 0 && (
                        <span>{doc.page_count} sayfa</span>
                    )}
                    {noteCount > 0 && (
                        <span className="text-blue-400">
                            {noteCount} not
                        </span>
                    )}
                    {doc.tags && doc.tags.length > 0 && (
                        <div className="flex gap-1">
                            {doc.tags.slice(0, 2).map((tag) => (
                                <span
                                    key={tag}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400"
                                >
                                    {tag}
                                </span>
                            ))}
                            {doc.tags.length > 2 && (
                                <span className="text-muted-foreground">
                                    +{doc.tags.length - 2}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Meta */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                <span className="hidden sm:inline">
                    {formatDateTime(doc.updated_at)}
                </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite();
                    }}
                    className="p-1.5 rounded-md hover:bg-accent transition-colors"
                >
                    {doc.is_favorite ? (
                        <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                    ) : (
                        <StarOff className="h-4 w-4 text-muted-foreground" />
                    )}
                </button>
                <DropdownMenu>
                    <DropdownMenuTrigger
                        asChild
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button className="p-1.5 rounded-md hover:bg-accent transition-colors">
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
                            {doc.is_archived ? (
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
                        <DropdownMenuSeparator />
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
    );
}
