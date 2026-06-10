# Memo: Build "The League — EPL Edition" (2026/27 season)

For a future Claude session. Ben wants the World Cup draft game rebuilt for the Premier League next season, same four managers (Ben Polak — commissioner, Mrc Cnwy, Iain Tussie, Rick Blank), same Calciopoli universe.

## Start here
- **Fork `~/worldcup-draft`** — don't start from scratch. The architecture is proven: static site on GitHub Pages + Firebase RTDB for multiplayer + client-side scoring from a public feed. Read its README and `project_wc26_draft.md` in memory first.
- Reuse the Firebase project `calciopoli-wc26` (Spark free tier, RTDB in europe-west1) — just use a new league key like `leagues/calciopoli-epl-2627`. Rules already allow any `/leagues/$league`. Firebase CLI is logged in on Ben's Mac as benmpolak@googlemail.com.
- New public repo + Pages site (e.g. `calciopoli-epl`), gh CLI authenticated as benmpolak.

## The big data win: use the official FPL API
Replace ESPN + Wikipedia entirely. `https://fantasy.premierleague.com/api/bootstrap-static/` gives, free and keyless:
- Every PL player with team, position, status (injured/suspended/doubtful + news text), photos
- **Official FPL points per player per gameweek** (`/api/event/{gw}/live/`) — no homemade scoring engine needed unless they want custom rules
- Gameweek schedule incl. deadlines, double/blank gameweeks, fixtures (`/api/fixtures/`)
- CORS: the FPL API blocks browser CORS — verify first; if blocked, fall back to ESPN (`site.api.espn.com/.../soccer/eng.1/...`, CORS-open, same pattern as the WC build) or a tiny scheduled fetch (GitHub Action writing a JSON into the repo daily/hourly works fine and keeps the no-backend model).
- Player photos: `https://resources.premierleague.com/premierleague/photos/players/110x140/p{photo_code}.png`.

## What carries over unchanged
- Multiplayer sync layer (`js/sync.js` + shared/derived state split: decisions in RTDB, scores derived locally)
- Snake draft Console with pick timer (30s + 2 timewastes), turn enforcement via RTDB transactions
- Identity model: "Who are you?" honour system; commissioner override; optional PIN upgrade was designed but never built — Ben was interested, consider building it for a 38-week season (impersonation matters more over 9 months than one draft night)
- Punditry Desk (Prutton/Big Al/Redknapp/McCoisty — fits the EPL even better), Moggi/Calciopoli jokes, opening ceremony + North London Forever (Marc = Arsenal), drinks breaks, Lobus Klaxon (sponsored by Ali Daei), demo mode, Rules tab, sim test harness pattern (`test/sim.test.js`, puppeteer-core)

## What must change for the EPL
1. **38 gameweeks** vs 8 — H2H needs a proper fixture schedule (each pair meets ~12-13 times; or split season into phases). Consider months as H2H rounds, or just dual tables (H2H + total).
2. **Squad churn**: injuries, transfers in January, suspensions — weekly lineups + waivers become the core loop, not an afterthought. FPL status flags should surface in the My Team screen ("Saka 75% — knock").
3. **Waivers**: they ended up with: open Trough (1 swap/GW) early, a mid-season "Re-Draft" event (ordered, bottom-first, multi-swap until a lap of passes — `waiverMode`/`waiverState` in app.js), ordered waivers late. For EPL, suggest: ordered weekly waivers (bottom first) + a January re-draft window. Ask them.
4. **Club cap** instead of country cap (e.g. max 2-3 per PL club; the WC build has phased caps — `countryCapNow` — reuse the pattern).
5. **Squad/quota sizes**: ask. WC settled on 23 (3 GK/7 DF/7 MF/6 FW); EPL drafts usually 15 with weekly XI.
6. **Scoring**: simplest is to adopt official FPL points wholesale (they're in the API per player per GW) — kills the whole stat-parsing layer. Their WC scoring was: start 2 / sub 1 / goals 6-6-5-4 / assist 3 / CS 4 GK-DF, no captains. Ask which they want.
7. **Deadlines**: lineup lock at each GW deadline (API provides it) — the WC build never locked lineups (honour system); a long season probably wants real locking.

## Lessons learned (hard-won, don't repeat)
- Simulate the full season through the real app in a headless browser before launch — the WC sim caught: short lineups after transfers, auto-sub edge cases, waiver order reshuffling mid-round (freeze order from completed-GW standings only), timer/drinks-break race, ceremony replay flag.
- RTDB drops empty arrays — normalize all incoming arrays with `toArr()`.
- Empty-cloud semantics: non-commissioner devices adopt a wipe; commissioner gets a confirm before restoring. Prevents zombie leagues.
- Deterministic comedy: seed pundit lines/facts by pick number + player id so all devices show the same thing without syncing.
- Ben's taste: ship working things fast, gimmicks matter ("I'm mainly in it for the gimmicks"), recommendation-not-options, no asking permission for reversible work. Marc generates feature requests in WhatsApp; Ben forwards them; Iain hates pomp (which is why there's so much of it).

## Open questions for Ben at kickoff
Squad size + quotas? Adopt official FPL scoring or custom? H2H format across 38 GWs? Club cap number? PINs yes/no? League name (working title: "The League — Calciopoli Premier 26/27")?
