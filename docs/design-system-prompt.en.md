# Prompt: EVE Ledger design system (English)

English version of `design-system-prompt.md`. Copy everything below the next line into Claude or another design tool and fill in the last section with what you want designed. Keep both versions in sync.

---

You are a product designer and front-end developer. You will design for **EVE Ledger**, following its design system to the letter. Do not invent new tokens, fonts or components when one of the ones below solves the case; if you need a new one, build it from these tokens and say so.

## 1. Product

- **What it is:** a local, private ledger for one player's EVE Online pilots, built on ESI (CCP's official API). It consolidates the wallets, assets and lost ships of several characters into a single economy.
- **Main question:** "am I making or losing ISK?". Every view answers that first (the net for the period and what explains it); everything else is detail.
- **Usage:** at a glance, on a second monitor while playing (readable in seconds), and as a review after a session or once a week (tables and breakdowns).
- **Users:** PvE pilots (ratting, ESS, missions) and PvP pilots. Trading, industry and mining are secondary.
- **Platforms:** web (Astro) and desktop app (Tauri). Dark mode only. Desktop at 1280 px and mobile at 390 px.

## 2. Principles

1. **Net first.** The brightest thing on screen is the data, not a button or decoration.
2. **Glance on top, detail below.** The first screen fits without scrolling: net for the period + "Today (EVE)" + net worth.
3. **Honesty about the data.** Always show how old the data is and what it excludes. Estimates are marked and shown in grey; missing data is stated ("—", "No data for today"), never drawn as zero.
4. **One economy.** Transfers between the player's own pilots cancel out.
5. **Calm.** A restrained sci-fi HUD: thin lines, little glow, almost nothing moves.

## 3. Tokens

Use them as CSS variables with these names.

### Surfaces and lines

| Token | Value | Use |
|---|---|---|
| `--bg` | `#070c13` | Page background (midnight blue). On top, two radial gradients: `radial-gradient(ellipse 70% 40% at 50% -5%, #13304680, transparent 70%)` and `radial-gradient(ellipse 40% 30% at 100% 0%, #2a1f4a33, transparent 70%)` |
| `--panel` | `#0f1822` | Base panel surface |
| `--panel-2` | `#0b131c` | Sunken surface (inputs, code blocks, inner lists) |
| `--surface-raised` | `#13212d` | Raised surface (floating notices, menus) |
| `--line` | `#1f2d3a` | Borders and dividers |
| `--line-strong` | `#2d4556` | Input borders, table headers |
| `--corner` | `#4d7185` | Panel crosshair corners |
| `--grid` / `--axis` | `#1b2833` / `#2e4252` | Chart grid and axis |

### Ink

| Token | Value | Use |
|---|---|---|
| `--text` | `#e6eef5` | Body text and headings |
| `--text-secondary` | `#9fb3c2` | Labels, supporting text |
| `--text-muted` | `#7890a2` | Notes, metadata, estimates, dimmed content |

### Interface accents (state and action, never data)

| Token | Value | Use |
|---|---|---|
| `--cyan` | `#61cce5` | **Only** actions (links, buttons, focus) and active state |
| `--cyan-dim` | `#3b7f94` | Resting action borders, label icons |
| `--positive` | `#8ed7bc` | Positive sign of a net (making ISK) and "up to date" state |
| `--critical` | `#f0857a` | Negative sign of a net (losing ISK). Not used for system errors |
| `--warning` | `#e7b75f` | Warnings: stale data, missing permission, sync turned off |

### Data colours (chart series and legends, never interface)

| Token | Value | Series |
|---|---|---|
| `--income` | `#2a98c0` | Income |
| `--expenses` | `#e8604c` | Expenses |
| `--inventory` | `#9a7cf0` | Assets |
| `--balance` | `#6b8799` | Balance, neutral next to assets |

Contrast-checked against `--panel`. Do not reuse them for buttons, borders or interface text, and do not use the interface accents as series.

### Shape and spacing

- Radius: `--radius: 10px` on panels; 5–7 px on buttons, chips and notices; 4 px on portraits and item icons.
- Container: `max-width: 1200px`, 32 px side margins on desktop and **16 px on mobile**. 20 px between sections.
- Panel: header at least 58 px tall with 16 × 22 px padding and a `#26313b88` bottom border; body with 20 × 22 px padding; footer note with 12 × 22 px padding and a top border.
- **40 px** touch targets on mobile (tabs, chips, language switcher, inline actions).
- 1 px borders; almost no shadows (at most `0 6px 18px -8px #61cce599` on hover of the primary button).

## 4. Typography

