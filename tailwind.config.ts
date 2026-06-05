import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./packages/ui/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
