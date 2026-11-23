// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://wyeastclimbers.com",
  integrations: [sitemap({ filter: (page) => new URL(page).pathname === "/" })],
  // The site is a single page; old URLs forward to their section.
  redirects: {
    "/timeline": "/#timeline",
    "/exhibits": "/#exhibits",
    "/people": "/#people",
    "/map": "/#map",
    "/sources": "/#sources",
    "/research": "/#research",
    "/about": "/#about",
    "/search": "/",
  },
});
