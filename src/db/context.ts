import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDb, type Database } from "./index";

/**
 * Istek baglamindaki D1 binding'inden Drizzle istemcisi dondurur.
 * Sadece Server Action, Route Handler ve Server Component icinde cagrilmali.
 */
export function getDb(): Database {
    const { env } = getCloudflareContext();
    return createDb(env.DB);
}

export function getEnv(): CloudflareEnv {
    return getCloudflareContext().env;
}
