# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — dev server (Next 16, webpack bundler, not Turbopack)
- `npm run build` — production build (also `--webpack`)
- `npm run start` — serve the built app
- `npm run lint` — ESLint via `eslint-config-next` (core-web-vitals + typescript presets)

There is no test runner configured. There is no formatter script — lint is the only quality gate.

## Required environment

`.env.local` is gitignored and must define:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — used by both browser and server Supabase clients.
- `YOUTUBE_API_KEY` — **server-only**. Never expose this via `NEXT_PUBLIC_*`; the original client-side key was treated as a Sev-High security issue (see `performance-raporu.txt`) and the codebase was reworked so that all YouTube calls flow through `src/app/api/youtube/route.ts`.

If Supabase env vars are missing or still equal the literal placeholders, both `src/lib/supabase/client.ts` and `src/lib/supabase/server.ts` fall back to a synthetic placeholder client so builds/dev don't crash. Real auth still requires real values.

## Architecture

### Scope reality check
Despite `StudyField-Proje-Plani.txt` listing notes / PDF / global search / pomodoro / stats modules, those modules have been **removed** (see `supabase/migrations/20260226_drop_legacy_pages_pdf_ai.sql`, which drops `pages`, `pdf_documents`, `pdf_notes` and strips related settings columns). Treat that plan file as historical — current shipped surface is **YouTube workspace + tldraw whiteboard + friends/profiles**. UI strings and the schema doc are Turkish.

### Routing layout (App Router)
- `src/app/layout.tsx` — root layout, `<html lang="tr">`, `ThemeProvider` from `next-themes`, Inter font.
- `src/app/(dashboard)/layout.tsx` — wraps everything in `DashboardLayout` (sidebar + header shell).
- `src/app/(dashboard)/page.tsx` — redirects `/` → `/youtube`.
- `src/app/(dashboard)/youtube/page.tsx` — playlist list.
- `src/app/(dashboard)/youtube/[id]/page.tsx` — playlist detail; syncs videos with YouTube.
- `src/app/(dashboard)/youtube/[id]/watch/[videoId]/page.tsx` — video player + timestamped notes.
- `src/app/(dashboard)/whiteboard/page.tsx` — `Tldraw` with `persistenceKey="studyfield-whiteboard"` (local-only persistence via tldraw, not Supabase).
- `src/app/(dashboard)/profile/page.tsx` — own profile editor (username + display name; username pattern `^[a-z0-9_]{3,30}$`).
- `src/app/(dashboard)/friends/page.tsx` — incoming/outgoing requests + accepted friends + add by username.
- `src/app/(dashboard)/users/[username]/page.tsx` — public profile view; shows shared playlists with progress and a relationship-aware action (add/cancel/accept/unfriend).
- `src/app/(dashboard)/users/[username]/playlist/[playlistId]/page.tsx` — read-only view of a friend's playlist; relies on RLS, not page-level checks, for access control.
- `src/app/login/`, `src/app/auth/callback/route.ts` — Supabase email auth + OAuth code exchange.
- `src/app/api/youtube/route.ts` — the **only** path that talks to `googleapis.com/youtube/v3`. Requires a logged-in Supabase user; supports `action=config|playlistInfo|playlistVideos|videoInfo`.

