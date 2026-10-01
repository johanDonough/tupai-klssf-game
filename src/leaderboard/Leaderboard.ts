import type { LevelId } from '../content/types'

// The booth leaderboard: a Google Sheet behind an Apps Script web app
// (leaderboard/Code.gs). The game never depends on it. If the address is
// empty or the Sheet cannot be reached, every call quietly answers null and
// the end screen shows the player's best on this device instead.

export interface BoardRow {
  name: string
  score: number
  wave: number
  won: boolean
}

export interface LevelBoard {
  today: BoardRow[]
  weekend: BoardRow[]
}

/** Each difficulty has its own board, with today's and the weekend's top scores. */
export interface Board {
  day: string
  levels: Partial<Record<LevelId, LevelBoard>>
  /** The Sheet is still on the first script: one board shared by every level. */
  shared?: boolean
}

export interface ScoreEntry {
  name: string
  score: number
  wave: number
  won: boolean
  mathsRight: number
  mathsAsked: number
  /** Sent again on a retry, so the same run is never counted twice. */
  run: string
  level: LevelId
}

export type SubmitResult =
  | { ok: true; todayRank: number | null; weekendRank: number | null }
  | { ok: false; reason: 'name' | 'invalid' | 'busy' | 'offline' }

const TIMEOUT_MS = 8000

export class Leaderboard {
  constructor(private readonly url: string) {}

  get enabled(): boolean {
    return this.url !== ''
  }

  async board(): Promise<Board | null> {
    if (!this.enabled) return null
    try {
      const data = await this.call(fetch(`${this.url}?action=board`, { redirect: 'follow', signal: timeout() }))
      if (data.levels && typeof data.levels === 'object') return data as unknown as Board
      // A Sheet still on the first script has one board for everyone.
      if (Array.isArray(data.today) && Array.isArray(data.weekend)) {
        const shared = { today: data.today as BoardRow[], weekend: data.weekend as BoardRow[] }
        return { day: String(data.day), levels: { easy: shared, normal: shared, hard: shared }, shared: true }
      }
      return null
    } catch {
      return null
    }
  }

  async submit(entry: ScoreEntry): Promise<SubmitResult> {
    if (!this.enabled) return { ok: false, reason: 'offline' }
    try {
      // Plain text, so the browser makes one simple request; the body is still JSON.
      const data = await this.call(
        fetch(this.url, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'score', ...entry }),
          signal: timeout(),
        }),
      )
      if (data.ok === true) {
        return { ok: true, todayRank: (data.today_rank as number) ?? null, weekendRank: (data.weekend_rank as number) ?? null }
      }
      const reason = data.reason
      return { ok: false, reason: reason === 'name' || reason === 'invalid' || reason === 'busy' ? reason : 'offline' }
    } catch {
      return { ok: false, reason: 'offline' }
    }
  }

  private async call(request: Promise<Response>): Promise<Record<string, unknown>> {
    const response = await request
    if (!response.ok) throw new Error(String(response.status))
    return (await response.json()) as Record<string, unknown>
  }
}

function timeout(): AbortSignal {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), TIMEOUT_MS)
  return controller.signal
}

/** Names allowed in the Sheet: English letters, digits and spaces, up to 12. */
export const NAME_MAX = 12

export function cleanName(text: string): string {
  return text.replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').slice(0, NAME_MAX)
}

const FIRST = ['Brave', 'Swift', 'Smart', 'Happy', 'Lucky', 'Sunny', 'Jolly', 'Zippy', 'Nutty', 'Super', 'Turbo', 'Mega', 'Ace', 'Bold', 'Quick', 'Witty', 'Keen', 'Cool', 'Epic', 'Comet']
const SECOND = ['Acorn', 'Pecan', 'Almond', 'Cashew', 'Walnut', 'Peanut', 'Hazel', 'Tupai', 'Kacang', 'Squirrel', 'Chestnut', 'Sprout', 'Maple', 'Pine']

/** A friendly two-word name that fits in 12 letters, like "Zippy Pecan". */
export function makeName(random: () => number = Math.random): string {
  for (;;) {
    const name = `${FIRST[Math.floor(random() * FIRST.length)]} ${SECOND[Math.floor(random() * SECOND.length)]}`
    if (name.length <= NAME_MAX) return name
  }
}

/** The best score on this device for each level, kept in the browser. */
export const deviceBest = {
  get(level: LevelId): number {
    try {
      return Number(localStorage.getItem(`tupai-nutty-hero:best:${level}`)) || 0
    } catch {
      return 0
    }
  },
  set(level: LevelId, score: number): void {
    try {
      localStorage.setItem(`tupai-nutty-hero:best:${level}`, String(score))
    } catch {
      // Private mode or storage blocked: the best just isn't kept.
    }
  },
}
