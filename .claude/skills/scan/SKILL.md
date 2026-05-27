---
name: scan
description: Continuous quality scanner for the product lifecycle (Snyk-style). Findings, not failures. Severity + confidence + location + reason + fix per finding. Read-only. Auto-invoked by /build at phase boundaries. Owners decide; the scanner informs.
---

Execute the workflow at `compass/workflows/scan.md`.

Read that workflow file now and follow it step by step. Load the Scanner role context (`compass/roles/scanner.md`). Respect suppression policies per `compass/config.yaml` `scanner.suppression_policy`. The scan itself has no HITL gate; HITL only applies to suppressions of Critical findings.

$ARGUMENTS
