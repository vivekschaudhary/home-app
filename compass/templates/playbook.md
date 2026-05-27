---
id: PLAYBOOK-<slug>           # e.g., PLAYBOOK-pnpm-monorepo-rn
type: playbook
status: living                  # never proposed / approved — playbooks are living
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
last_validated: YYYY-MM-DD      # bump when an Architect re-uses + confirms still accurate
stack_combo: []                 # tags for signal-consultation discovery; e.g., ["pnpm", "monorepo", "react-native"]
related_bets: []                # triggering bets where the learning came from; e.g., ["AUR-1"]
maintainer: <name or role>
---

# Playbook — <Short Title>

> **What this captures:** hard-won knowledge for making a specific tool combo work that isn't obvious from vendor docs. Living artifact — re-run `last_validated` date whenever an Architect re-uses this on a new bet and confirms the steps still produce a working setup. Consulted as **signal-consultation category 5** by `/setup-foundation-architecture` step 6 whenever stack overlap exists.

## When this applies

<Concrete conditions that trigger consulting this playbook. Example:
"Stack uses pnpm with strict isolation + a JS/TS monorepo + React Native (Expo or bare). Doesn't apply if you're using npm/yarn or single-package repos.">

## Symptoms

<Failure modes this playbook prevents or diagnoses. Specific error messages, behaviors, or signals. Example:
"- `Cannot find module '@babel/runtime/helpers/interopRequireDefault'` from inside `node_modules/.pnpm/...`
- Metro fails to resolve packages that use the `exports` field
- `react-native-screens` codegen error on `Unknown prop type 'undefined'`">

## Steps

<Numbered, concrete. What to do, in order. Cite specific config keys, file paths, version pins.

Example:
1. Set `.npmrc` at repo root: `node-linker=hoisted`
2. Pin `@babel/runtime` explicitly in `apps/mobile/package.json` to match Expo SDK target
3. Add `metro.config.js` with `unstable_enablePackageExports: true`
4. Run `rm -rf node_modules && pnpm install` (pnpm doesn't auto-prune orphans)>

## Gotchas

<Known pitfalls that look fine until they bite. Includes "things people will be tempted to try that don't work."

Example:
"- Don't try to mix `node-linker=hoisted` and `pnpm strict isolation` selectively per workspace — it produces silent inconsistency
- React 19 at the workspace root will phantom-resolve into apps/mobile even if mobile pins React 18.3.1 — pin React + react-dom at the root too">

## References

<External sources that informed this playbook. Vendor docs, GitHub issues, Stack Overflow, blog posts. Each link with a one-line note on what it confirmed/contradicted.

Example:
"- Expo SDK 52 release notes — confirmed React 18.3.1 requirement: https://...
- pnpm GH issue #4865 — Metro + strict isolation incompat: https://...
- PR #142 in this repo (where we first hit symptom #1)">

## Maintainer note

<When this was last validated, by whom, on what project. Updated each re-use.

Example:
"- 2026-05-26: Validated by Vivek on aura-app (Expo SDK 52, React Native 0.76, pnpm 9.x). All steps as-written work on macOS 14.x.
- 2026-09-XX (planned): re-validate when Expo SDK 53 drops; React Native 0.82 changes the codegen story.">

---

_Living artifact — re-run `/measure` soft-prompt on bet outcomes captures new playbook needs; manually edit this file when learnings update._
