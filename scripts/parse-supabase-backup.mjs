#!/usr/bin/env node
/**
 * Supabase Dashboard'dan indirilen "db_cluster-...backup.gz" (pg_dumpall duz SQL) dosyasini
 * dogrudan okur ve build-d1-import.mjs'in bekledigi JSON'u uretir. Postgres baglantisi gerekmez.
 *
 * Kullanim:
 *   node scripts/parse-supabase-backup.mjs "C:\...\db_cluster-24-08-2026@03-07-12.backup.gz"
 *   npm run migrate:build-import
 *   npx wrangler d1 execute studyfield-db --remote --file=scripts/out/d1-import.sql
 */
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "out");
const outFile = join(outDir, "supabase-export.json");

const input = process.argv[2];
if (!input) {
    console.error("Kullanim: node scripts/parse-supabase-backup.mjs <backup.gz veya .sql>");
    process.exit(1);
}

const WANTED = new Set([
    "auth.users",
    "public.profiles",
    "public.friendships",
    "public.youtube_playlists",
    "public.youtube_videos",
    "public.youtube_video_notes",
]);

/** COPY metin formatindaki tek bir alani cozer. */
function decodeField(raw) {
    if (raw === "\\N") return null;
    let out = "";
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch !== "\\") {
            out += ch;
            continue;
        }
        const next = raw[++i];
        switch (next) {
            case "t": out += "\t"; break;
            case "n": out += "\n"; break;
            case "r": out += "\r"; break;
            case "b": out += "\b"; break;
            case "f": out += "\f"; break;
            case "v": out += "\v"; break;
            case "\\": out += "\\"; break;
            default: out += next ?? "";
        }
    }
    return out;
}

/** Postgres text[] literalini ({a,"b c"}) JS dizisine cevirir. */
function parsePgArray(value) {
    if (value === null || value === undefined) return [];
    const s = String(value).trim();
    if (!s.startsWith("{") || !s.endsWith("}")) return [];
    const body = s.slice(1, -1);
    if (!body) return [];
    const items = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (inQuotes) {
            if (ch === "\\") { cur += body[++i] ?? ""; continue; }
            if (ch === '"') { inQuotes = false; continue; }
            cur += ch;
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ",") {
            items.push(cur);
            cur = "";
        } else {
            cur += ch;
        }
    }
    items.push(cur);
    return items.filter((x) => x !== "" && x !== "NULL");
}

const tables = {};
let current = null; // { name, columns }

const stream = input.endsWith(".gz") ? createReadStream(input).pipe(createGunzip()) : createReadStream(input);
const rl = createInterface({ input: stream, crlfDelay: Infinity });

for await (const line of rl) {
    if (current) {
        if (line === "\\.") {
            current = null;
            continue;
        }
        const fields = line.split("\t").map(decodeField);
        const row = {};
        current.columns.forEach((c, i) => {
            row[c] = fields[i] ?? null;
        });
        tables[current.name].push(row);
        continue;
    }
    const m = line.match(/^COPY (\S+) \((.*)\) FROM stdin;$/);
    if (m && WANTED.has(m[1])) {
        const columns = m[2].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        current = { name: m[1], columns };
        tables[m[1]] = tables[m[1]] ?? [];
    }
}

const bool = (v) => v === "t" || v === true;
const int = (v) => (v === null || v === undefined ? 0 : Number(v));

const users = (tables["auth.users"] ?? [])
    .filter((u) => u.email && !bool(u.is_anonymous) && !u.deleted_at)
    .map((u) => ({
        id: u.id,
        email: u.email,
        encrypted_password: u.encrypted_password,
        created_at: u.created_at,
        updated_at: u.updated_at,
    }));

const profiles = tables["public.profiles"] ?? [];
const friendships = tables["public.friendships"] ?? [];

const playlists = (tables["public.youtube_playlists"] ?? []).map((p) => ({
    ...p,
    video_count: int(p.video_count),
    is_shared: p.is_shared === null ? true : bool(p.is_shared),
    tags: parsePgArray(p.tags),
}));

const videos = (tables["public.youtube_videos"] ?? []).map((v) => ({
    ...v,
    position: int(v.position),
    is_watched: bool(v.is_watched),
}));

const notes = (tables["public.youtube_video_notes"] ?? []).map((n) => ({
    ...n,
    timestamp_seconds: int(n.timestamp_seconds),
}));

mkdirSync(outDir, { recursive: true });
writeFileSync(
    outFile,
    JSON.stringify({ exportedAt: new Date().toISOString(), source: input, users, profiles, friendships, playlists, videos, notes }, null, 2),
);

console.log(`Yazildi -> ${outFile}`);
console.log(
    `  users=${users.length} profiles=${profiles.length} friendships=${friendships.length} playlists=${playlists.length} videos=${videos.length} notes=${notes.length}`,
);
for (const u of users) {
    const hasPw = u.encrypted_password && u.encrypted_password.startsWith("$2");
    console.log(`  - ${u.email} ${hasPw ? "(sifre tasinacak)" : "(SIFRESIZ: yeniden kayit gerekir)"}`);
}
