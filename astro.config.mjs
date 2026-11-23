// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { site } from "./src/config.ts";

export default defineConfig({
  site: site.url,
  // three.js for the hero is lazy-loaded in its own chunk, so a large chunk there is expected.
  vite: { build: { chunkSizeWarningLimit: 700 } },
  integrations: [sitemap({ filter: (page) => new URL(page).pathname === "/" })],
});
