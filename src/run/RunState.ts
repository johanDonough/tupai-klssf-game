import type { CardDef, Content, LevelDef, Stat } from '../content/types'
import type { HeroStats } from '../fight/FightSim'
import type { Rng } from '../rng'

// Everything about one run: which wave, how many nuts, which cards are owned.
// No drawing here, so the rules can be checked on their own.

export const TOTAL_WAVES = 15

/** One maths question as the player saw it. */
export interface AnswerLog {
  text: string
  answer: number
  /** What they gave; null if time ran out. */
  given: number | null
  correct: boolean
  /** What it was for, in words: "Heal Junior", "Ricochet", "Revive Junior". */
  forWhat: string
  wave: number
}

export class RunState {
  wave = 1
  /** Nuts in the bank, to spend in the shop. */
  nuts = 0
  /** Every nut banked this run, spent or not. This is the score. */
  score = 0
  rerolls = 0
  readonly owned = new Map<string, number>()
  readonly stats = new Map<Stat, number>()
  /** Junior's health carries over from wave to wave. */
  heroHealth: number
  /** A revive by maths question is allowed once per run. */
  revived = false
  getAllUsed = 0
  questionsAsked = 0
  questionsRight = 0
  /** Every maths question this run, for the end screen. */
  readonly answers: AnswerLog[] = []

  constructor(
    private readonly content: Content,
    private readonly rng: Rng,
    /** The difficulty picked on the title screen. */
    readonly level: LevelDef,
  ) {
    this.heroHealth = content.waves.hero.health
  }

  /** Junior's fighting numbers, from his base plus every card taken. */
  heroStats(): HeroStats {
    const base = this.content.waves.hero
    return {
      maxHealth: Math.round(base.health * (1 + this.stat('health') / 100)),
      attack: base.attack * (1 + this.stat('attack') / 100),
      armour: this.stat('armour'),
      critChance: this.stat('critChance') / 100,
      lifesteal: this.stat('lifesteal') / 100,
      ricochet: this.stat('ricochet'),
      extraNut: this.stat('extraNut'),
      doubleChance: this.stat('doubleChance') / 100,
      moreNuts: this.stat('moreNuts'),
    }
  }

  /**
   * Healing before a wave: a little for nothing, more for each right answer
   * in the wave quiz, plus the Second wind card.
   */
  healForWave(right: number): number {
    const max = this.heroStats().maxHealth
    const quiz = this.content.waves.waveQuiz
    const share = quiz.baseHeal + quiz.healPerRight * right + this.stat('healOnWave') / 100
    const heal = Math.min(max - this.heroHealth, Math.round(max * share))
    this.heroHealth += heal
    return heal
  }

  stat(stat: Stat): number {
    return this.stats.get(stat) ?? 0
  }

  timesOwned(card: CardDef): number {
    return this.owned.get(card.id) ?? 0
  }

  /** The cards taken so far, in the order they appear in the card list. */
  ownedCards(): { card: CardDef; times: number }[] {
    return this.content.cards.cards
      .filter((card) => this.timesOwned(card) > 0)
      .map((card) => ({ card, times: this.timesOwned(card) }))
  }

  isMaxed(card: CardDef): boolean {
    return this.timesOwned(card) >= card.max
  }

  price(card: CardDef): number {
    return Math.round(card.price * card.priceGrowth ** this.timesOwned(card))
  }

  canAfford(card: CardDef): boolean {
    return this.price(card) <= this.nuts
  }

  get rerollPrice(): number {
    const c = this.content.cards
    return Math.round(c.rerollPrice * c.rerollGrowth ** this.rerolls)
  }

  /** Nuts in the cup before any Muddle drops some. */
  cupStart(): number {
    return this.content.waves.cupBase + this.stat('startingNuts')
  }

  bank(nuts: number): void {
    this.nuts += nuts
    this.score += nuts
  }

  /** Takes the card, paying for it unless `free`. */
  take(card: CardDef, free = false): void {
    if (!free) this.nuts -= this.price(card)
    this.owned.set(card.id, this.timesOwned(card) + 1)
    const { stat, amount } = card.effect
    const maxBefore = this.heroStats().maxHealth
    this.stats.set(stat, this.stat(stat) + amount)
    // More max health heals by the same amount.
    this.heroHealth += this.heroStats().maxHealth - maxBefore
  }

  payForReroll(): void {
    this.nuts -= this.rerollPrice
    this.rerolls += 1
  }

  /**
   * Three different cards the player can still take. At least one is
   * affordable whenever any card is, so the shop is never a dead end.
   */
  offer(onlyCommon = false): CardDef[] {
    const c = this.content.cards
    const open = c.cards.filter((card) => !this.isMaxed(card) && (!onlyCommon || card.rarity === 'common'))
    const picks: CardDef[] = []
    const pool = [...open]
    while (picks.length < 3 && pool.length > 0) {
      const wantRare = !onlyCommon && this.rng() < c.rareChance
      const matching = pool.filter((card) => (card.rarity === 'rare') === wantRare)
      const from = matching.length > 0 ? matching : pool
      const card = from[Math.floor(this.rng() * from.length)]
      picks.push(card)
      pool.splice(pool.indexOf(card), 1)
    }
    if (!onlyCommon && !picks.some((card) => this.canAfford(card))) {
      const affordable = pool.filter((card) => this.canAfford(card))
      if (affordable.length > 0 && picks.length > 0) {
        picks[Math.floor(this.rng() * picks.length)] = affordable[Math.floor(this.rng() * affordable.length)]
      }
    }
    return picks
  }
}