### Auth and the `proxy.ts` quirk
`src/proxy.ts` contains what looks like Next.js middleware (Supabase `createServerClient`, session refresh, redirect to `/login` for unauth'd users, redirect to `/youtube` for already-logged-in users on `/login`), and exports `proxy` + `config.matcher`. Note: Next.js convention is `middleware.ts` at the project/`src` root exporting `middleware`. The current filename/export does not match that convention, so before relying on it as the auth boundary, verify whether it's actually being invoked — pages should not assume middleware-enforced auth. Each server route/page that needs auth still calls `supabase.auth.getUser()` itself (e.g. `src/app/api/youtube/route.ts:25`).

### Supabase client split
- `src/lib/supabase/client.ts` — `createBrowserClient` for Client Components.
- `src/lib/supabase/server.ts` — `createServerClient` bound to Next's `cookies()`; use in Route Handlers, Server Components, Server Actions.
- `src/lib/supabase/types.ts` — hand-written row interfaces (`YoutubePlaylist`, `YoutubeVideo`, `YoutubeVideoNote`, `UserSettings`, `StudySession`). Keep in sync manually when adding columns; there is no `supabase gen types` step wired up.

In Client Components that subscribe to Supabase realtime or re-fetch on prop change, memoize the client (`useMemo(() => createClient(), [])`) — re-creating it per render was flagged as a perf bug in `performance-raporu.txt`.

### YouTube data flow
1. Browser code imports from `src/lib/youtube.ts`, which only does `fetch("/api/youtube?action=...")`.
2. The route handler authenticates the user, then calls `src/lib/youtube-server.ts` (`import "server-only"`) which holds the actual Google API key and pagination logic (`playlistItems` paging + batched `videos?part=contentDetails` for durations).
3. Playlist sync writes/updates rows in `youtube_playlists` and `youtube_videos`. Bulk operations were called out as a perf hotspot — prefer `upsert` / `delete().in("id", [...])` over per-row round-trips when modifying many videos.

### Database
- `supabase/schema.sql` is the canonical bootstrap script (run once in the Supabase SQL editor). All tables have RLS enabled with `auth.uid() = user_id` policies and a shared `update_updated_at_column()` trigger.
- Iterative changes go into `supabase/migrations/<date>_<name>.sql` (e.g. `20260226_drop_legacy_pages_pdf_ai.sql`, `20260515_add_friends.sql`). Loose `migrate_*.sql` files at the root of `supabase/` are older one-offs — new work should go under `migrations/`. `schema.sql` is **not** kept in sync with later migrations; new installs run schema.sql + all migrations in date order.
- `study_sessions.source_type` is constrained to `'manual' | 'pomodoro' | 'youtube' | 'pdf' | 'notes'` even though `pdf` / `notes` UI is gone — leave the check constraint alone unless you also migrate existing rows.
- Realtime is enabled on the three `youtube_*` tables (plus `profiles`, `friendships` after the friends migration) via `ALTER PUBLICATION supabase_realtime ADD TABLE`.

### Friends/profile model
- `profiles(user_id PK, username UNIQUE, display_name)` — one row per user, created lazily when they first save their profile. Any authenticated user can `SELECT` (required for username search); only the owner can `INSERT/UPDATE/DELETE`.
- `friendships(requester_id, addressee_id, status)` with a single row per unordered pair (enforced by `UNIQUE INDEX ON (LEAST(...), GREATEST(...))`). `status ∈ {'pending','accepted'}`. RLS: participants can `SELECT`/`DELETE`; only the requester can `INSERT` (and only as `pending`); only the addressee can `UPDATE` (and only `pending → accepted`).
- `youtube_playlists.is_shared BOOLEAN DEFAULT TRUE` is the per-playlist opt-out from friend visibility. The SELECT policy on `youtube_playlists` and `youtube_videos` was expanded so accepted friends can read rows whose parent playlist has `is_shared = TRUE`. **Notes (`youtube_video_notes`) stay private** — the friend-share path deliberately does not extend to notes.
- `public.is_friend_of(other_user_id UUID)` is a SQL `STABLE` helper used inside those policies; it relies on the friendships SELECT policy (current user is always one of the two parties), so it does **not** need `SECURITY DEFINER`.
- `src/lib/friends.ts` is the client-side helper module (`USERNAME_REGEX`, `getMyProfile`, `getProfileByUsername`, `fetchFriendshipsForUser`, `getFriendshipBetween`).

### UI conventions
- shadcn/ui, `style: "new-york"`, `baseColor: "neutral"`, Lucide icons. Components live in `src/components/ui/`; add new ones with `npx shadcn@latest add <name>` (config in `components.json`).
- Tailwind v4 with `@tailwindcss/postcss`; no `tailwind.config.*` — design tokens are CSS variables in `src/app/globals.css`.
- Path alias `@/*` → `src/*` (see `tsconfig.json`).
- TypeScript is `strict`. The codebase relies on `next-themes` with `attribute="class"` for dark mode.

### PWA
`next.config.ts` wraps the config with `@ducanh2912/next-pwa` (`dest: "public"`, disabled in development). Generated service-worker artifacts (`public/sw.js`, `public/workbox-*.js`, etc.) are gitignored. The performance report flagged that the default runtime caching covers authenticated `pages`/`pages-rsc`; narrow the SW strategies before treating PWA caching as safe for logged-in content.

## Security notes worth keeping in mind

The `performance-raporu.txt` audit lists issues that the codebase has been partially reworked around. When touching these areas, preserve the fixes:
- YouTube key must remain server-side (done — keep using `/api/youtube`).
- `window.open(..., "_blank")` calls should pass `"noopener,noreferrer"`.
- The `next` query param in `src/app/auth/callback/route.ts` is redirected to without validation; constrain it to internal paths before treating it as safe.
