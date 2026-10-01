# Tupai Nutty Hero

Browser game for the Tupai booth at KLSSF 2026.

- What the game is and what is decided: `docs/game-cut.md`
- Art brief for Claude Design: `docs/claude-design-art-prompt.txt`
- Question bank and how it is generated: `questions/`

## Run it

Double-click `start-dev.bat`. It prints two addresses: "Local" for this PC, and
"Network" for a phone on the same Wi-Fi.

To make the files that go on a web host: `npm run build`. The result is the
`dist` folder, which works from any address or inside an iframe.

Live: https://johandonough.github.io/tupai-klssf-game/ (add `?booth` on the
booth's own device). Every push to `main` rebuilds and republishes it
(`.github/workflows/deploy.yml`).

Pour boards are checked with `node tools/measure_boards.ts`: every gate
reachable, no nuts lost, pours under 12 seconds, layout rules (walls to the
sides, moving-gate clearance). Run it after changing `boards.json`.

## How it is put together

| Part | Where |
|---|---|
| Drawing | PixiJS |
| Physics | Rapier 2D, pinned to 0.19.0 (later releases are twice the download) |
| Animation | GSAP |
| Menus and text | Plain HTML and CSS |
| Boards, waves, cards, tuning | `public/content/*.json` |
| Art | `art-src/` (full size, from Claude Design) → `python tools/build_art.py` → `public/art/` |
| Card icons | `public/icons/` (Tabler, outline) |

`src/pour/PourSim.ts` holds the rules and physics of a pour and draws nothing.
`src/pour/PourView.ts` draws it. Because the two are separate, a board can be
measured without showing it: in the browser console,
`nutGame.measure('funnel')` lists what each cup position banks.

`src/run/RunState.ts` holds a run's rules (nuts, cards, prices, Junior's
health); `src/run/Run.ts` plays the waves in order. `src/fight/FightSim.ts` is
the fight's rules with no drawing, `src/fight/FightView.ts` draws it.

Add `?bench` to the address to pour any board on its own, without waves.

## Built so far

- Slice 1: the pour board.
- Slice 2: the full run. Free opening pick, 15 waves, 12-card shop with rising
  prices and reroll, end screen.
- Slice 4: the fight. Turn-based lane battle between Junior and the Muddles,
  with walk-ins, throws, ricochets, crits, hits, knock-outs and nuts flying into
  the cup; the board slides in for the pour and out again after the shop.
- 13 boards (26 with mirroring), with teleport pairs and locks.

- Slice 3: maths questions. In the shop, "Solve it" wins a card you cannot
  afford, "Free reroll" and "Get all 3" (typed, three a run) trade a question
  for a reroll or all three cards; when Junior falls, one typed question per
  run revives him. 7 seconds each, harder as the waves go on, typed ones a
  tier easier. Every answer raises a `tupai-nutty-hero:answer` event on
  `window` (question, answer given, right or wrong, time taken, what it was
  for) so learner data can be collected later.

Add `?boards` to the address to see every board at once.

- Slice 5: title screen before every run; end screen with the best score on
  this device and a button to the Family Duo claim page.
- Slice 6: booth leaderboard (today's and the weekend's top 20) on a Google
  Sheet: `leaderboard/Code.gs`, set up with `leaderboard/SETUP.md`. Names are
  made up for the player or typed; the Sheet checks typed names against its
  "Blocked words" tab. The game plays on if the Sheet can't be reached.
- Slice 7: booth mode and sound. Add `?booth` to the address on the booth's
  own device: tap-anywhere title screen showing today's top score, no zoom or
  long-press, a "Still playing?" prompt after a minute untouched and a fresh
  start 10 seconds later, and the claim page shown as a QR code to scan.
  Sounds and music are in `public/audio/` with `manifest.json` (which file
  plays for what, and how loud); sources and licences in `audio-src/SOURCES.md`.
- Tapping the upgrade icons under the wave bar pauses the game and shows
  Junior's upgrades.

- Levels: Junior (Easy), Tupai (Normal), Tupai Hero (Hard), picked after
  Play. Each has its own question bank (`public/content/questions-easy.json`,
  `questions-normal.json`, `questions.json`; the first two are built by
  `questions/build_banks_easy_normal.py`) and its own leaderboard.
- "How to play": story-style tutorial slides with looping animations, ending
  on the level choice.
- End screen: maths report (score, a dot per question, and every question
  with the player's answer and the right one).
- Wave quiz zooms in on Junior; hits flash red; crits shake the lane; armour
  shows as a leafy shield; lifesteal sends green sparks back to Junior.
  Shapes for these are drawn in code (`src/fight/effects.ts`).

Settings that change without code (claim page address, leaderboard address,
booth idle time): `public/content/config.json`.