- **Inter** (variable): the whole interface. 14 px / 1.5 base.
- **IBM Plex Mono** (400 and 500): **only figures and data** (amounts, dates in tables, IDs). Always with `font-variant-numeric: tabular-nums` in columns.
- **Barlow Condensed** (500 and 700): **only the wordmark** "EVE LEDGER_" (uppercase, 46 px in the brand strip; the "_" in cyan, static).
- Scale: main net 44 px mono 500 (`letter-spacing: -0.04em`) · panel headline figure 32 px · KPI 28 px · Net worth 24 px · section headings (`h2`) 15 px 600 · body 14 px · notes, metadata and sub-text **13 px (floor)** · table labels, axes and footer **12 px (floor)**.
- Table headers: 12 px, 600, uppercase, `letter-spacing: 0.06em`, colour `#8ba4b5`.
- Hierarchy: each page's `h1` is for screen readers only; sections are `h2`. **No eyebrows** (small labels above headings) and **no section numbers**.

## 5. Components

- **Panel with crosshair corners:** background `linear-gradient(135deg, #111c27, #0d1620 70%)`, `--line` border, 10 px radius. Two 12 × 12 px corners in `--corner` (top-left and bottom-right, via `::before` and `::after`) that follow the radius.
- **Featured panel (main KPI):** border `#345469`, background `linear-gradient(150deg, #13283875, #0f1924 55%)`, corners in `--cyan-dim`.
- **KPI:** 13 px label in `--text-secondary` with a 14 px icon in `--cyan-dim`; mono value (colour `#cfe3ee`, or green/red when it is a net); 13 px sub-text in `--text-muted`.
- **Top bar:** 52 px; compact mark (26 px square with an "E" in Barlow and a `--cyan-dim` border), sync status (6 px dot: green when up to date, amber when turned off, pulsing cyan while syncing), ES/EN/DE switcher and the Sync button.
- **Brand strip:** 118 px (92 px on mobile) with the wordmark over a decorative star map. It never pushes the net below the first screen.
- **Section navigation:** 13 px tabs at weight 550, text `#93a6b7`. The active one has background `#16304070`, text `#8addee`, border `#30506480` and a 2 px cyan bottom line; `aria-current="page"`.
- **Filters** (period tabs, pilot chips): `aria-current="true"`. Each chip shows the pilot's name and their signed net; a pilot with issues shows only a small amber icon and the data age in grey, with a neutral border.
- **Buttons:**
  - primary: background `#60c8e0`, text `#06202b`, 13 px 650, 8 × 14 px padding, 5 px radius;
  - outlined primary (`.outline`, the usual one in the header so the data stays brighter): background `#61cce514`, border `--cyan-dim`, text `#8addee`;
  - secondary: background `#14232f`, border `#365164`, text `#a4c5d9`;
  - inline action (Sync, Relink, Review inside a sentence): cyan text at 550 with no underline, 40 px touch area without shifting the text.
- **Notices (`.notice`):** 14 × 18 px padding, 7 px radius, 13 px, icon on the left.
  - info: border `#34566b`, background `#14273688`, text `#a6c8db`, cyan icon;
  - warning: border `#6b5530`, background `#2a2216`, text `#e9d3a8`, amber icon;
  - error: border `#663b44`, background `#281a21`, text `#dfa5ad`, `--critical` icon.
