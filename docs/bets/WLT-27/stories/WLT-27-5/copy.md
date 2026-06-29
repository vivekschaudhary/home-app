---
id: WLT-27-5-copy
story: WLT-27-5
status: draft
type: copy
created: 2026-06-28
author: UX Writer
---

# Copy: WLT-27-5 — Region Switcher UI (Per-Currency Spending Surfaces)

## Voice and tone

Plain and informational. The switcher is a page-level filter, not a feature. Users with multi-currency accounts are financially sophisticated; they know what a currency code means. Don't over-label or explain. The label should tell the user what they're choosing, not how the mechanism works. The ARIA label should describe the effect of the control so screen-reader users know what changes.

Voice guidelines: `n/a — product.md has no dedicated voice/tone section; register follows plain, useful, quietly in-control standard established in WLT-24/25 copy`.

## Strings

### RegionSwitcher component

- **region-switcher-label:** `Currency`
- **region-switcher-aria-label:** `View spending in a different currency`

### Currency option labels

Display format: **`{name} ({code})`**

Examples of how this resolves:
- `US Dollar (USD)`
- `Euro (EUR)`
- `British Pound (GBP)`
- `Japanese Yen (JPY)`

- **region-switcher-option-{code}:** `{name} ({code})` _(resolved per currency; e.g., `US Dollar (USD)`)_
- **region-switcher-option-default:** `{name} ({code})` _(generic fallback for any unlisted currency; can be generated from `Intl.DisplayNames` where supported)_

## Terminology consistency

- **"Currency"** — the visible label on the switcher. Preferred over "Region" (the component is called RegionSwitcher internally, but users don't experience the concept as a region — they're filtering by currency). Preferred over "View" (ambiguous about what changes) or "Filter" (correct but less natural in this heading-area context). Consistent with how the app already labels the currency field in ManualAccountForm (WLT-27-2).
- **"{name} ({code})"** — the currency option display format. Full name surfaces for users who don't know all ISO 4217 codes; the code disambiguates when names are long or similar (e.g., "Dollar" appears in USD, CAD, AUD). Format matches common banking UI conventions (Wise, Revolut, Stripe).
- **"View spending in a different currency"** — the ARIA label. Describes the _effect_ of the control, not its state. A user relying on a screen reader who hears "Currency, select" needs to know what selecting a different option will do.

## Character limits

n/a — the switcher label ("Currency") and option labels (e.g., "US Dollar (USD)" = 14 chars) are short. No truncation risk at typical viewport widths. The ARIA label is screen-reader only; no visual character limit.

## DRI Log

### Decisions

- [2026-06-28] [UX Writer] **"Currency" label, not "Region"** — the component is internally named RegionSwitcher (per design spec) but the user is choosing a currency, not a region. "Region" would imply country, language, or locale — all of which are different concepts. "Currency" is the precise word for what the user is selecting and matches the terminology used in the ManualAccountForm. Area: copy/terminology. Reversibility: easy.
- [2026-06-28] [UX Writer] **Display format `{name} ({code})`, not code-only** — code-only ("EUR") is compact but opaque to users who don't know ISO 4217. Full-name-only ("Euro") is ambiguous when multiple currencies share a base name (e.g., "Dollar" = USD, CAD, AUD, NZD). `{name} ({code})` is unambiguous, familiar from banking apps, and gives both the scannable name and the precise code. Area: copy/format. Reversibility: easy.
- [2026-06-28] [UX Writer] **Confluence/Jira mirror skipped** — neither MCP is connected on this host. Area: tooling. Reversibility: high.

### Risks

- _none_

### Issues

- _none_
