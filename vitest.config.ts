import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    // Default to node — jsdom 20 pulls in `canvas` native bindings which
    // aren't available in the build sandbox. Tests that need a DOM should
    // opt-in with `// @vitest-environment jsdom` at the top of the file.
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
