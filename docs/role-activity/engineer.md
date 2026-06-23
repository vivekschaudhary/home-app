# Engineer — role activity log

Append-only. Cross-bet patterns surfaced mid-task (`[fractal-retro]`). Cite, don't assert.

---

- **2026-06-23 · AAL2 marker had an absolute TTL, no sliding renewal → "forced logout every few hours"**
  - **Context:** `/fix` triage of a forced-logout report (single user). Diagnosed from the auth/session code, not the user.
  - **Pattern surfaced:** A short-lived security marker (`wlt_mfa` AAL2 token, 1h TTL) was minted ONLY at the second-factor ceremony (`setAal2Cookie` at 4 route points) and **never renewed on the validated read path** (`getAal2UserId`). So a *continuously active* session was bounced to `/sign-in` ~1h after sign-in — an undocumented absolute cap masquerading as an inactivity window. The three "obvious" suspects (JWT/AAL1 expiry, refresh-token rotation, cookie persistence) were all ruled out by reading the actual code: AAL1 refresh + `sid` binding were correct; the bug was purely the AAL2 marker's missing renewal.
  - **Evidence:** `packages/passkey-2fa/src/aal2.ts:11` (`AAL2_TTL_SECONDS`, comment "re-challenge after"); `packages/passkey-2fa/src/guard.ts` (`getAal2UserId` had no renewal); `packages/passkey-2fa/src/routes.ts:264,293,333,355` (only mint points). Regression: `packages/passkey-2fa/src/aal2-renewal.test.ts`.
  - **Instance count in this log:** 1
  - **Recommended action:** When a guard mints a short-lived marker for a *long-lived* session, the renewal seam is part of the contract — pair "mint" with "slide on validated read" by default. Also: a TTL constant with an offhand "re-challenge after" comment is NOT an approved security policy; the absolute-timebox / idle-timeout decision belongs to Architect/PM. Flagged as an open Issue on the PR rather than baked in.
