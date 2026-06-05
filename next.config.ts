import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Boundary packages are TypeScript source — Next transpiles them.
  transpilePackages: ["@wealth/jobs"],
  // CI runs lint separately (see .github/workflows/ci.yml); keep the Vercel
  // build focused on compilation + type-correctness.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
