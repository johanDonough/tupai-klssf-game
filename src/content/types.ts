// Shapes of the content files in public/content. Everything the game shows or
// tunes comes through these, so a CMS or an API can replace the files later
// without touching game code.

export type Wall = [x1: number, y1: number, x2: number, y2: number]

export interface GateMove {
  range: number
  period: number
}

interface GateBase {
  x: number
  y: number
  w: number
  move?: GateMove
}

export interface MultiplyGateDef extends GateBase {
  type: 'multiply'
  value: number
}

export interface SubtractGateDef extends GateBase {
  type: 'subtract'
  /** Share of the nuts you started the pour with that this gate swallows. */
  fraction: number
}

export interface BounceGateDef extends GateBase {
  type: 'bounce'
}

/** Two teleport gates with the same pair name send nuts to each other. */
export interface TeleportGateDef extends GateBase {
  type: 'teleport'
  pair: string
  /** An exit only: nuts that fall into it are not sent anywhere. */
  exitOnly?: boolean
}

/** A solid bar that holds nuts until enough have landed on it, then breaks. */
export interface LockGateDef extends GateBase {
  type: 'lock'
  /** Share of the nuts you started the pour with that must land on it. */
  fraction: number
}

export type GateDef = MultiplyGateDef | SubtractGateDef | BounceGateDef | TeleportGateDef | LockGateDef

export interface BoardDef {
  id: string
  name: string
  tier: number
  /** Whether one gate may be hidden behind "?" until a nut touches it. */
  hideOne: boolean
  walls: Wall[]
  gates: GateDef[]
}

export interface Tuning {
  board: {
    width: number
    height: number
    cupY: number
    cupRange: number
    funnelTopY: number
    funnelBottomY: number
    basketHalfWidth: number
    basketFloorY: number
  }
  nut: {
    radius: number
    restitution: number
    linearDamping: number
    pourPerSecond: number
    maxOnScreen: number
  }
  physics: {
    gravity: number
    stepsPerSecond: number
  }
  gate: {
    height: number
    bounceSpeed: number
    bounceAngleDegrees: number
    maxBouncesPerNut: number
  }
  pour: {
    hideOneChance: number
    stuckSeconds: number
    maxSeconds: number
  }
  lock: {
    /** Nuts piled this high above a lock (board units) weigh on it too. */
    pileHeight: number
    /** A nut on the pile counts once it has slowed below this speed. */
    settleSpeed: number
    /** Once a lock holds enough, it creaks this long before it snaps. */
    creakSeconds: number
  }
}

export type Stat =
  | 'attack'
  | 'health'
  | 'armour'
  | 'critChance'
  | 'healOnWave'
  | 'startingNuts'
  | 'lifesteal'
  | 'ricochet'
  | 'extraNut'
  | 'doubleChance'
  | 'moreNuts'
  | 'upgradeGates'

export interface CardDef {
  id: string
  name: string
  /** "{amount}" is replaced with the effect amount. */
  description: string
  /** Every copy taken so far together: "{total}" is the sum, "{s}" an s when above 1. */
  total: string
  rarity: 'common' | 'rare'
  icon: string
  /** Tint for the icon, e.g. green for armour, blue for ricochet. */
  colour: string
  price: number
  priceGrowth: number
  max: number
  effect: { stat: Stat; amount: number }
}

export interface CardFile {
  rerollPrice: number
  rerollGrowth: number
  rareChance: number
  /** Time limit on every maths question, in seconds. */
  questionSeconds: number
  /** How many "Get all 3" questions one run allows. */
  getAllPerRun: number
  /** Chance a shop offers "Get all 3" at all, so it is a lucky find, not a habit. */
  getAllChance: number
  /** First wave whose shop can offer "Get all 3". */
  getAllFromWave: number
  cards: CardDef[]
}

export type EnemyType = 'melee-small' | 'melee-large' | 'ranged-small' | 'ranged-large' | 'boss'

export interface EnemyDef {
  name: string
  nuts: number
  health: number
  attack: number
  range: 'melee' | 'ranged'
}

export interface WaveFile {
  cupBase: number
  hero: { health: number; attack: number }
  /** The maths quiz before every wave. */
  waveQuiz: {
    questions: number
    /** Share of max health healed with no right answers. */
    baseHeal: number
    /** Extra share healed for each right answer. */
    healPerRight: number
    /** At full health: bonus nuts per right answer, by question tier (1 to 3). */
    nutsPerRight: number[]
  }
  scalePerWave: { health: number; attack: number }
  enemies: Record<EnemyType, EnemyDef>
  /** Each wave is a list of sub-waves; each sub-wave lists the Muddles in it. */
  waves: EnemyType[][][]
}

export type LevelId = 'easy' | 'normal' | 'hard'

/** A difficulty: which questions are asked, and which leaderboard the score goes on. */
export interface LevelDef {
  id: LevelId
  /** "Junior", "Tupai", "Tupai Hero" */
  name: string
  /** "Easy", "Normal", "Hard" */
  label: string
  blurb: string
  /** Question bank file in content/. */
  questions: string
}

export interface GameConfig {
  levels: LevelDef[]
  claimUrl: string
  claimLabel: string
  claimNote: string
  /** The registration page's Sheet web app; the claim button hides once both lists are full. */
  claimStatusUrl: string
  /** Empty to play without a leaderboard. */
  leaderboardUrl: string
  boothIdleSeconds: number
}

export interface Content {
  tuning: Tuning
  boards: BoardDef[]
  cards: CardFile
  waves: WaveFile
  config: GameConfig
}
