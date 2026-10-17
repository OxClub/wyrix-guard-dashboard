import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves a project site from /<repo>/. Override with VITE_BASE for a custom domain ("/").
export default defineConfig({
  base: process.env.VITE_BASE ?? "/wyrix-guard-dashboard/",
  plugins: [react()],
  test: { environment: "node" },
});
