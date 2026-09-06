import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig({
  // Uygulama tamamen SSR + Server Action tabanli; ISR/SSG cache'i kullanilmiyor.
});

const openNextConfig = {
  ...config,
  // Proje webpack ile derleniyor (Turbopack degil).
  buildCommand: "npx next build --webpack",
};

export default openNextConfig;
