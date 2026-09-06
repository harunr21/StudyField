import { defineConfig } from "drizzle-kit";

// Sadece sema karsilastirmasi / SQL uretimi icin. Migration'lar `migrations/` altinda elle tutulur
// ve `wrangler d1 migrations apply` ile uygulanir.
export default defineConfig({
    dialect: "sqlite",
    schema: "./src/db/schema.ts",
    out: "./drizzle",
});
