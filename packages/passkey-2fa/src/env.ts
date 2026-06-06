// Env access with fail-loud semantics — a missing required value throws at call
// time with a clear, named message rather than letting the app boot broken.

export function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `[@vc1023/passkey-2fa] Missing required environment variable: ${name}. ` +
        `Set it in .env.local (local) and your host's env (deployed). ` +
        `Run \`npx passkey-2fa check-env\` to see everything that's required.`,
    );
  }
  return value;
}

export const SUPABASE_URL = () =>
  requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = () =>
  requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const SUPABASE_SERVICE_ROLE_KEY = () =>
  requireEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
