import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// `next dev` sirasinda D1 gibi Cloudflare binding'lerini yerel simulasyonla saglar.
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  images: {
    // Worker ortaminda Next image optimizer yok; YouTube thumbnail'lari dogrudan kullanilir.
    unoptimized: true,
  },
};

export default nextConfig;
