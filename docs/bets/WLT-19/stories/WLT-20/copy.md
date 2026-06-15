---
bet: WLT-19
story: WLT-20
author: UX Writer
created: 2026-06-15
---

> Engineer note: use these strings **verbatim** (PM refusal rule: no paraphrasing UX Writer copy).

# Copy: WLT-20 — The app shell

## Voice and tone

Calm, plain, confident — the same voice as every shipped surface. Nav labels are short and concrete. "Coming soon" is honest and a little inviting (a one-line teaser of the value), never overpromising or fake. No jargon, no exclamation marks.

## Strings

### Brand + chrome
| Location / ID | Final copy | Rationale |
|---|---|---|
| `shell.brand` | Wealth at Your Fingertips | The wordmark (top of the sidebar) — matches the existing product name |
| `shell.navLabel` | Main | `<nav aria-label>` — SR landmark |
| `shell.skipToContent` | Skip to content | First focusable; a11y |

### Nav items (verbatim — these are the section names)
| ID | Label |
|---|---|
| `nav.dashboard` | Dashboard |
| `nav.budget` | Budget & Spending |
| `nav.goals` | Goals |
| `nav.debt` | Debt payoff |
| `nav.investments` | Investments |
| `nav.subscriptions` | Subscriptions |
| `nav.accounts` | Accounts |

### Account menu (bottom of the sidebar)
| Location / ID | Final copy | Rationale |
|---|---|---|
| `account.trigger` | {email} | The signed-in email (interpolated); opens the menu |
| `account.security` | Security | → /settings/security |
| `account.signOut` | Sign out | The one action in the shell |

### Coming Soon (one component; per-section title + teaser)
| Location / ID | Final copy | Rationale |
|---|---|---|
| `comingSoon.badge` | Coming soon | The honest label on every stub |
| `comingSoon.budget` | See where your money goes and set limits that fit your life. | Budget & Spending teaser |
| `comingSoon.goals` | Set targets for what matters and watch your progress add up. | Goals teaser |
| `comingSoon.debt` | A clear plan to pay down what you owe, faster. | Debt payoff teaser |
| `comingSoon.investments` | See all your investments in one place, without the spreadsheet. | Investments teaser |
| `comingSoon.subscriptions` | Spot every recurring charge and cancel the ones you don't use. | Subscriptions teaser |

### Accessibility labels
| Location / ID | Final copy | Rationale |
|---|---|---|
| `a11y.openNav` | Open navigation menu | The hamburger (mobile) |
| `a11y.closeNav` | Close navigation menu | The drawer ✕ |
| `a11y.accountMenu` | Your account | The account-menu trigger SR label |
| `a11y.currentPage` | Current page | (paired with `aria-current="page"` where a text hint is needed) |

## Terminology consistency

- **Section names are fixed** — "Budget & Spending", "Debt payoff", etc. — used identically in the nav, the page title, the ComingSoon heading, and the URL slug's human label. A feature bet inherits its section's exact name.
- **"Coming soon"** — always two words, lowercase-after-cap, on every not-yet-built section. Never "Under construction" / "WIP".
- **"Sign out"** (not "Log out") — matches the existing auth copy.

## DRI Log

### Decisions
- [2026-06-15] [UX Writer] **Each ComingSoon has a value teaser, not just "Coming soon"** — rationale: honest about what's coming + a little inviting, without faking the feature; one line each — area: tone
- [2026-06-15] [UX Writer] **Nav labels verbatim from the request** — rationale: the user named the sections; they become the canonical product names features inherit — area: comprehension

### Risks
- [2026-06-15] [UX Writer] **{email} can be long** and crowd the account control — likelihood: medium — impact: low — mitigation: truncate with an accessible full value (title/aria) — area: i18n/layout

### Issues
- _none_