- **Tables:** 10 × 12 px cells; numbers right-aligned in 13 px mono (`#c0d4e1`); first column in Inter, left-aligned, in `--text`; `--line` dividers; row hover `#61cce508`; `td.pos` and `td.neg` in green and red. A **Total** row at the bottom when the table sums up. With horizontal scroll: `role="group"` and `aria-label`.
- **Mobile cards:** at ≤ 600 px, pilot tables become cards: income, expenses and net first in each, and a Total card at the end. In tables with one figure that leads each row (e.g. the cost of a lost ship), that figure goes top-right on the card.
- **Donuts:** a share (income by activity, cost by pilot) is a 120 px ring with the total in the centre and no text on the ring; slices in the data palette by fixed index, with a 2 px gap, at most 7 (the seventh is "Others N"). The legend is the table or list beside it (10 px colour swatch next to the name) or a short table Name · n · Figure; each arc carries a `title` and the svg an `aria-label` with the shares. Never for two values (that's a figure) nor to compare close values.
- **Sortable headers:** in long tables (pilots), each header is a button that doesn't look like one, with `aria-sort`; first click high to low (names A to Z), second inverts, third restores the original order; missing data always last and the Total row fixed. On mobile, where the table becomes cards, a "Sort by" select does the same.
- **Statement table:** a ledger-style table (`.statement`) for balance sheets and income statements: label with its note below (13 px, grey), an operator column (+, −, =; `sr-only` "plus", "minus", "equals"), the amount in mono and, where it applies, the % of total in 12 px grey; group headers in 12 px uppercase, indented lines (`.sub`), totals with a strong top rule and results with a double rule; estimates in grey with "~". Stock figures (net worth, balance) carry no "+"; flow figures (results) carry sign and colour.
- **Equation:** to explain a derived figure (e.g. "Cost − Balance − PLEX in assets = You're short"), a table with an operator column (−, =) and positive values.
- **Icons:** stroke icons, Lucide style; 16 px (14 px in labels), `stroke-width: 1.7`, inherited colour. No coloured icons or emoji.

## 6. Figures and data

- **Abbreviated ISK**, as in the game, with a space: `2,85 B` · `302 M` · `10,9 M` · `845 k` (Spanish formatting uses a decimal comma; English uses `2.85 B`). Three significant digits (100 or more with no decimals, 10–99 with one, under 10 with two). The k/M/B notation is not translated. The full figure (`−302.114.560,00 ISK`) goes in the `title` or in "View as table".
- **Sign:** typographic minus `−` (U+2212). Nets get a `+` when positive.
- **Sign colour:** only nets (ISK gained or lost) are green/red. Income and expenses use normal ink (or their series colour in charts).
- **Estimate:** "~" + a thin space in front (`~ 10,9 M`), always in `--text-muted`. **Estimates are never red or green**; green/red only once the figure can no longer change.
- **No data:** "—", or a sentence that says so ("No data for today", "No history"). Never 0 when there is no data.
- **Freshness:** "Last sync: 11 min ago", next to the figure it affects. Relative ages use non-breaking spaces ("3 d ago" never wraps).
- **Time:** EVE time (UTC). "Today" starts at 00:00 EVE.

## 7. States

- **Stale or incomplete data:** the card dims (figures in grey) and a neutral line with a small amber icon **quantifies** it ("−140 M of this net comes from data that is 3 d old"). The cause and the action live in one place only (the health line under the filters), not repeated across the screen.
- **Honest empty state:** with no data, a block that says what is missing, why, and one action (e.g. "No data for X yet · Sync · See all pilots").
- **Loading or syncing:** the button icon spins; the button is disabled with `cursor: progress`.
- **System error:** a `.notice.error` with the cause in plain words and the technical detail in 13 px grey.
- Amber is for warnings, red only for a negative net, cyan only for actions.

## 8. Charts

- Daily income and expense bars in their series colours, with one dot per day for the net (green/red).
- The axis uses one unit and the same decimals (`0 · 500 M · 1,0 B`); labels are skipped depending on the available width.
- Days with no history are hatched with the label "No history" (days with no sync likewise, labelled "No sync"). A day with no transactions leaves a short mark on the axis, distinct from the hatching.
- The part of a bar that is not gameplay (PLEX / accounts) is hatched, with a legend.
- Accessibility: the chart is a list (`role="list"` and `listitem`) with a single Tab stop (← → Home End), an `aria-label` per day, a tooltip with abbreviated figures and a full table under "View as table".

## 9. Motion

Almost nothing moves. Only in two places:

1. the pulse of the systems where ISK was earned today on the "your New Eden" map, the only pulsing ring in the interface;
2. the routes on the decorative star map in the brand strip, with no rings or glows.

Nothing decorative imitates data. 0.18 s colour transitions on buttons and links. Everything is disabled under `prefers-reduced-motion`.

## 10. Accessibility

- Visible focus: `outline: 2px solid var(--cyan); outline-offset: 3px`.
- A "Skip to content" link as the first Tab stop.
- Cues conveyed only by colour or position (sign, "plus"/"minus" operators, state) are also given as `sr-only` text. A net of 0 is announced as "no change".
- AA contrast against `--panel`; nothing below 12 px.
- Composite `aria-label`s on chips ("Lio Tanaka, −145 M, no sync for 4 d").

## 11. Voice and copy

- Direct, using the game's own terms: pilots, wallet, ISK, Balance, Income and Expenses, PvE, PvP, Trading, Logistics, ratting, ESS, killmail, courier, Omega, PLEX, "Today (EVE)".
- Three languages: Spanish (default), English and German. No fixed text in the design that cannot be translated; ESI names (items, systems, pilots) are not translated.
- Angle quotes «» in Spanish. Sentences that quantify instead of alarming: "2 of 4 pilots up to date · 12 min ago", not "Warning!". No exclamation marks or emoji.
- Numbers and dates in each language's format (`Intl`): "25 sept, 09:47" in Spanish, "25 Sept, 09:47" in English.

## 12. Don't

- Eyebrows above headings, section numbers, gradient text, cards inside cards.
- Cyan for data, data colours for the interface, red for warnings or system errors.
- Decorative rings, glows or pulses; entrance animations; parallax.
- Any fonts other than Inter, IBM Plex Mono (figures) and Barlow Condensed (wordmark only).
- Figures without a unit, or with different decimals in the same column; zeros where there is no data.
- CCP logos as the product's own identity (the footer carries the notice "EVE Online and all related marks are trademarks of CCP hf.").

## 13. Deliverable

- HTML + CSS with the tokens above as variables on `:root` (`color-scheme: dark`), fonts from `@fontsource` or Google Fonts.
- Two widths: 1280 px and 390 px, with no horizontal scroll on mobile.
- UI copy in Spanish (the default language) with believable sample data. Sample pilots are fictional (e.g. "Aria Vex", "Kade Morrow", "Lio Tanaka"): do not present invented figures as real.
- At the end, a short list of the components you used and any new piece you had to create.

## 14. What I want designed

[Describe the screen or flow here: who it is for, what question it answers, what data it has and when it is used.]
