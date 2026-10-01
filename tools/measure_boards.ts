// Measures every pour board with no drawing, the same sweep as
// PourStage.measure(): cup x from 1 to 7 in 0.5 steps, seeds 7 and 8, both
// mirrored and not. Prints best/median/worst banked, lost, slowest pour and
// any gate no nut ever reached.
//
// Run (Node 22.18+ strips the types itself; no build step):
//   node tools/measure_boards.ts                 every board
//   node tools/measure_boards.ts zigzag funnel   only these ids
//   node tools/measure_boards.ts --nuts 24       a different cup size
//   node tools/measure_boards.ts --rows dam      also print each cup position and gate hit counts
//   node tools/measure_boards.ts --json out.json write the full rows too
//   node tools/measure_boards.ts --seeds 1,2,3   other seeds (default 7,8, as the game's measure)
//   node tools/measure_boards.ts --boards f.json measure another boards file
//
// Also lints each layout: walls that end near a side must reach it, no
// near-flat walls, gates inside the board and between y 4.2 and 12, and a
// moving gate's posts stay 0.5 clear of walls and sides across the swing.
// Exits with code 1 if anything fails. The 12 s limit is meant for 12 nuts;
// with --nuts 30 or more, a few boards that pour everything down long ramps
// go past it without losing anything.

import RAPIER from '@dimforge/rapier2d-compat'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PourSim } from '../src/pour/PourSim.ts'
import { makeRng } from '../src/rng.ts'
import type { BoardDef, Tuning } from '../src/content/types.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
let startNuts = 12
let jsonOut: string | null = null
let showRows = false
let seeds = [7, 8]
let boardsFile = join(root, 'public', 'content', 'boards.json')
const only: string[] = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--nuts') startNuts = Number(args[++i])
  else if (args[i] === '--json') jsonOut = args[++i]
  else if (args[i] === '--rows') showRows = true
  else if (args[i] === '--boards') boardsFile = args[++i]
  else if (args[i] === '--seeds') seeds = args[++i].split(',').map(Number)
  else only.push(args[i])
}

await RAPIER.init()
const tuning: Tuning = JSON.parse(readFileSync(join(root, 'public', 'content', 'tuning.json'), 'utf8'))
const boards: BoardDef[] = JSON.parse(readFileSync(boardsFile, 'utf8')).boards
const chosen = only.length ? boards.filter((b) => only.includes(b.id)) : boards

