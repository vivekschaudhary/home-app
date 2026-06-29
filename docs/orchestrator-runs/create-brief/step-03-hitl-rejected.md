---
workflow: create-brief
step: 3
status: rejected
timestamp: 2026-06-28 16:44
---

# HITL Rejection — Step 3

**Timestamp:** 2026-06-28 16:44

## To regenerate the rejected artifact

Rerun from the step that produced it (the HITL gate re-fires after):

```bash
python3 -m compass.orchestrator.run create-brief --from-step 2
```
