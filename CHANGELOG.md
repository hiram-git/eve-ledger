# Changelog

What changed in each version of the EVE Ledger desktop app. Every version is a [release](../../releases) with installers for Windows, macOS (Apple Silicon) and Linux, and the app updates itself when a new one is published.

When a new version changes the database, the app first saves a copy of it as an `update` backup (**Pilots → Backups**), so you can always go back.

## Unreleased

- **Faster with a long history.** With a year of data from a busy trader (100,000 wallet entries), the Summary loads in about 0.25 s instead of 0.7–1.7 s, and Indicators in 0.2 s instead of 1.4 s. Lost ships are worked out once and shared by the Summary, Lost ships and Indicators until something changes.
- **Upgrades tested from every published version.** An automated test opens a database from each earlier release (0.1.0 onwards) with the current app. It checks that the backup is made, that no wallet entry, transaction, asset or loss is lost and that the numbers match.
- **Check your download.** The installers stay unsigned (it's an open project; certificates cost money every year), but every release now includes SHA-256 sums for each installer and a GitHub build attestation proving it was built from this repository. The install guide explains how to check them and how to get past the first-run warning on Windows and macOS.
- **Doctrines: rename and fold.** A pencil next to each doctrine renames it in place (no more deleting a doctrine over a typo). Each doctrine folds from its heading, which now says how many pilots fly at least one of its ships and how many ships have a pilot ("4 of 6 pilots · 3 of 5 ships"); folded doctrines stay folded on the next visit. Both were asked for by the community.
- **Issue templates** for bugs, numbers that don't add up and ideas. None of them ask for your database or your settings.

## 0.1.17 — 2026-10-13

- **Indicators → Deductions:** what never reaches your wallet from PvE.
  - **Corporation tax, exact.** What each corporation kept from your bounties, ESS and missions, with its rate. ESI reports it with every payout, already taken out of what you're paid, so your net doesn't change. If the corporation is yours, that ISK is still in its wallet.
  - **Incursion penalty, estimated.** Bounties in an incursion's constellation pay half. ESI only lists active incursions, so EVE Ledger records them on every sync from this version on; anything earlier can't be known.
  - **Your ratting ISK/h without deductions**, next to what you actually make.
- **Ratting by system** tags the systems whose bounties an incursion halved.

## 0.1.16 — 2026-10-12

- **CCP license agreement.** Requests to ESI now name the app, its source code and the contact you set in Settings. A new **Legal notice** page, linked from the footer, explains what EVE Ledger is and isn't, what it reads from ESI, and includes CCP's notice and the license.

## 0.1.15 — 2026-10-11

- **Real wallet balances.** The balance of each pilot now comes straight from the ESI wallet. The journal can lag an hour behind, and it has nothing for a pilot who hasn't moved ISK in 30 days. Balances shows the difference as "Not in the journal yet".

## 0.1.14 — 2026-10-11

First public release.

- **Summary.** Net by activity (PvE, PvP, trading, logistics, other) for all your pilots or one, today's result, a daily chart, the pilots table, inventory and a market review. PLEX bought for your accounts is kept apart, and transfers between your pilots never count as income.
- **Lost ships.** What a loss really cost you: the replacement your pilots bought afterwards (hull, the same or equivalent modules, cargo), the courier that moved it and the insurance, plus anything you never replaced.
- **Doctrines.** EFT fits and EVEMon plans: who can fly each fit today, what's missing and how long it takes to train, whether it needs Omega, and what it costs at the lowest Jita price, injectors included, against your wallets.
- **Indicators.** Omega for all your accounts against your wallets and your daily pace, ratting ISK/h by pilot and by system, lost ships in hours of ratting, market fees, your days in the green and where your ISK is.
- **Balances.** A balance sheet, an income statement and a wallet reconciliation.
- **Citadel names** with the optional structures permission.
- **Your history, kept.** System tray, start with the system, sync every hour, a daily backup, and restoring a backup without restarting.
- **English, Spanish and German.**

Pilots linked with a Client Secret in versions before 0.1.13 need to be linked again (**Pilots → Relink**); their history is kept.

Versions 0.1.0 to 0.1.13 were private builds.
