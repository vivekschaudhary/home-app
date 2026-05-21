<!--
Reusable DRI Log block. Appended to every artifact.
All fields except status are mandatory.
-->

## DRI Log

### Decisions
<!-- Append-only. Never edit a past decision. To reverse, add a new SUPERSEDES entry. -->

- [YYYY-MM-DD] [<role>] <one-line decision summary>
  - **Rationale (required):** <why>
  - **Area (required, tag):** <architectural | product | ux | process | infrastructure | security | data | etc.>
  - **Alternatives considered (required):** <what was considered>
  - **Reversibility:** easy | medium | hard | one-way

### Risks

- [YYYY-MM-DD] [<role>] <one-line risk summary>
  - **Likelihood (required):** low | medium | high
  - **Impact (required):** low | medium | high
  - **Mitigation (required):** <plan>
  - **Area (required, tag):** <tag>
  - **Resolution (filled when closed):** [DATE] <how>

### Issues

- [YYYY-MM-DD] [<role>] <one-line issue summary>
  - **Severity (required, mandatory):** P0 | P1 | P2 | P3
  - **Owner (required, mandatory):** <role>
  - **Status:** open | in-progress | resolved
  - **Area (required, tag):** <tag>
  - **Resolution (filled when closed):** [DATE] <how>

<!--
Notes:
- P0 issues trigger immediate human alert via configured channel.
- Framework auto-writes DRI entries when it makes choices (e.g., "Architect declared no bet-level architecture needed" → auto-decision).
- Cross-artifact references via markdown links — a story's DRI can point to entries in parent bet.
- Decisions are append-only; supersede with a new entry tagged SUPERSEDES <prior date>.
-->
