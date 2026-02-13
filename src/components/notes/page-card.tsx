"use client";

import { Page } from "@/lib/supabase/types";
import { Star, StarOff, MoreHorizontal, Archive, ArchiveRestore, Trash2, Clock } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PageCardProps {
    page: Page;
    onOpen: () => void;
    onToggleFavorite: () => void;
    onToggleArchive: () => void;
    onDelete: () => void;
    formatDate: (d: string) => string;
    className?: string;
    style?: React.CSSProperties;
}

export function PageCard({
    page,
    onOpen,
    onToggleFavorite,
    onToggleArchive,
    onDelete,
    formatDate,
    className,
    style,
}: PageCardProps) {
    return (
        <div
            onClick={onOpen}
            style={style}
            className={`group relative cursor-pointer rounded-xl border border-border/50 bg-card p-4 transition-all duration-200 hover:border-border hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 ${className}`}
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
