---
id: FOUNDATION-ARCHITECTURE
type: foundational-architecture
version: 1
status: proposed
created: YYYY-MM-DD
author: Enterprise/Solution Architect
parent: FOUNDATION-PRODUCT
key_metric:
  name: <e.g., platform reliability, dev velocity, cost-per-user>
  baseline: <current>
  target: <target>
  source: <where data lives>
measurement_window_months: 24
check_in_cadence: quarterly
---

# Foundational Architecture Bet

> The platform's load-bearing technical decisions, as a wager.

## Context

<Constraints — regulatory, team skill, performance, cost — that shape this architecture.>

## Decision

<One clear paragraph: the architectural posture chosen. A reader should know what we're building from this section alone.>

## Stack

| Concern | Choice | Reversibility |
|---------|--------|---------------|
| Repo shape | monorepo / polyrepo | <hard / one-way> |
| Backend language | <language> | <hard> |
| Backend framework | <framework> | <medium> |
| Frontend framework | <framework> | <medium> |
| Mobile framework | <framework> | <medium> |
| Database | <DB> | <hard> |
| Contracts format | <OpenAPI / tRPC / GraphQL / none> | <medium> |
| Auth model | <session / JWT / OAuth> | <hard> |
| Deployment target | <cloud / on-prem> | <one-way> |
| CI/CD platform | <GH Actions / GitLab CI / etc.> | <medium> |
| Observability | <Sentry / Datadog / etc.> | <medium> |
| Secrets management | <Vault / AWS Secrets / etc.> | <hard> |
| Infrastructure-as-code | <Terraform / Pulumi / etc.> | <medium> |

## Boundaries (initial)

<Directory structure / service split / module boundaries that all bets start from.>

## Cross-cutting standards

- Logging:
- Error handling:
- Naming:
- Testing:
- Observability:

## Hypothesis (the bet)

<This stack and these standards will support <product vision> for <N years> with <team size>. Specifically: <falsifiable hypothesis>.>

## Guardrail metrics

What must NOT degrade for this architecture to count as won:
- <metric>: stays above/below <threshold> (e.g., dev velocity, cost-per-user, MTTR)

## Alternatives considered

| Option | Pros | Cons | Why rejected |
|--------|------|------|--------------|
| Chosen | | | — |
| Alt A | | | |
| Alt B | | | |

## Consequences

**Positive:**
-

**Negative:**
-

**Lock-in:**
- <Specific things that are now hard to change>

## Repo scaffolding completed

- [ ] Boundary folders created
- [ ] CI/CD pipeline files in place
- [ ] Base configs (tsconfig, eslint, etc.)
- [ ] `compass/config.yaml` populated with team decisions

## Check-in log

_Populated automatically by `/measure` cron._

## DRI Log

### Decisions
- [YYYY-MM-DD] [Enterprise Architect] <decision> — rationale: <why> — area: <tag> — alternatives: <what> — reversibility: <hard / one-way>

### Risks
- [YYYY-MM-DD] [Enterprise Architect] <risk> — likelihood — impact — mitigation — area

### Issues
- [YYYY-MM-DD] [Enterprise Architect] <issue> — severity — owner — status — area

---

_Approved by: <name> on <date>_
