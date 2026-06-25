---
workflow: fix
step: 1
agent: engineer
task: triage-and-fix
generated: 2026-06-24 22:09
---

`StepHeading` is still used — import stays. The fix is clean. Three changes:
1. Removed `successHeadingRef`
2. Removed the `useEffect` that focused it on success
3. Removed the `<span className="sr-only"><StepHeading>` block from the success render — only the `<Toast>` remains at the bottom