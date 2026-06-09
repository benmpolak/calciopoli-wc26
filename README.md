# The League — World Cunt 2026

Private draft fantasy World Cup 2026 game for four managers. A Calciopoli Production.

## What it is
- Snake draft over all 1,246 players from the 48 official FIFA final squads ("The Console")
- Squads of 15, **starting XI picked each gameweek** — only starters score (1 GK, 3–5 DF, 2–5 MF, 1–3 FW)
- 7 gameweeks: group matchdays 1–3, R32, R16, QF, semis+final
- **Head-to-head**: paired against a rival each gameweek (win 3 / draw 1 / loss 0), plus an overall points table
- **Weekly waiver draft**: every gameweek, one swap each from the Trough (the undrafted pool) — bottom of the table picks first
- **Trade desk**: agreed swaps between two managers, any time, doesn't use a waiver turn
- **Auto-subs**: a starter who never plays is replaced by your best bench player who did (keeps XI shape legal)
- **Country limit**: max 3 players per nation per squad (configurable at setup)
- Live scoring synced from ESPN's public World Cup feed, including in-play (no API key, no accounts)
- Pure static site — no backend, state lives in the browser (localStorage)

## Scoring (editable in Settings)
| Event | Points |
|---|---|
| Start | 2 |
| Sub appearance | 1 |
| Goal (GK/DF) | 6 |
| Goal (MF) | 5 |
| Goal (FW) | 4 |
| Assist | 3 |
| Clean sheet (GK/DF) | 4 |

No captains. No nonsense.

## How to run the league
1. Open the site, check the four manager names, hit **Randomise order & start the draft**
2. Run the draft together (one screen or screenshare) — snake order, position quotas enforced
3. After the draft: **Settings → Export league file**, send it to the WhatsApp group
4. Everyone else opens the site once and does **Settings → Import league file**
5. From then on it syncs results itself — points update on every visit

## Data
- Squads: Wikipedia's compilation of the official FIFA final 26-man lists (June 2026)
- Results/lineups/scorers: ESPN public API, fetched client-side
- Flags: flagcdn.com

## Local dev
```
python3 -m http.server 8123   # then open http://localhost:8123
```
`data/parse_squads.py` rebuilds `js/data.js` from the Wikipedia squads page if squads change.
