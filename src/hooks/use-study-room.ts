"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface StudyRoomPresence {
    userId: string;
    username: string;
    displayName: string;
    videoDbId: string;
    videoTitle: string;
    joinedAt: string;
}

export function useStudyRoom(params: {
    userId: string | null;
    username: string | null;
    displayName: string | null;
    videoDbId: string;
    videoTitle: string;
    acceptedFriendIds: string[];
}): { peers: StudyRoomPresence[]; isTracking: boolean } {
    const { userId, username, displayName, videoDbId, videoTitle, acceptedFriendIds } = params;

    const supabase = useMemo(() => createClient(), []);
    const [peers, setPeers] = useState<StudyRoomPresence[]>([]);
    const [isTracking, setIsTracking] = useState(false);

    // friendIds ref — presence sync callback'inde güncel listeyi okur,
    // ref değişince kanal yeniden kurulmaz
    const friendIdsRef = useRef(acceptedFriendIds);
    useEffect(() => {
        friendIdsRef.current = acceptedFriendIds;
    }, [acceptedFriendIds]);

    useEffect(() => {
        if (!userId || !username || !videoDbId) return;

        const channel = supabase.channel("study-room", {
            config: { presence: { key: userId } },
        });

        channel
            .on("presence", { event: "sync" }, () => {
                const state = channel.presenceState<StudyRoomPresence>();
                const activePeers: StudyRoomPresence[] = [];
                for (const [key, presences] of Object.entries(state)) {
                    if (key === userId) continue;
                    if (!friendIdsRef.current.includes(key)) continue;
                    const p = presences[0];
                    if (p) activePeers.push(p as StudyRoomPresence);
                }
                setPeers(activePeers);
            })
            .subscribe(async (status) => {
                if (status === "SUBSCRIBED") {
                    await channel.track({
                        userId,
                        username,
                        displayName: displayName ?? username,
                        videoDbId,
                        videoTitle,
                        joinedAt: new Date().toISOString(),
                    });
                    setIsTracking(true);
                }
            });

        return () => {
            channel.untrack().catch(() => {});
            supabase.removeChannel(channel);
            setIsTracking(false);
            setPeers([]);
        };
        // videoDbId bağımlılığı: video değişince yeni kanal kur ve yeni videoyu track et
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, videoDbId, supabase]);

    return { peers, isTracking };
}
