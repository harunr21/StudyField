import { DurableObject } from "cloudflare:workers";

/**
 * Study Room: arkadaslarin su an hangi videoyu izledigini gosteren canli varlik (presence) odasi.
 * Tek bir global oda vardir; her WebSocket baglantisi kullanici bilgisini attachment olarak tasir.
 * Hibernation API kullanilir: bellekte durum tutulmaz, her sey attachment'lardan turetilir.
 */

export interface StudyRoomIdentity {
    userId: string;
    username: string;
    displayName: string;
    /** Kabul edilmis arkadaslarin kullanici id'leri; sadece bunlarin varligi gosterilir. */
    friendIds: string[];
}

export interface StudyRoomPresence {
    userId: string;
    username: string;
    displayName: string;
    videoDbId: string;
    videoTitle: string;
    joinedAt: string;
}

interface Attachment extends StudyRoomIdentity {
    videoDbId: string;
    videoTitle: string;
    joinedAt: string;
}

type ClientMessage = { type: "track"; videoDbId: string; videoTitle: string } | { type: "ping" };

export class StudyRoom extends DurableObject<CloudflareEnv> {
    async fetch(request: Request): Promise<Response> {
        if (request.headers.get("Upgrade") !== "websocket") {
            return new Response("WebSocket bekleniyor", { status: 426 });
        }

        const identityHeader = request.headers.get("X-Study-Room-Identity");
        if (!identityHeader) {
            return new Response("Kimlik yok", { status: 401 });
        }
        const identity = JSON.parse(identityHeader) as StudyRoomIdentity;

        const pair = new WebSocketPair();
        const [client, server] = [pair[0], pair[1]];

        const attachment: Attachment = {
            ...identity,
            videoDbId: "",
            videoTitle: "",
            joinedAt: new Date().toISOString(),
        };
        server.serializeAttachment(attachment);

        // Ayni kullanicinin eski baglantilarini kapat (sekme degisimi vb.)
        for (const ws of this.ctx.getWebSockets(`user:${identity.userId}`)) {
            try {
                ws.close(4000, "replaced");
            } catch {
                // yoksay
            }
        }

        this.ctx.acceptWebSocket(server, [`user:${identity.userId}`]);
        this.broadcast();

        return new Response(null, { status: 101, webSocket: client });
    }

    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
        if (typeof message !== "string") return;
        let parsed: ClientMessage;
        try {
            parsed = JSON.parse(message) as ClientMessage;
        } catch {
            return;
        }

        if (parsed.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
            return;
        }

        if (parsed.type === "track") {
            const current = ws.deserializeAttachment() as Attachment;
            const next: Attachment = {
                ...current,
                videoDbId: String(parsed.videoDbId ?? "").slice(0, 100),
                videoTitle: String(parsed.videoTitle ?? "").slice(0, 300),
            };
            ws.serializeAttachment(next);
            this.broadcast();
        }
    }

    async webSocketClose(ws: WebSocket): Promise<void> {
        try {
            ws.close();
        } catch {
            // zaten kapali
        }
        this.broadcast();
    }

    async webSocketError(ws: WebSocket): Promise<void> {
        try {
            ws.close(1011, "error");
        } catch {
            // yoksay
        }
        this.broadcast();
    }

    /** Her baglantiya yalnizca kendi arkadaslarinin varligini gonderir. */
    private broadcast(): void {
        const sockets = this.ctx.getWebSockets();
        const entries: Array<{ ws: WebSocket; att: Attachment }> = [];
        for (const ws of sockets) {
            try {
                entries.push({ ws, att: ws.deserializeAttachment() as Attachment });
            } catch {
                // bozuk attachment
            }
        }

        for (const { ws, att } of entries) {
            const friendSet = new Set(att.friendIds);
            const peers: StudyRoomPresence[] = [];
            for (const other of entries) {
                if (other.att.userId === att.userId) continue;
                if (!friendSet.has(other.att.userId)) continue;
                if (!other.att.videoDbId) continue;
                peers.push({
                    userId: other.att.userId,
                    username: other.att.username,
                    displayName: other.att.displayName,
                    videoDbId: other.att.videoDbId,
                    videoTitle: other.att.videoTitle,
                    joinedAt: other.att.joinedAt,
                });
            }
            try {
                ws.send(JSON.stringify({ type: "presence", peers }));
            } catch {
                // baglanti kapanmis olabilir
            }
        }
    }
}
