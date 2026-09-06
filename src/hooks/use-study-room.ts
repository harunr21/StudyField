"use client";

import { useEffect, useRef, useState } from "react";

export interface StudyRoomPresence {
    userId: string;
    username: string;
    displayName: string;
    videoDbId: string;
    videoTitle: string;
    joinedAt: string;
}

/**
 * Study Room canli varlik hook'u. Worker uzerindeki /ws/study-room adresine WebSocket acar;
 * sunucu (Durable Object) yalnizca kabul edilmis arkadaslarin varligini gonderir.
 */
export function useStudyRoom(params: {
    enabled: boolean;
    videoDbId: string;
    videoTitle: string;
}): { peers: StudyRoomPresence[]; isTracking: boolean } {
    const { enabled, videoDbId, videoTitle } = params;

    const [peers, setPeers] = useState<StudyRoomPresence[]>([]);
    const [isTracking, setIsTracking] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);
    const latestVideoRef = useRef({ videoDbId, videoTitle });

    useEffect(() => {
        latestVideoRef.current = { videoDbId, videoTitle };
        const ws = socketRef.current;
        if (ws && ws.readyState === WebSocket.OPEN && videoDbId) {
            ws.send(JSON.stringify({ type: "track", videoDbId, videoTitle }));
        }
    }, [videoDbId, videoTitle]);

    useEffect(() => {
        if (!enabled) return;

        let disposed = false;
        let retryDelay = 1000;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let pingTimer: ReturnType<typeof setInterval> | null = null;

        const connect = () => {
            if (disposed) return;
            const protocol = window.location.protocol === "https:" ? "wss" : "ws";
            const ws = new WebSocket(`${protocol}://${window.location.host}/ws/study-room`);
            socketRef.current = ws;

            ws.onopen = () => {
                retryDelay = 1000;
                setIsTracking(true);
                const { videoDbId: v, videoTitle: t } = latestVideoRef.current;
                if (v) ws.send(JSON.stringify({ type: "track", videoDbId: v, videoTitle: t }));
                pingTimer = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
                }, 25_000);
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(String(event.data)) as { type: string; peers?: StudyRoomPresence[] };
                    if (msg.type === "presence" && Array.isArray(msg.peers)) {
                        setPeers(msg.peers);
                    }
                } catch {
                    // bozuk mesaj
                }
            };

            ws.onclose = (event) => {
                setIsTracking(false);
                setPeers([]);
                if (pingTimer) clearInterval(pingTimer);
                pingTimer = null;
                // 4000 = ayni kullanici baska sekmeden baglandi; yeniden baglanma.
                if (disposed || event.code === 4000 || event.code === 4001) return;
                reconnectTimer = setTimeout(connect, retryDelay);
                retryDelay = Math.min(retryDelay * 2, 30_000);
            };

            ws.onerror = () => {
                // onclose tetiklenir
            };
        };

        connect();

        return () => {
            disposed = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (pingTimer) clearInterval(pingTimer);
            const ws = socketRef.current;
            socketRef.current = null;
            if (ws) {
                try {
                    ws.close(1000, "leave");
                } catch {
                    // yoksay
                }
            }
            setIsTracking(false);
            setPeers([]);
        };
    }, [enabled]);

    return { peers, isTracking };
}
