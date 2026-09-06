/**
 * Oturum yardimcilari. Hem Next sunucu kodu hem de Worker girisi (worker.ts)
 * tarafindan kullanilir; bu yuzden `next/headers` gibi Next'e ozgu import icermez.
 */
import { and, eq, gt } from "drizzle-orm";
import type { Database } from "@/db";
import { schema } from "@/db";

export const SESSION_COOKIE = "sf_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gun

export interface SessionUser {
    id: string;
    email: string;
}

function toBase64Url(bytes: Uint8Array): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateSessionToken(): string {
    return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashSessionToken(token: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

export async function createSessionRecord(db: Database, userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = generateSessionToken();
    const id = await hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.insert(schema.sessions).values({ id, user_id: userId, expires_at: expiresAt.toISOString() });
    return { token, expiresAt };
}

export async function deleteSessionRecord(db: Database, token: string): Promise<void> {
    const id = await hashSessionToken(token);
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
}

export async function resolveSessionUser(db: Database, token: string | undefined): Promise<SessionUser | null> {
    if (!token) return null;
    const id = await hashSessionToken(token);
    const rows = await db
        .select({ id: schema.users.id, email: schema.users.email })
        .from(schema.sessions)
        .innerJoin(schema.users, eq(schema.users.id, schema.sessions.user_id))
        .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expires_at, new Date().toISOString())))
        .limit(1);
    return rows[0] ?? null;
}

export function parseCookieHeader(header: string | null): Record<string, string> {
    const out: Record<string, string> = {};
    if (!header) return out;
    for (const part of header.split(";")) {
        const idx = part.indexOf("=");
        if (idx === -1) continue;
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k) out[k] = decodeURIComponent(v);
    }
    return out;
}
