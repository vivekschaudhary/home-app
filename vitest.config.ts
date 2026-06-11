import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirror the Next.js "@/..." path alias so app tests resolve it.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    // node by default; component tests opt into jsdom via a per-file
    // `// @vitest-environment jsdom` docblock.
    environment: "node",
    globals: true,
    include: ["app/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}", "supabase/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
  },
});
