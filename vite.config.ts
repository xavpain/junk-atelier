import { defineConfig } from "vite";

// Served at https://<user>.github.io/junk-atelier/ on Pages, so the production
// build needs that base. Dev stays at root. All assets are pipelined through
// Vite (relative url()s), so they pick up the base automatically.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/junk-atelier/" : "/",
}));
