"use server";

import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db/context";
import { newId, schema } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { loadPlaylistStats } from "@/lib/data/access";
import {
    USERNAME_REGEX,
    type Friendship,
    type FriendshipWithProfile,
    type PlaylistWithStats,
    type Profile,
} from "@/lib/types";

async function fetchFriendshipsForUser(userId: string): Promise<FriendshipWithProfile[]> {
    const db = getDb();
    const rows = await db
        .select()
        .from(schema.friendships)
        .where(or(eq(schema.friendships.requester_id, userId), eq(schema.friendships.addressee_id, userId)));
    if (rows.length === 0) return [];

    const otherIds = rows.map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id));
    const profiles = await db.select().from(schema.profiles).where(inArray(schema.profiles.user_id, otherIds));
    const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

    const out: FriendshipWithProfile[] = [];
    for (const f of rows) {
        const otherId = f.requester_id === userId ? f.addressee_id : f.requester_id;
        const profile = profileMap.get(otherId);
        if (!profile) continue;
        out.push({ friendship: f, profile, direction: f.addressee_id === userId ? "incoming" : "outgoing" });
    }
    return out;
}

export async function listMyFriendships(): Promise<{
    currentUserId: string;
    myProfile: Profile | null;
    items: FriendshipWithProfile[];
}> {
    const user = await requireUser();
    const db = getDb();
    const myProfile = await db.query.profiles.findFirst({ where: eq(schema.profiles.user_id, user.id) });
    const items = await fetchFriendshipsForUser(user.id);
    return { currentUserId: user.id, myProfile: myProfile ?? null, items };
}

async function getFriendshipBetween(a: string, b: string): Promise<Friendship | null> {
    const db = getDb();
    const row = await db.query.friendships.findFirst({
        where: or(
            and(eq(schema.friendships.requester_id, a), eq(schema.friendships.addressee_id, b)),
            and(eq(schema.friendships.requester_id, b), eq(schema.friendships.addressee_id, a)),
        ),
    });
    return row ?? null;
}

export async function sendFriendRequestByUsername(
    usernameInput: string,
): Promise<{ error?: string; info?: string }> {
    const user = await requireUser();
    const db = getDb();

    const myProfile = await db.query.profiles.findFirst({ where: eq(schema.profiles.user_id, user.id) });
    if (!myProfile) return { error: "Önce kendi profilini oluşturmalısın." };

    const normalized = usernameInput.trim().toLowerCase();
    if (!USERNAME_REGEX.test(normalized)) {
        return { error: "Geçerli bir kullanıcı adı gir (3-30 karakter, küçük harf/rakam/_)." };
    }
    if (normalized === myProfile.username) return { error: "Kendine arkadaşlık isteği gönderemezsin." };

    const target = await db.query.profiles.findFirst({ where: eq(schema.profiles.username, normalized) });
    if (!target) return { error: "Bu kullanıcı adına sahip biri yok." };

    const result = await sendFriendRequestToUser(target.user_id);
    if (result.error) return { error: result.error };
    return { info: `@${target.username} kullanıcısına istek gönderildi.` };
}

export async function sendFriendRequestToUser(targetUserId: string): Promise<{ friendship?: Friendship; error?: string }> {
    const user = await requireUser();
    if (targetUserId === user.id) return { error: "Kendine arkadaşlık isteği gönderemezsin." };
    const db = getDb();

    const existing = await getFriendshipBetween(user.id, targetUserId);
    if (existing) return { error: "Bu kişiyle zaten bir bağlantın var (bekliyor veya arkadaş)." };

    const id = newId();
    await db.insert(schema.friendships).values({
        id,
        requester_id: user.id,
        addressee_id: targetUserId,
        status: "pending",
    });
    const friendship = await db.query.friendships.findFirst({ where: eq(schema.friendships.id, id) });
    return { friendship: friendship ?? undefined };
}

export async function acceptFriendship(friendshipId: string): Promise<{ error?: string }> {
    const user = await requireUser();
    const db = getDb();
    // Sadece alici (addressee) ve sadece bekleyen istegi kabul edebilir.
    await db
        .update(schema.friendships)
        .set({ status: "accepted", updated_at: new Date().toISOString() })
        .where(
            and(
                eq(schema.friendships.id, friendshipId),
                eq(schema.friendships.addressee_id, user.id),
                eq(schema.friendships.status, "pending"),
            ),
        );
    return {};
}

export async function removeFriendship(friendshipId: string): Promise<{ error?: string }> {
    const user = await requireUser();
    const db = getDb();
    await db
        .delete(schema.friendships)
        .where(
            and(
                eq(schema.friendships.id, friendshipId),
                or(eq(schema.friendships.requester_id, user.id), eq(schema.friendships.addressee_id, user.id)),
            ),
        );
    return {};
}

export type RelationshipState =
    | { kind: "self" }
    | { kind: "none" }
    | { kind: "friends"; friendshipId: string }
    | { kind: "incoming"; friendshipId: string }
    | { kind: "outgoing"; friendshipId: string };

/** Herkese acik profil sayfasi verisi: profil, iliski durumu ve gorulebilen playlistler. */
export async function getPublicProfileView(usernameInput: string): Promise<{
    profile: Profile | null;
    relationship: RelationshipState;
    playlists: PlaylistWithStats[];
}> {
    const user = await requireUser();
    const db = getDb();
    const username = usernameInput.trim().toLowerCase();

    const profile = await db.query.profiles.findFirst({ where: eq(schema.profiles.username, username) });
    if (!profile) return { profile: null, relationship: { kind: "none" }, playlists: [] };

    let relationship: RelationshipState = { kind: "none" };
    if (profile.user_id === user.id) {
        relationship = { kind: "self" };
    } else {
        const f = await getFriendshipBetween(user.id, profile.user_id);
        if (f) {
            if (f.status === "accepted") relationship = { kind: "friends", friendshipId: f.id };
            else if (f.requester_id === user.id) relationship = { kind: "outgoing", friendshipId: f.id };
            else relationship = { kind: "incoming", friendshipId: f.id };
        }
    }

    const canSee = relationship.kind === "self" || relationship.kind === "friends";
    if (!canSee) return { profile, relationship, playlists: [] };

    const where =
        relationship.kind === "self"
            ? eq(schema.youtubePlaylists.user_id, profile.user_id)
            : and(eq(schema.youtubePlaylists.user_id, profile.user_id), eq(schema.youtubePlaylists.is_shared, true));

    const list = await db.select().from(schema.youtubePlaylists).where(where).orderBy(schema.youtubePlaylists.updated_at);
    list.reverse();
    const stats = await loadPlaylistStats(
        db,
        list.map((p) => p.id),
    );
    return {
        profile,
        relationship,
        playlists: list.map((p) => ({ ...p, stats: stats[p.id] ?? { total: 0, watched: 0, durationSeconds: 0 } })),
    };
}
