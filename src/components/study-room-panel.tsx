"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { StudyRoomPresence } from "@/hooks/use-study-room";
import { Users } from "lucide-react";

function deriveInitials(displayName: string, username: string): string {
    const name = displayName?.trim() || username;
    const parts = name.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

interface StudyRoomPanelProps {
    peers: StudyRoomPresence[];
    currentVideoDbId: string;
}

export function StudyRoomPanel({ peers, currentVideoDbId }: StudyRoomPanelProps) {
    if (peers.length === 0) return null;

    return (
        <div className="border-b border-border/30 p-4">
            <div className="flex items-center gap-2 mb-3">
                <div className="relative">
                    <Users className="h-4 w-4 text-emerald-500" />
                    <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <h3 className="font-semibold text-sm">Şu An İzleyenler</h3>
                <span className="text-xs text-muted-foreground">({peers.length})</span>
            </div>

            <div className="space-y-2">
                {peers.map((peer) => {
                    const isSameVideo = peer.videoDbId === currentVideoDbId;
                    return (
                        <div
                            key={peer.userId}
                            className="flex items-center gap-2.5"
                        >
                            <Avatar className="h-7 w-7 flex-shrink-0">
                                <AvatarFallback className="text-[10px] bg-accent">
                                    {deriveInitials(peer.displayName, peer.username)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-medium truncate">
                                        {peer.displayName?.trim() || peer.username}
                                    </span>
                                    {isSameVideo ? (
                                        <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">
                                            Seninle izliyor
                                        </span>
                                    ) : (
                                        <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400">
                                            Çalışıyor
                                        </span>
                                    )}
                                </div>
                                {!isSameVideo && peer.videoTitle && (
                                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                        {peer.videoTitle}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
