import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Boundary packages are TypeScript source — Next transpiles them.
  transpilePackages: [
    "@vc1023/passkey-2fa",
    "@wealth/jobs",
    "@wealth/db",
    "@wealth/core",
    "@wealth/ui",
  ],
  // CI runs lint separately (see .github/workflows/ci.yml); keep the Vercel
  // build focused on compilation + type-correctness.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
