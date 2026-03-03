import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function ghPagesRouteEntryPlugin(route: string): Plugin {
  return {
    name: "gh-pages-route-entry",
    apply: "build",
    closeBundle() {
      const distDir = resolve(process.cwd(), "dist");
      const sourceHtmlPath = resolve(distDir, "index.html");
      const targetHtmlPath = resolve(distDir, route, "index.html");
      const html = readFileSync(sourceHtmlPath, "utf8");
      mkdirSync(dirname(targetHtmlPath), { recursive: true });
      writeFileSync(targetHtmlPath, html);
    },
  };
}

export default defineConfig({
  plugins: [react(), ghPagesRouteEntryPlugin("quiz")],
  base: process.env.VITE_BASE_PATH ?? "/",
});
