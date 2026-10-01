# Audio sources — Tupai Nutty Hero

Every sound in `public/audio/` comes from the packs below. **All are CC0 (public domain).**
Licence verified on each asset page on 2026-10-01 (Kenney pages state "Creative Commons CC0";
each Kenney zip also ships a `License.txt` saying CC0). No Cup Heroes / Voodoo audio is used.

Rebuild everything with `python audio-src/build_audio.py` (needs ffmpeg; numpy). The script holds the
exact source-file → game-sound mapping, layer gains, trims and target levels.

## Packs and tracks

| Pack / track | Author | Page | Licence | Folder here |
|---|---|---|---|---|
| Interface Sounds 1.0 | Kenney | https://kenney.nl/assets/interface-sounds | CC0 1.0 | `kenney/interface-sounds/` |
| Impact Sounds | Kenney | https://kenney.nl/assets/impact-sounds | CC0 1.0 | `kenney/impact-sounds/` |
| Casino Audio | Kenney | https://kenney.nl/assets/casino-audio | CC0 1.0 | `kenney/casino-audio/` |
| RPG Audio | Kenney | https://kenney.nl/assets/rpg-audio | CC0 1.0 | `kenney/rpg-audio/` |
| Digital Audio | Kenney | https://kenney.nl/assets/digital-audio | CC0 1.0 | `kenney/digital-audio/` |
| Music Jingles | Kenney | https://kenney.nl/assets/music-jingles | CC0 1.0 | `kenney/music-jingles/` |
| UI Pack (sounds only used) | Kenney | https://kenney.nl/assets/ui-pack | CC0 1.0 | `kenney/ui-pack/` |
| UI Audio (downloaded, not used) | Kenney | https://kenney.nl/assets/ui-audio | CC0 1.0 | `kenney/ui-audio/` |
| Children's March Theme (64 s, seamless loop) | Cleyton Kauffman | https://opengameart.org/content/childrens-march-theme | CC0 (page licence + readme.txt in zip) | `music/childrens-march-theme/` |
| Happy Clappy Loop (17 s, alternate, not used) | OwlishMedia | https://opengameart.org/content/happy-clappy-loop | CC0 | `music/HappyClappyLoop.wav` |

Credit is not required by CC0. Kenney and Cleyton Kauffman both ask for (optional) credit:
"Sound effects by Kenney (kenney.nl)" and "Music by Cleyton Kauffman — soundcloud.com/cleytonkauffman".

## Game sound → source file

Paths are relative to `audio-src/kenney/` unless noted. "+" means layered (mixed) together.

| Game file | Source(s) |
|---|---|
| `bgm.mp3` | `music/childrens-march-theme/Children's March Theme.wav` (full 64 s, untrimmed so the loop point is kept) |
| `throw-1/2/3.mp3` | `casino-audio/Audio/card-slide-1 / -5 / -6.ogg` |
| `hit-1.mp3` | `impact-sounds/Audio/impactWood_light_000.ogg` + `impactSoft_medium_000.ogg` (−6 dB) |
| `hit-2.mp3` | `impactWood_light_002.ogg` + `impactSoft_medium_002.ogg` (−6 dB) |
| `hit-3.mp3` | `impactWood_light_004.ogg` + `impactSoft_medium_004.ogg` (−6 dB) |
| `crit.mp3` | `impactPunch_medium_001.ogg` (−2 dB) + `impactWood_light_001.ogg` + `interface-sounds/Audio/glass_002.ogg` (−8 dB) |
| `foe-attack.mp3` | `rpg-audio/Audio/dropLeather.ogg` + `impact-sounds/Audio/impactSoft_heavy_000.ogg` (−4 dB) |
| `beaten.mp3` | `interface-sounds/Audio/drop_004.ogg` |
| `nut-drop-1/2.mp3` | `casino-audio/Audio/chips-collide-2 / -3.ogg` |
| `pour-gate.mp3` | `interface-sounds/Audio/pluck_001.ogg` (cut to 100 ms) |
| `bounce.mp3` | `digital-audio/Audio/phaserUp5.ogg` |
| `lock-break.mp3` | `rpg-audio/Audio/metalLatch.ogg` + `impact-sounds/Audio/impactPlank_medium_002.ogg` (−3 dB) |
| `portal.mp3` | `interface-sounds/Audio/maximize_004.ogg` |
| `bank-1/2.mp3` | `casino-audio/Audio/chips-stack-2 / -5.ogg` |
| `card-buy.mp3` | `interface-sounds/Audio/confirmation_001.ogg` |
| `button.mp3` | `ui-pack/Sounds/tap-a.ogg` |
| `correct.mp3` | `interface-sounds/Audio/confirmation_002.ogg` |
| `wrong.mp3` | `interface-sounds/Audio/question_004.ogg` |
| `tick.mp3` | `interface-sounds/Audio/tick_004.ogg` |
| `wave-start.mp3` | `music-jingles/Audio/Pizzicato jingles/jingles_PIZZI15.ogg` |
| `win.mp3` | `music-jingles/Audio/Pizzicato jingles/jingles_PIZZI02.ogg` |
| `lose.mp3` | `music-jingles/Audio/Pizzicato jingles/jingles_PIZZI01.ogg` |
| `revive.mp3` | `music-jingles/Audio/Steel jingles/jingles_STEEL10.ogg` |

## Processing (build_audio.py)

- Effects: mono, 44.1 kHz, MP3 96 kbps; leading silence trimmed (2 ms of attack kept); tails trimmed
  below −55 dB; long ones capped with a short fade-out; each normalised so its loudest 50 ms sits at a
  per-sound target (−12 to −18 dBFS), peaks capped at −1 dBFS.
- Music: stereo, 44.1 kHz, MP3 128 kbps, gain to about −17 dBFS RMS, not trimmed.
- Mix balance between sounds is set by the `volume` table in `public/audio/manifest.json`.
