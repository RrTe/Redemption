import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    port: 5173, // Standard-Port von Vite (kannst du ändern)
    open: true, // öffnet Browser automatisch beim Start
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Redemption Coliseum",
        short_name: "Redemption",
        id: "/",
        description: "Redemption TCG Coliseum",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        navigateFallback: "/index.html",
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
    }),
  ],
});
