// @wealth/core — domain logic: intents, goals, the workflow/block engine.
// WLT-6 seeds: auth validation + the WLT-5 funnel-event contract + audit actions.
// Server-only crypto (AAL2 token) lives in ./mfa — import it directly, not via
// this barrel, to keep node:crypto out of client bundles.
export * from "./validation";
export * from "./funnel";
export * from "./audit";
