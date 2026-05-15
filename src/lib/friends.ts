import type { SupabaseClient } from "@supabase/supabase-js";
import type { Friendship, Profile } from "@/lib/supabase/types";

export const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;

export interface FriendshipWithProfile {
    friendship: Friendship;
    profile: Profile;
    /** Relative to the current user: did they receive, or send, the request. */
    direction: "incoming" | "outgoing";
}

export async function getMyProfile(
    supabase: SupabaseClient,
    userId: string,
): Promise<Profile | null> {
    const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
    return (data as Profile | null) ?? null;
}

export async function getProfileByUsername(
    supabase: SupabaseClient,
    username: string,
): Promise<Profile | null> {
    const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username.toLowerCase())
        .maybeSingle();
    return (data as Profile | null) ?? null;
}

export async function fetchFriendshipsForUser(
    supabase: SupabaseClient,
    userId: string,
): Promise<FriendshipWithProfile[]> {
    const { data: friendships } = await supabase
        .from("friendships")
        .select("*")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    if (!friendships || friendships.length === 0) return [];

    const otherIds = (friendships as Friendship[]).map((f) =>
        f.requester_id === userId ? f.addressee_id : f.requester_id,
    );

    const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", otherIds);

    const profileMap = new Map<string, Profile>(
        ((profiles ?? []) as Profile[]).map((p) => [p.user_id, p]),
    );

    return (friendships as Friendship[])
        .map<FriendshipWithProfile | null>((f) => {
            const otherId = f.requester_id === userId ? f.addressee_id : f.requester_id;
            const profile = profileMap.get(otherId);
            if (!profile) return null;
            return {
                friendship: f,
                profile,
                direction: f.addressee_id === userId ? "incoming" : "outgoing",
            };
        })
        .filter((x): x is FriendshipWithProfile => x !== null);
}

/**
 * Find or describe the existing relationship between `currentUserId` and the
 * profile owner. Returns null when no row exists.
 */
export async function getFriendshipBetween(
    supabase: SupabaseClient,
    currentUserId: string,
    otherUserId: string,
): Promise<Friendship | null> {
    const { data } = await supabase
        .from("friendships")
        .select("*")
        .or(
            `and(requester_id.eq.${currentUserId},addressee_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},addressee_id.eq.${currentUserId})`,
        )
        .maybeSingle();
    return (data as Friendship | null) ?? null;
}

export function deriveInitial(profile: Pick<Profile, "display_name" | "username">): string {
    const source = profile.display_name?.trim() || profile.username;
    return source.charAt(0).toUpperCase();
}
