import type { Content, EnemyDef, EnemyType } from '../content/types'
import type { Rng } from '../rng'

// The rules of one wave's fight, with no drawing. It is turn-based: Junior
// throws, then every Muddle still standing hits back, and round again until
// one side is down. FightView plays each event as it comes; the same class
// can run on its own to check balance.

export interface HeroStats {
  maxHealth: number
  attack: number
  armour: number
  /** 0 to 1 */
  critChance: number
  /** 0 to 1: share of damage dealt that heals Junior. */
  lifesteal: number
  /** Extra Muddles a throw bounces on to, at half damage. */
  ricochet: number
  /** Extra nuts thrown every turn. */
  extraNut: number
  /** 0 to 1: chance Junior goes again straight away. */
  doubleChance: number
  /** Extra nuts every Muddle drops. */
  moreNuts: number
}

export interface Foe {
  id: number
  type: EnemyType
  def: EnemyDef
  health: number
  maxHealth: number
  attack: number
  /** Place in the line, 0 nearest Junior. */
  slot: number
  alive: boolean
}

export interface Hit {
  foe: Foe
  damage: number
  crit: boolean
  /** Hit by a throw bouncing on from another Muddle. */
  ricochet: boolean
  killed: boolean
  /** Nuts this Muddle dropped, if the hit beat it. */
  nuts: number
}

export type FightEvent =
  | { type: 'enter'; foes: Foe[]; subwave: number; subwaves: number }
  | { type: 'throw'; shots: Hit[][]; heal: number; heroHealth: number; again: boolean }
  | { type: 'foesAttack'; attacks: { foe: Foe; damage: number }[]; heroHealth: number }
  | { type: 'won' }
  | { type: 'lost' }

export class FightSim {
  heroHealth: number
  readonly foes: Foe[] = []
  nutsDropped = 0
  outcome: 'won' | 'lost' | null = null

  private subwave = 0
  private turn: 'hero' | 'foes' = 'hero'
  /** The turn in progress is already Junior's extra one. */
  private bonusTaken = false
  private nextId = 1

  constructor(
    private readonly content: Content,
    private readonly wave: number,
    private readonly hero: HeroStats,
    heroHealth: number,
    private readonly rng: Rng,
  ) {
    this.heroHealth = heroHealth
  }

  get subwaves(): EnemyType[][] {
    return this.content.waves.waves[this.wave - 1]
  }

  get alive(): Foe[] {
    return this.foes.filter((foe) => foe.alive).sort((a, b) => a.slot - b.slot)
  }

  /** The next thing that happens, or null once the fight is over. */
  next(): FightEvent | null {
    if (this.outcome) return null
    if (this.heroHealth <= 0) {
      this.outcome = 'lost'
      return { type: 'lost' }
    }
    if (this.alive.length === 0) {
      if (this.subwave < this.subwaves.length) return this.enter()
      this.outcome = 'won'
      return { type: 'won' }
    }
    return this.turn === 'hero' ? this.heroTurn() : this.foesTurn()
  }

  /** Junior gets back up (a maths revive) and the fight carries on. */
  revive(health: number): void {
    this.heroHealth = health
    this.outcome = null
    this.turn = 'hero'
  }

  /** Plays the whole fight with no drawing. */
  runToEnd(): 'won' | 'lost' {
    while (this.next()) {
      // keep going
    }
    return this.outcome!
  }

  private enter(): FightEvent {
    const w = this.content.waves
    const grow = (share: number) => 1 + share * (this.wave - 1)
    const entering = this.subwaves[this.subwave].map((type, slot): Foe => {
      const def = w.enemies[type]
      const health = Math.round(def.health * grow(w.scalePerWave.health))
      return {
        id: this.nextId++,
        type,
        def,
        health,
        maxHealth: health,
        attack: Math.round(def.attack * grow(w.scalePerWave.attack) * 10) / 10,
        slot,
        alive: true,
      }
    })
    this.foes.push(...entering)
    this.subwave += 1
    this.turn = 'hero'
    return { type: 'enter', foes: entering, subwave: this.subwave, subwaves: this.subwaves.length }
  }

  private heroTurn(): FightEvent {
    const h = this.hero
    const shots: Hit[][] = []
    let dealt = 0
    for (let shot = 0; shot < 1 + h.extraNut; shot++) {
      const target = this.alive[0]
      if (!target) break
      const crit = this.rng() < h.critChance
      const hits = [this.strike(target, h.attack * (crit ? 2 : 1), crit, false)]
      // Ricochet on to the next Muddles in line, at half damage.
      const others = this.alive.filter((foe) => foe !== target)
      for (let r = 0; r < h.ricochet && r < others.length; r++) {
        hits.push(this.strike(others[r], h.attack * 0.5, false, true))
      }
      for (const hit of hits) dealt += hit.damage
      shots.push(hits)
    }
    const heal = Math.min(h.maxHealth - this.heroHealth, Math.round(dealt * h.lifesteal))
    this.heroHealth += heal
    // Double attack gives one extra turn at most, never a third in a row.
    const again = !this.bonusTaken && this.alive.length > 0 && this.rng() < h.doubleChance
    this.bonusTaken = again
    if (!again) this.turn = 'foes'
    return { type: 'throw', shots, heal, heroHealth: this.heroHealth, again }
  }

  private strike(foe: Foe, amount: number, crit: boolean, ricochet: boolean): Hit {
    const damage = Math.max(1, Math.round(amount))
    foe.health = Math.max(0, foe.health - damage)
    let nuts = 0
    if (foe.health === 0 && foe.alive) {
      foe.alive = false
      nuts = foe.def.nuts + this.hero.moreNuts
      this.nutsDropped += nuts
      // The ones behind step up to fill the gap.
      this.alive.forEach((other, i) => (other.slot = i))
    }
    return { foe, damage, crit, ricochet, killed: nuts > 0 || foe.health === 0, nuts }
  }

  private foesTurn(): FightEvent {
    const attacks = this.alive.map((foe) => ({
      foe,
      damage: Math.max(1, Math.round(foe.attack - this.hero.armour)),
    }))
    for (const attack of attacks) this.heroHealth = Math.max(0, this.heroHealth - attack.damage)
    this.turn = 'hero'
    return { type: 'foesAttack', attacks, heroHealth: this.heroHealth }
  }
}
