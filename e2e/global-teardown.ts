import { purgeE2EUsers } from "./purge-e2e-users";

// Runs once after all specs — removes the users the gated specs created so a
// shared/prod Supabase project doesn't accumulate E2E residue (see
// purge-e2e-users.ts). No-op without SUPABASE_DB_URL.
export default async function globalTeardown() {
  const n = await purgeE2EUsers();
  if (n) console.log(`[e2e teardown] purged ${n} e2e-*@example.com user(s)`);
}
