import { Application } from 'pixi.js'
import gsap from 'gsap'
import RAPIER from '@dimforge/rapier2d-compat'
import { sound } from './audio/sound'
import { Art, POUR_ART } from './content/art'
import { contentUrl, loadContent } from './content/load'
import type { LevelDef, LevelId } from './content/types'
import { FileQuestionSource, type QuestionSource } from './questions/questions'
import { makeRng } from './rng'
import { BoardGallery } from './dev/BoardGallery'
import { PourHarness } from './dev/PourHarness'
import { PourStage } from './pour/PourStage'
import { Run } from './run/Run'
import { font } from './theme'

export interface Game {
  pour: PourStage
  run?: Run
  bench?: PourHarness
  measure: PourStage['measure']
  /** Speeds up every menu animation, for testing: speed(10). */
  speed: (factor: number) => void
  /** Advances menu animations by hand, for testing in a hidden tab. */
  tick: () => void
  /** The music and sound player, for checks in the browser console. */
  sound: typeof sound
}

/**
 * Starts the game inside `host`. This is the one entry point a page needs,
 * whether the game is on its own page or embedded in another site.
 * Add ?bench to the address for the board test bench, or ?boards to see
 * every board at once, instead of a run. ?booth runs it as the booth's own
 * device: attract screen, no zooming, reset when left alone.
 */
/**
 * One question source per level. A bank that fails to load falls back to the
 * Hard bank, so a missing file never stops the game.
 */
async function loadQuestionBanks(levels: LevelDef[]): Promise<Record<LevelId, QuestionSource>> {
  const rng = makeRng(Date.now() % 1_000_000)
  const load = (file: string) => FileQuestionSource.load(contentUrl(file), rng).catch(() => null)
  const loaded = await Promise.all(levels.map((level) => load(level.questions)))
  const hard = loaded[levels.findIndex((level) => level.id === 'hard')] ?? (await load('questions.json'))
  const banks = {} as Record<LevelId, QuestionSource>
  levels.forEach((level, i) => (banks[level.id] = loaded[i] ?? hard!))
  return banks
}

export async function mount(host: HTMLElement): Promise<Game> {
  // Animations keep to the clock even when frames are slow or the tab was
  // hidden, instead of stretching out.
  gsap.ticker.lagSmoothing(0)

  const stage = document.createElement('div')
  stage.className = 'stage'
  host.appendChild(stage)

  const app = new Application()
  const [content, art] = await Promise.all([
    loadContent(),
    Art.load().then(async (art) => {
      // A run opens on the fight lane, so all the art comes first; the bench
      // and the gallery only need the board's.
      const boardOnly = /[?&](bench|boards)\b/.test(location.search)
      await art.preload(boardOnly ? POUR_ART : art.names())
      return art
    }),
    RAPIER.init(),
    app.init({
      resizeTo: stage,
      background: 0xffffff,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    }),
    // Canvas text is drawn once, so the fonts must be in before any of it.
    document.fonts.load(`40px "${font.heading}"`),
    document.fonts.load(`400 16px "${font.body}"`),
    document.fonts.load(`600 16px "${font.body}"`),
    document.fonts.load(`700 16px "${font.body}"`),
  ])
  stage.appendChild(app.canvas)
  const questions = await loadQuestionBanks(content.config.levels)

  const pour = new PourStage(app, content, art)
  const game: Game = {
    pour,
    measure: pour.measure.bind(pour),
    speed: (factor) => gsap.globalTimeline.timeScale(factor),
    sound,
    tick: () => {
      gsap.ticker.tick()
      app.ticker.update()
    },
  }
  const params = new URLSearchParams(location.search)
  if (params.has('bench')) {
    game.bench = new PourHarness(pour, content, host, stage)
  } else if (params.has('boards')) {
    host.style.maxWidth = 'none'
    app.resize()
    new BoardGallery(app, content, art)
  } else {
    void sound.init(import.meta.env.BASE_URL)
    game.run = new Run(app, pour, content, art, questions, host, stage, params.has('booth'))
    void game.run.loop()
  }
  // The bars above and below have just changed how much room the canvas has.
  app.resize()
  return game
}
