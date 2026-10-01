# Game cut: Tupai Nutty Hero

Status: approved by Johan with amendments, 1 Oct 2026. Working name and folder.

Lines marked **(decided)** are Johan's calls. Everything else is a proposal, and every number is a starting value to be tuned in play.

## What it is

A browser game for the Tupai booth at KLSSF (2–4 Oct 2026). One squirrel, one level, 15 waves. Each wave you fight, pour nuts through a board of gates to multiply them, and spend nuts on upgrades. Maths questions stand where ads stand in the reference game: answer one correctly and you get the upgrade without paying.

It is the first version of something Tupai keeps developing **(decided)**: later embedded in the Tupai website, with questions served from FalkorDB and art swapped through an admin CMS. So questions, boards, waves, cards, tuning and art all live in data files behind loaders, never in code.

## Decisions so far

| Area | Decision |
|---|---|
| Structure | No meta progression. One character, one level, 15 waves, boss on wave 15 **(decided)** |
| Theme | Nuts instead of balls **(decided)** |
| Maths | Replaces ads. 2-digit multiplication and division, 7-second limit **(decided)** |
| Answer format | Multiple choice for small rewards, number pad for big ones **(decided)** |
| Question scope | Friendly multiplication pairs; both division shapes; whole answers only **(decided)** |
| Difficulty | Starts easy, ramps by wave. Typed questions run one tier easier **(decided)** |
| Fight | Full lane fight **(decided)** |
| Run length | About 8 minutes for all 15 waves **(decided)** |
| End screen | Score plus a booth leaderboard **(decided)** |
| Devices | Visitors' phones and a booth device **(decided)** |
| Cards, enemies, boards | 12 cards, 5 enemy types, about 12 boards **(decided)** |
| Limits | One revive per run; "get all" at most three times **(decided)** |
| Language | English only **(decided)** |
| Art | Generated in Claude Design from the real Junior and nut assets, per the design system **(decided)**. Prompt: `docs/claude-design-art-prompt.txt` |
| Stack | Claude's choice; the priority is good graphics and animation **(decided)**. Chosen: PixiJS for drawing, Rapier 2D for physics, GSAP for animation, HTML/CSS for menus, TypeScript + Vite, static output |

## One wave, about 32 seconds

| Beat | Time | What happens |
|---|---|---|
| Run in | 2 s | Scenery scrolls, enemies walk on |
| Fight | 10–12 s | Automatic, turn-based. One or more sub-waves |
| Collect | 1–2 s | Nuts dropped by enemies fly into the cup |
| Pour | 8–10 s | Player drags the cup and releases; nuts fall through the gates |
| Shop | 6–8 s | Three cards; buy one with nuts, or take a maths question |

A maths question adds up to 7 seconds when the player chooses one.

## Fight

- Junior, Tupai's squirrel, stands on the left and throws nuts. Enemies enter from the right.
- Turn-based and automatic: the squirrel and each enemy act in turn. The player only watches.
- Two enemy behaviours: melee walks up and hits; ranged stops at a distance and shoots.
- Five enemy types from those behaviours: melee small, melee large, ranged small, ranged large, boss.
- Waves 1–6 have one group of 1–3 enemies. From wave 7, some waves have two sub-waves and up to 7 enemies. Wave 15 is the boss alone.
- Enemy health and damage rise each wave. The squirrel's base stats are fixed; only cards change them.
- Balance targets: buying nothing, a player falls around wave 6–8; average play reaches wave 10–12; good pouring and buying beats the boss.
- Each enemy drops nuts when it dies. Those nuts, plus any "starting nuts" card, are what the cup holds for the pour.

## Pour board

- Portrait board, 5 columns wide, walls and funnels as plain obstacles.
- Gate types for the weekend: multiply (×2 to ×5), subtract, moving, bouncer, mystery.
- Left for later: teleport pair, lock.
- Rules taken from the reference game: a gate acts once per nut; nuts travelling upward do not trigger gates; at most 400 nuts on screen, and beyond that each nut carries a value.
- About 12 boards of our own design, each usable mirrored, so about 24 layouts. Boards are data (`boards.json`), not code.
- Early waves get simple boards; later waves get boards with subtract gates and moving gates.
- One random gate is hidden as "???" on most boards.
- Pouring can't be skipped or lost: whatever reaches the catch cup is banked.

## Shop and cards

