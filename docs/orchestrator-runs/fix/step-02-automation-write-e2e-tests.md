---
workflow: fix
step: 2
agent: automation
task: write-e2e-tests
generated: 2026-06-24 22:21
---

**Plan summary:** The `#133` fix added a `/log?run=<id>` HTTP endpoint + run-output capture to the Compass cockpit. Unit tests for the pure functions already exist in `test_events.py`. The gap is HTTP-level testing of the live server.

**What I'll create:** `compass/orchestrator/tests/test_e2e_server.py` — 6 tests (3 happy, 3 failure) that start the cockpit server as a subprocess with a temp `COMPASS_HOME`, then hit it with real `urllib` requests:

| Test | Type |
|------|------|
| GET `/log?run=<id>` with existing file → 200 + content | happy |
| Response has `← cockpit` back link + `http-equiv='refresh'` | happy |
| GET `/` in actionable mode → HTML shows `log ↗` link | happy |
| GET `/log?run=<valid-format-but-no-file>` → 404 | failure |
| GET `/log?run=../../etc/passwd` → 404 (path traversal blocked) | failure |
| GET `/log?run=` → 404 (empty ID) | failure |