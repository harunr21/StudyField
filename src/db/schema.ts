import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
    created_at: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updated_at: text("updated_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
};

export const users = sqliteTable("users", {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    password_hash: text("password_hash").notNull(),
    ...timestamps,
});

export const sessions = sqliteTable(
    "sessions",
    {
        id: text("id").primaryKey(), // sha256(token)
        user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        expires_at: text("expires_at").notNull(),
        created_at: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    },
    (t) => [index("idx_sessions_user").on(t.user_id)],
);

export const profiles = sqliteTable(
    "profiles",
    {
        user_id: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
        username: text("username").notNull().unique(),
        display_name: text("display_name").notNull().default(""),
        ...timestamps,
    },
);

export const friendships = sqliteTable(
    "friendships",
    {
        id: text("id").primaryKey(),
        requester_id: text("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        addressee_id: text("addressee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        status: text("status", { enum: ["pending", "accepted"] }).notNull().default("pending"),
        ...timestamps,
    },
    (t) => [
        index("idx_friendships_requester").on(t.requester_id),
        index("idx_friendships_addressee").on(t.addressee_id),
    ],
);

export const youtubePlaylists = sqliteTable(
    "youtube_playlists",
    {
        id: text("id").primaryKey(),
        user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        playlist_id: text("playlist_id").notNull(),
        title: text("title").notNull(),
        description: text("description").notNull().default(""),
        thumbnail_url: text("thumbnail_url").notNull().default(""),
        channel_title: text("channel_title").notNull().default(""),
        video_count: integer("video_count").notNull().default(0),
        is_shared: integer("is_shared", { mode: "boolean" }).notNull().default(true),
        tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
        ...timestamps,
    },
    (t) => [
        index("idx_youtube_playlists_user").on(t.user_id),
        uniqueIndex("uq_youtube_playlists_user_playlist").on(t.user_id, t.playlist_id),
    ],
);

export const youtubeVideos = sqliteTable(
    "youtube_videos",
    {
        id: text("id").primaryKey(),
        user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        playlist_ref_id: text("playlist_ref_id")
            .notNull()
            .references(() => youtubePlaylists.id, { onDelete: "cascade" }),
        video_id: text("video_id").notNull(),
        title: text("title").notNull(),
        description: text("description").notNull().default(""),
        thumbnail_url: text("thumbnail_url").notNull().default(""),
        channel_title: text("channel_title").notNull().default(""),
        duration: text("duration").notNull().default(""),
        position: integer("position").notNull().default(0),
        is_watched: integer("is_watched", { mode: "boolean" }).notNull().default(false),
        watched_at: text("watched_at"),
        ...timestamps,
    },
    (t) => [
        index("idx_youtube_videos_user").on(t.user_id),
        index("idx_youtube_videos_playlist").on(t.playlist_ref_id),
        uniqueIndex("uq_youtube_videos_user_playlist_video").on(t.user_id, t.playlist_ref_id, t.video_id),
    ],
);

export const youtubeVideoNotes = sqliteTable(
    "youtube_video_notes",
    {
        id: text("id").primaryKey(),
        user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        video_ref_id: text("video_ref_id")
            .notNull()
            .references(() => youtubeVideos.id, { onDelete: "cascade" }),
        timestamp_seconds: integer("timestamp_seconds").notNull().default(0),
        content: text("content").notNull().default(""),
        ...timestamps,
    },
    (t) => [
        index("idx_youtube_video_notes_video").on(t.video_ref_id),
        index("idx_youtube_video_notes_user").on(t.user_id),
    ],
);
