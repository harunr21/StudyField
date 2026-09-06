import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { getDb } from "@/db/context";
import {
    SESSION_COOKIE,
    createSessionRecord,
    deleteSessionRecord,
    resolveSessionUser,
    type SessionUser,
} from "./session-core";

export type { SessionUser };

/** Istek basina bir kez cozumlenir (React cache). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    return resolveSessionUser(getDb(), token);
});

export async function requireUser(): Promise<SessionUser> {
    const user = await getCurrentUser();
    if (!user) throw new Error("Giriş yapmanız gerekiyor.");
    return user;
}

export async function startSession(userId: string): Promise<void> {
    const { token, expiresAt } = await createSessionRecord(getDb(), userId);
    const store = await cookies();
    store.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
    });
}

export async function endSession(): Promise<void> {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (token) {
        await deleteSessionRecord(getDb(), token);
    }
    store.delete(SESSION_COOKIE);
}
