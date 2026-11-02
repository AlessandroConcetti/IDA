import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist-typography",
    rollupOptions: { input: "typography-preview.html" },
  },
});