// ---- layout lint: the rules learned the hard way ------------------------
const WALL_R = 0.11
const segDist = (px: number, py: number, [x1, y1, x2, y2]: number[]) => {
  const dx = x2 - x1
  const dy = y2 - y1
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function lint(board: BoardDef): string[] {
  const W = tuning.board.width
  const out: string[] = []
  board.walls.forEach((w, i) => {
    const [x1, y1, x2, y2] = w
    for (const x of [x1, x2]) {
      if (x !== 0 && x !== W && (x < 0.6 || x > W - 0.6)) out.push(`wall ${i} ends ${x} from a side (run it to 0 or ${W})`)
    }
    const len = Math.hypot(x2 - x1, y2 - y1)
    const slope = (Math.atan2(Math.abs(y2 - y1), Math.abs(x2 - x1)) * 180) / Math.PI
    if (len > 0.3 && slope < 12) out.push(`wall ${i} is nearly flat (${slope.toFixed(0)} deg)`)
  })
  board.gates.forEach((g, i) => {
    if (g.x - g.w / 2 < -0.01 || g.x + g.w / 2 > W + 0.01) out.push(`gate ${i} pokes past a side`)
    if (g.y < 4.2 || g.y > 12) out.push(`gate ${i} at y ${g.y} is outside 4.2..12`)
    if (!g.move) return
    // Walk the posts along the whole swing and find the tightest gap to a wall or side.
    let gap = Infinity
    for (let k = 0; k <= 40; k++) {
      const cx = g.x - g.move.range / 2 + (g.move.range * k) / 40
      for (const side of [-1, 1]) {
        const px = cx + (side * g.w) / 2
        // Measured from the post's centre, as the project notes do.
        gap = Math.min(gap, px, W - px)
        for (const w of board.walls) gap = Math.min(gap, segDist(px, g.y, w) - WALL_R)
      }
    }
    if (gap < 0.5) out.push(`moving gate ${i}: posts come within ${gap.toFixed(2)} of a wall or side`)
  })
  return out
}

interface Row {
  mirror: boolean
  cupX: number
  seed: number
  banked: number
  lost: number
  seconds: number
  gateHits: number[]
}

function sweep(board: BoardDef, mirror: boolean): Row[] {
  const rows: Row[] = []
  for (let cupX = 1; cupX <= 7; cupX += 0.5) {
    for (const seed of seeds) {
      const sim = new PourSim({ board, tuning, startNuts, rng: makeRng(seed), mirror })
      const gateHits = sim.gates.map(() => 0)
      sim.listener = { gateHit: (gate) => (gateHits[gate.id] += 1) }
      const banked = sim.runToEnd(cupX)
      rows.push({ mirror, cupX, seed, banked, lost: sim.lost, seconds: Math.round(sim.time * 10) / 10, gateHits })
      sim.destroy()
    }
  }
  return rows
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const pad = (v: string | number, n: number) => String(v).padStart(n)
console.log(
  `${'board'.padEnd(18)} tier  best  median  worst  lost  maxSec  unreached gates   (${startNuts} nuts; best/worst = mean of the 2 seeds at a cup x)`,
)
const all: Record<string, Row[]> = {}
let failures = 0
const ids = new Set<string>()
for (const board of chosen) {
  const problems = lint(board)
  if (ids.has(board.id)) problems.push('duplicate id')
  ids.add(board.id)
  if (problems.length) {
    failures++
    console.log(`${board.id}: LAYOUT  ${problems.join('; ')}`)
  }
  for (const mirror of [false, true]) {
    const rows = sweep(board, mirror)
    all[`${board.id}${mirror ? ':mirror' : ''}`] = rows
    // Per cup position, average the two seeds: that is what a player aiming there gets.
    const byX = new Map<number, number[]>()
    for (const r of rows) byX.set(r.cupX, [...(byX.get(r.cupX) ?? []), r.banked])
    const means = [...byX.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length)
    const banked = rows.map((r) => r.banked)
    const lost = rows.reduce((a, r) => a + r.lost, 0)
    const maxSec = Math.max(...rows.map((r) => r.seconds))
    const hits = board.gates.map((_, i) => rows.reduce((a, r) => a + r.gateHits[i], 0))
    const unreached = hits.flatMap((h, i) => (h === 0 ? [`#${i}:${board.gates[i].type}`] : []))
    const bad = lost > 0 || unreached.length > 0 || maxSec > 12
    if (bad) failures++
    console.log(
      `${(board.id + (mirror ? ' (m)' : '')).padEnd(18)} ${pad(board.tier, 4)} ${pad(Math.round(Math.max(...means)), 5)} ${pad(
        Math.round(median(banked)),
        7,
      )} ${pad(Math.round(Math.min(...means)), 6)} ${pad(lost, 5)} ${pad(maxSec, 7)}  ${unreached.join(' ') || '-'}${bad ? '   <-- check' : ''}`,
    )
    if (showRows) {
      for (const [x, v] of byX) console.log(`    x ${x.toFixed(1)}: ${v.join(' / ')}`)
      console.log(`    gate hits: ${hits.map((h, i) => `#${i} ${board.gates[i].type} ${h}`).join(', ')}`)
    }
  }
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all, null, 1))
console.log(
  failures
    ? `\n${failures} problem(s) need a look.`
    : '\nAll boards pass: layout rules hold, nothing lost, every gate reached, all pours under 12 s.',
)
process.exitCode = failures ? 1 : 0