- Three cards offered after every pour. Buying one ends the shop.
- Prices are in nuts. A card's price rises each time it is bought again.
- Reroll costs nuts, and the cost rises with each reroll in a run.
- Two rarities: common and rare.

| Card | Rarity | Effect |
|---|---|---|
| Attack | Common | Throw damage up |
| Max health | Common | Health up, and heals that amount |
| Armour | Common | Flat damage reduction |
| Crit chance | Common | Chance of a double-damage throw |
| Heal on wave start | Common | Recover part of health each wave |
| Lifesteal | Rare | Heal for part of damage dealt |
| Ricochet | Rare | Throw bounces to one more enemy |
| Extra nut | Rare | Throw one more nut per turn |
| Double attack | Rare | Chance to act twice |
| Starting nuts | Common | Pour with 6 more nuts |
| More nuts | Rare | Each enemy drops one more nut |
| Upgrade gates | Rare | Three random gates on the next board gain +1× |

## Maths questions

Four places a question can be taken, all optional:

| Touchpoint | Reward | Format |
|---|---|---|
| Free reroll | New set of three cards | Multiple choice |
| Card you can't afford | That card, free | Multiple choice |
| Get all | All three cards | Number pad |
| Revive | Back to life at full health, once per run | Number pad |

- 7 seconds each. A wrong answer or a timeout means no reward, and that offer closes for the round. A failed revive ends the run.
- Tier by wave: waves 1–5 tier 1, waves 6–10 tier 2, waves 11–15 tier 3. Typed questions sit one tier lower, never below tier 1.
- The game picks multiply or divide first, then a question, so late waves are not mostly division.
- No question repeats within a run.
- "Get all" is offered at most three times a run.
- Number pad has no enter key: the answer is accepted the moment it is right, and marked wrong once the full length is typed incorrectly.
- Questions come from `questions/questions.json` (532 questions) through a question-source interface, so a FalkorDB-backed API can replace the file later.
- Every question asked and answered raises an event, so learner data can be captured later.

## Score, end screen and leaderboard

- Score is total nuts banked over the run. Waves cleared is the tiebreak.
- End screen shows score, waves cleared, questions answered correctly, play again, and a button to the Family Duo claim page.
- Leaderboard shows today's top 20 and the weekend's top 20.
- Nickname can be generated or typed **(decided)**. A generated two-word name is offered first; the player can type their own instead, up to 12 characters.
- Backend is a Google Sheet behind an Apps Script web app for the weekend **(decided)**, the same pattern as the registration page, in a separate Sheet. Johan deploys it; setup steps will be written like the registration page's.
- No cap on scores and no limit on submissions **(decided)**. Staff can delete rows in the Sheet.
- The game works with the leaderboard unreachable **(decided)**: it shows the player's best on this device and carries on.
- Proposed, not yet confirmed: typed names pass through a short blocked-word list.
- The leaderboard sits behind a switch in the config, so the game can ship without it.

## Devices

- Portrait play area, letterboxed on wide screens. Touch and mouse.
- Tuned for low-end Android on mobile data: first load size and frame rate get measured in the first playable slice.
- Booth mode (a setting in the address): idle attract screen, automatic reset between players, no scrolling or zooming.
- Page zoom, pull-to-refresh and text selection are turned off in the play area.

## Out of scope for the weekend

Heroes, gear, blessings, chapters, gems, ads, cutscenes, speed toggle, teleport and lock gates, accounts, sign-in, any personal data.

## Build order

Each slice is playable on its own. If Thursday runs out, the game ships at the last finished slice and the rest follows as an update during the festival.

1. Pour board: nuts, gates, catch cup, counter.
2. Wave loop and shop: nut prices, cards taking effect.
3. Maths questions at the four touchpoints, both formats.
4. Fight, in two stages: single lane with hits and health bars first, then sub-waves, ranged and melee behaviour, projectiles and the boss.
5. End screen, best score on this device, link to the claim page.
6. Leaderboard.
7. Booth mode, sound, polish.

## Open

- **Enemy concept.** "Muddles" is Claude's proposal in the art prompt, not yet confirmed.
- **Blocked-word list** for typed leaderboard names.
- **Claim page address** for the end-screen button.
- **Hosting.** GitHub Pages like the registration page, or a Tupai address.
- **Who reviews the question list** before it goes in front of the public.
