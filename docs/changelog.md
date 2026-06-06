# Changelog

User-visible changes. One entry per shipped bet (not per PR — PRs accumulate, finalize when brief ships).

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Identity & MFA onboarding (WLT-1, story WLT-6):** create an account with email + password and a **mandatory passkey** enrolled in the same flow; sign in with a passkey challenge. Sessions persist across reloads; the second factor is enforced server-side. Unsupported browsers get an honest block. _(Supabase Auth + a custom WebAuthn 2FA layer — architecture ADR-001.)_

### Changed
-

### Fixed
-

### Deprecated
-

### Removed
-

### Security
-

<!--
When a brief ships:
1. Move accumulated entries from Unreleased into a versioned section below
2. Start a fresh Unreleased section
3. Sprint comms (docs/sprints/<year>/sprint-<n>.md) lists all briefs shipped that sprint
-->
