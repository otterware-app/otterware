import { defineConfig } from "vite-plus";
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    maxWorkers: 2,
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
