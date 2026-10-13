import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

/**
 * The standalone Drive web app (the `drive` profile without an environment,
 * ADR 0008). Otter Cloud serves `dist/` under `/drive/` and answers Drive's
 * page URLs with its `index.html` (infra/cloud/scripts/drive-assets.ts).
 */
export default defineConfig({
  base: "/drive/",
  plugins: [tailwindcss(), react()],
  build: { outDir: "dist", sourcemap: true, chunkSizeWarningLimit: 2500 },
});
