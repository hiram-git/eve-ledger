# Changelog

What changed in each version of the EVE Ledger desktop app. Every version is a [release](../../releases) with installers for Windows, macOS (Apple Silicon) and Linux, and the app updates itself when a new one is published.

When a new version changes the database, the app first saves a copy of it as an `update` backup (**Pilots → Backups**), so you can always go back.

## 1.0.0 — 2026-10-19

First stable release. EVE Ledger answers "am I making or losing ISK?" for all your EVE Online pilots, on your own computer: it reads your wallets, assets, losses, contracts, skills and loyalty points through ESI, keeps the history ESI drops after 30 days, and shows it as a Summary (net by activity, today, daily chart, pilots, inventory, market review), Lost ships (what they really cost you), Indicators (Omega for all your accounts, ratting ISK/h, deductions, fees, loyalty points…), Balances (a balance sheet, an income statement and a wallet reconciliation) and Doctrines (who can fly each fit, what it costs, what is missing). Everything stays local: no server, no account, read-only permissions, login with PKCE and no secrets to keep. Spanish, English and German.

Since 0.1.18:

- **Doctrines: rename and delete in the heading row.** The pencil and the bin sit at the right end of each doctrine's heading, so they are there with the doctrine folded too; the pencil is amber and the bin red (the bin of each fit as well). The rename field opens under the pencil.
- **Indicators → Loyalty points.** What each pilot has with each corporation (missions, faction warfare, your own corporation's projects) and what it is worth in ISK at the best exchange of that corporation's LP store, valued at ESI's average price (an estimate: not what Jita would pay). EverMarks, the loyalty points of Paragon, are shown apart: they can't become ISK. ESI only gives balances, so the change over the period (earned minus spent) is recorded from the first sync on. Needs a new optional permission: pilots linked before show "Loyalty points · optional" in Pilots; click it to grant it. The corporation's own LP wallet is not in ESI.
- **Summary: the pilot chips show the wallet balance.** The filter strip under the period tabs now shows what each pilot has in the wallet (and "All", the sum of the wallets), instead of the period net, which is already in the Net card and in the pilots table. A pilot without a sync shows "—"; stale data is greyed with its age, as before.
- **The daily chart is no longer scaled by PLEX.** A 4 B PLEX purchase used to set the axis at −5 B and flatten a month of 300 M days to a few pixels. The axis now leaves PLEX out; the day of the purchase is drawn clipped at the edge, hatched, with its figure as a label (the full figures stay in the tooltip and in the table).
- **The Net card compares like with like.** When the headline is the game result (PLEX apart, lost ships taken out), the comparison with the previous period is of that result too, not of the wallet net. The sentence under the headline is now a short equation: wallet net, PLEX, ships that didn't come back, still to replace, = result.
- **Fewer explanations, same figures.** The notes that explained decisions on every load are gone (what a loss costs, the definition of net and "between your pilots", the margin note under By activity); what quantifies (coverage, reconciliation, the age of prices) stays. The balance note now says what the balance is: ESI's wallet at the last sync.
- **Sync status that agrees with itself.** When the last automatic round failed for some pilot, the header badge says so in amber ("6 pilots with errors"; on a phone, "6 with errors"); the pilot chips get the amber dot for the same reasons as the health line (broken sync, no first sync, missing permission), not only for old data; pilots with the same cause share one health line ("6 pilots: wallet sync failed → Review") and "Review" names them for screen readers. The period tabs lose their three identical clock icons, and the net-worth card no longer stretches to the Net card's height with a stray warning icon.
- **One fact, one figure, one sign.** In the Net card the PLEX row now says what its sign means ("PLEX bought, added back to the result", with the count and the Omega link under it) and the second PLEX line at the card's foot, with the opposite sign, is gone; the lost-ships line keeps a single figure ("they cost you −385 M · See ships lost") and "of which −271 M already in the net, under PvP" moves to the Lost ships panel, whose donut centres now show "they cost you" (the slices leave out the estimate still to replace).
- **Where you earned today, whatever the inventory setting.** With "Wallets" the map used to disappear with the inventory; now a mini-map of the systems where you earned ISK today sits under "Today", sized by today's ISK. With "+ inventory" the net-worth card keeps the full map, as before.
- **No card repeating the active chip.** With "Wallets", the "Wallet balance" card (the same figure as the "All" chip 200 px above it) is gone; its Omega line, its coverage note and the "Wallets | + inventory" switch live at the foot of the Net card. The card returns with "+ inventory", as Net worth.
- **Small things on a phone.** The chart's keyboard hint shows only for keyboard focus (a tap used to bring it up); the language switch moves to the footer and the sync badge says how long ago the last round ran; the result equation keeps some air before the "Today" divider; a pilot whose portrait doesn't load shows their initials instead of an empty box.
- **Easier to tap on a phone.** Every control is at least 40 px tall: the "Change plan", "See the sums", "See the N skills" and "Add fit" disclosures and the plan file picker in Doctrines, the rename field and its "Save", the backup buttons and the backup file picker in Pilots, and the language switch. In the daily chart, where a day is only a few pixels wide, a tap anywhere on the plot now picks the nearest day and shows its figures. The "Wallets | + inventory" and "Omega | Alpha" switches are announced as groups by screen readers in a standards-compliant way.

Upgrading from 0.1.x:

- The app updates itself. This version adds the loyalty-point tables to the database; an `update` backup is saved first (**Pilots → Backups**).
- Loyalty points need a new optional permission: pilots linked before show "Loyalty points · optional" in Pilots. Click it and sign in with that pilot; everything else keeps working without it.
- The installers stay unsigned: it's a free, open project and signing certificates cost money every year. Windows (SmartScreen) and macOS (Gatekeeper) warn the first time; every release carries SHA-256 sums and a GitHub build attestation, and the install guide explains how to check them and get past the warning.
- Tested by hand on Windows and Linux. The macOS (Apple Silicon) build comes straight from CI and hasn't been tried on a Mac yet: reports are welcome.

## 0.1.18 — 2026-10-16

- **Faster with a long history.** With a year of data from a busy trader (100,000 wallet entries), the Summary loads in about 0.25 s instead of 0.7–1.7 s, and Indicators in 0.2 s instead of 1.4 s. Lost ships are worked out once and shared by the Summary, Lost ships and Indicators until something changes.
- **Upgrades tested from every published version.** An automated test opens a database from each earlier release (0.1.0 onwards) with the current app. It checks that the backup is made, that no wallet entry, transaction, asset or loss is lost and that the numbers match.
- **Check your download.** The installers stay unsigned (it's an open project; certificates cost money every year), but every release now includes SHA-256 sums for each installer and a GitHub build attestation proving it was built from this repository. The install guide explains how to check them and how to get past the first-run warning on Windows and macOS.
- **Doctrines: rename, fold and a compact view.** Asked for by the community.
  - A pencil next to each doctrine renames it in place (no more deleting a doctrine over a typo).
  - Each doctrine folds from its heading, which now says how many pilots fly at least one of its ships and how many ships have a pilot ("4 of 6 pilots · 3 of 5 ships"); folded doctrines stay folded on the next visit.
  - **Compact view** folds every fit to one line (ship, name, Jita cost, "4 of 6 pilots"); click a fit to expand it. The choice is remembered in your browser.
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
