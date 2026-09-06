/**
 * Cloudflare Worker girisi.
 * - /ws/study-room  -> oturumu dogrular, Study Room Durable Object'ine WebSocket olarak yonlendirir
 * - diger her sey    -> OpenNext tarafindan uretilen Next.js handler'i
 */
// @ts-expect-error `.open-next/worker.js` build sirasinda uretilir
import { default as nextHandler } from "./.open-next/worker.js";
import { and, eq, or } from "drizzle-orm";
import { createDb, schema } from "./src/db";
import { SESSION_COOKIE, parseCookieHeader, resolveSessionUser } from "./src/lib/auth/session-core";
import { StudyRoom, type StudyRoomIdentity } from "./src/durable-objects/study-room";

export { StudyRoom };

// OpenNext'in uretebilecegi DO siniflari (kullanilmasa da export edilmeli)
// @ts-expect-error build sirasinda uretilir
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

async function handleStudyRoomSocket(request: Request, env: CloudflareEnv): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("WebSocket bekleniyor", { status: 426 });
    }

    const cookies = parseCookieHeader(request.headers.get("Cookie"));
    const db = createDb(env.DB);
    const user = await resolveSessionUser(db, cookies[SESSION_COOKIE]);
    if (!user) {
        return new Response("Yetkisiz", { status: 401 });
    }

    const profile = await db.query.profiles.findFirst({
        where: eq(schema.profiles.user_id, user.id),
    });
    if (!profile) {
        return new Response("Profil gerekli", { status: 403 });
    }

    const friendRows = await db
        .select({ requester_id: schema.friendships.requester_id, addressee_id: schema.friendships.addressee_id })
        .from(schema.friendships)
        .where(
            and(
                eq(schema.friendships.status, "accepted"),
                or(eq(schema.friendships.requester_id, user.id), eq(schema.friendships.addressee_id, user.id)),
            ),
        );
    const friendIds = friendRows.map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id));

    const identity: StudyRoomIdentity = {
        userId: user.id,
        username: profile.username,
        displayName: profile.display_name,
        friendIds,
    };

    const stub = env.STUDY_ROOM.get(env.STUDY_ROOM.idFromName("global"));
    const headers = new Headers(request.headers);
    headers.set("X-Study-Room-Identity", JSON.stringify(identity));
    return stub.fetch(new Request(request.url, { headers }));
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === "/ws/study-room") {
            return handleStudyRoomSocket(request, env);
        }
        return nextHandler.fetch(request, env, ctx);
    },
} satisfies ExportedHandler<CloudflareEnv>;
