import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/kage/",
  plugins: [react()],
  root: "site",
  build: {
    outDir: "../docs",
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: "site-assets/app.js",
        chunkFileNames: "site-assets/[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.names?.some((name) => name.endsWith(".css"))) {
            return "site-assets/app.css";
          }
          return "site-assets/[name][extname]";
        },
      },
    },
  },
});
