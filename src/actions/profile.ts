"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/context";
import { schema } from "@/db";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { USERNAME_REGEX, type Profile } from "@/lib/types";

export async function getMyProfile(): Promise<{ email: string; profile: Profile | null } | null> {
    const user = await getCurrentUser();
    if (!user) return null;
    const db = getDb();
    const profile = await db.query.profiles.findFirst({ where: eq(schema.profiles.user_id, user.id) });
    return { email: user.email, profile: profile ?? null };
}

export async function saveMyProfile(
    usernameInput: string,
    displayNameInput: string,
): Promise<{ profile?: Profile; error?: string }> {
    const user = await requireUser();
    const username = usernameInput.trim().toLowerCase();
    const display_name = displayNameInput.trim();

    if (!USERNAME_REGEX.test(username)) {
        return { error: "Kullanıcı adı 3-30 karakter olmalı, sadece küçük harf, rakam ve _ içerebilir." };
    }
    if (display_name.length > 60) {
        return { error: "Görünen ad en fazla 60 karakter olabilir." };
    }

    const db = getDb();
    const taken = await db.query.profiles.findFirst({ where: eq(schema.profiles.username, username) });
    if (taken && taken.user_id !== user.id) {
        return { error: "Bu kullanıcı adı zaten alınmış." };
    }

    const now = new Date().toISOString();
    await db
        .insert(schema.profiles)
        .values({ user_id: user.id, username, display_name })
        .onConflictDoUpdate({
            target: schema.profiles.user_id,
            set: { username, display_name, updated_at: now },
        });

    const profile = await db.query.profiles.findFirst({ where: eq(schema.profiles.user_id, user.id) });
    return { profile: profile ?? undefined };
}

export async function getProfileByUsername(username: string): Promise<Profile | null> {
    await requireUser();
    const db = getDb();
    const profile = await db.query.profiles.findFirst({
        where: eq(schema.profiles.username, username.trim().toLowerCase()),
    });
    return profile ?? null;
}
