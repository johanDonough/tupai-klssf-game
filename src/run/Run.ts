import type { Application } from 'pixi.js'
import gsap from 'gsap'
import { sound } from '../audio/sound'
import type { Art } from '../content/art'
import type { BoardDef, Content, LevelId } from '../content/types'
import { FightSim } from '../fight/FightSim'
import { FightView } from '../fight/FightView'
import { Leaderboard } from '../leaderboard/Leaderboard'
import type { PourStage } from '../pour/PourStage'
import { reportAnswer, tierForWave, type AnswerFormat, type QuestionSource } from '../questions/questions'
import { makeRng, type Rng } from '../rng'
import { EndCard } from '../ui/EndCard'
import { QuestionPanel, type QuizLook } from '../ui/QuestionPanel'
import { Hud } from '../ui/Hud'
import { ShopPanel } from '../ui/ShopPanel'
import { StatsPanel } from '../ui/StatsPanel'
import { TitleScreen } from '../ui/TitleScreen'
import { Booth } from './Booth'
import { RunState, TOTAL_WAVES } from './RunState'

// One run from the title screen and the first free pick to the end screen,
// then round again. Each wave: fight on the lane, pour the nuts the Muddles
// dropped, shop.

// On the GSAP clock, so pausing the game holds these too.
const pause = (seconds: number) => new Promise((resolve) => gsap.delayedCall(seconds, resolve))

export class Run {
  state!: RunState
  readonly fight: FightView
  private readonly hud: Hud
  private readonly endCard: EndCard
  private readonly shop: ShopPanel
  private readonly quiz: QuestionPanel
  private readonly stats: StatsPanel
  private readonly title: TitleScreen
  private readonly booth: Booth | null
  private readonly rng: Rng
  private lastBoard: BoardDef | null = null

  constructor(
    private readonly app: Application,
    readonly pour: PourStage,
    private readonly content: Content,
    art: Art,
    private readonly banks: Record<LevelId, QuestionSource>,
    host: HTMLElement,
    stage: HTMLElement,
    booth: boolean,
  ) {
    this.rng = makeRng(Date.now() % 1_000_000)
    const leaderboard = new Leaderboard(content.config.leaderboardUrl)
    this.hud = new Hud(host)
    this.hud.onUpgradesTap = () => void this.showStats()
    this.fight = new FightView(app, art)
    this.endCard = new EndCard(stage, content.config, leaderboard)
    this.shop = new ShopPanel(stage)
    this.quiz = new QuestionPanel(stage, this.rng)
    this.stats = new StatsPanel(stage, content)
    this.title = new TitleScreen(stage, leaderboard, content.config.levels)
    this.booth = booth ? new Booth(stage, content.config.boothIdleSeconds) : null
  }

  /**
   * Pauses everything (fight, pour, every animation) and shows Junior's
   * upgrades until the panel is closed. Not during a maths question, so
   * nobody can stop the clock to think.
   */
  private async showStats(): Promise<void> {
    if (!this.state || this.stats.isOpen || this.quiz.isOpen) return
    sound.play('button')
    gsap.globalTimeline.pause()
    this.app.ticker.stop()
    await this.stats.open(this.state, this.fight.heroHealth)
    this.app.ticker.start()
    gsap.globalTimeline.resume()
  }

  /** The question bank for the difficulty picked this run. */
  private get questions(): QuestionSource {
    return this.banks[this.state.level.id]
  }

  /**
   * Asks one maths question at the current wave's level; true if right in
   * time. `forWhat` names the reward in the end screen's answer list.
   */
  private async ask(
    format: AnswerFormat,
    forWhat: string,
    reward: string,
    extra: { title?: string; note?: string; look?: QuizLook } = {},
  ): Promise<boolean> {
    const state = this.state
    const question = await this.questions.next({ tier: tierForWave(state.wave, format), format })
    const result = await this.quiz.ask(question, {
      title: extra.title ?? forWhat,
      format,
      seconds: this.content.cards.questionSeconds,
      note: extra.note,
      look: extra.look,
    })
    state.questionsAsked += 1
    if (result.correct) state.questionsRight += 1
    state.answers.push({
      text: question.text,
      answer: question.answer,
      given: result.given,
      correct: result.correct,
      forWhat,
      wave: state.wave,
    })
    reportAnswer({
      questionId: question.id,
      text: question.text,
      answer: question.answer,
      given: result.given,
      correct: result.correct,
      milliseconds: result.milliseconds,
      format,
      reward,
      wave: state.wave,
    })
    return result.correct
  }

  /**
   * The quick quiz before every wave. If Junior is hurt, each right answer
   * heals him more; at full health each one is worth bonus nuts instead,
   * more in later waves. Questions get harder with the waves like the rest.
   */
  private async waveQuiz(wave: number, updateNuts: () => void): Promise<void> {
    const state = this.state
    const quiz = this.content.waves.waveQuiz
    const max = state.heroStats().maxHealth
    const full = state.heroHealth >= max
    const tier = tierForWave(wave, 'choice')
    const nutsEach = quiz.nutsPerRight[Math.min(tier, quiz.nutsPerRight.length) - 1]
    const healEach = Math.round(max * quiz.healPerRight)
    // Zoom in on Junior and his health bar, so it's clear what the questions are for.
    await this.fight.focusJunior(full ? 'nuts' : 'heal', full ? `+${nutsEach} nuts for each right answer` : `+${healEach} health for each right answer`)
    let right = 0
    for (let i = 1; i <= quiz.questions; i++) {
      const forWhat = full ? 'Bonus nuts' : 'Heal Junior'
      const title = `${forWhat}: question ${i} of ${quiz.questions}`
      const note = full ? `Each right answer: +${nutsEach} nuts` : `Each right answer: +${healEach} health`
      if (await this.ask('choice', forWhat, full ? 'wave-nuts' : 'wave-heal', { title, note, look: full ? 'nuts' : 'heal' })) {
        right += 1
      }
    }
    if (full) {
      if (right > 0) {
        state.bank(right * nutsEach)
        updateNuts()
        sound.play('card-buy')
      }
      await this.fight.nutsReward(right * nutsEach)
    } else {
      const healed = state.healForWave(right)
      await this.fight.healReward(max, state.heroHealth, healed, state.stat('healOnWave') > 0)
    }
    await this.fight.unfocus()
  }

  async loop(): Promise<never> {
    for (;;) {
      await this.playOnce()
    }
  }

  private async playOnce(): Promise<void> {
    const hero = this.content.waves.hero
    this.hud.setWave(1)
    this.hud.setNuts(0, false)
    this.hud.setUpgrades([])
    this.fight.reset(hero.health, hero.health)
    this.fight.setArmour(0)
    this.fight.setCup(this.content.waves.cupBase)

    this.booth?.rest()
    const level = await this.title.show(this.booth !== null)
    this.booth?.watch()
    sound.setMusic(true)

    const state = new RunState(this.content, this.rng, level)
    this.state = state
    this.questions.newRun()
    const updateNuts = () => {
      this.hud.setNuts(state.nuts)
      this.hud.setUpgrades(state.ownedCards())
    }
    const updateHealth = () => {
      this.fight.heal(state.heroStats().maxHealth, state.heroHealth, 0)
      this.fight.setArmour(state.stat('armour'))
    }

    await this.shop.open(state, { title: 'Pick a free upgrade', free: true, onChange: updateNuts })
    updateHealth()

    let won = false
    for (let wave = 1; wave <= TOTAL_WAVES; wave++) {
      state.wave = wave
      this.hud.setWave(wave)
      this.fight.setCup(state.cupStart())
      if (wave > 1) await this.fight.show()

      await this.waveQuiz(wave, updateNuts)
      const groups = this.content.waves.waves[wave - 1].length
      await this.fight.announce(
        wave === TOTAL_WAVES ? 'King Muddle!' : `Wave ${wave}`,
        groups > 1 ? `${groups} groups of Muddles` : '',
      )

      const sim = new FightSim(this.content, wave, state.heroStats(), state.heroHealth, this.rng)
      let outcome = await this.fight.play(sim)
      // Once a run, a typed maths question gets Junior back up. It zooms in
      // on him like the wave quiz, so it's clear what's at stake.
      if (outcome === 'lost' && !state.revived) {
        state.revived = true
        await this.fight.focusJunior('revive', 'Answer right to get him back up! Revives left: 1')
        const revived = await this.ask('typed', 'Revive Junior', 'revive', {
          title: 'Revive Junior',
          note: 'Revives left: 1. Type the answer!',
          look: 'revive',
        })
        if (revived) {
          const max = state.heroStats().maxHealth
          sim.revive(max)
          await this.fight.revive(max)
          await this.fight.unfocus()
          outcome = await this.fight.play(sim)
        } else {
          await this.fight.unfocus()
        }
      }
      state.heroHealth = sim.heroHealth
      if (outcome === 'lost') break
      if (wave === TOTAL_WAVES) {
        won = true
        await this.fight.celebrate()
        break
      }

      // Let the last nuts land in the cup, then swap the lane for the board.
      await pause(0.7)
      void this.fight.hide()
      const banked = await this.pour.play({
        board: this.pickBoard(wave),
        startNuts: state.cupStart() + sim.nutsDropped,
        seed: Math.floor(this.rng() * 1e9),
        mirror: this.rng() < 0.5,
        upgradeGates: state.stat('upgradeGates'),
        slideIn: true,
      })
      state.bank(banked)
      updateNuts()
      await pause(0.9)
      const cards = this.content.cards
      // "Get all 3" turns up only now and then, never in the first shops.
      const getAllHere = wave >= cards.getAllFromWave && this.rng() < cards.getAllChance
      await this.shop.open(state, {
        title: 'Pick an upgrade',
        free: false,
        onChange: updateNuts,
        ask: (format, forWhat, reward) => this.ask(format, forWhat, reward),
        getAllLeft: getAllHere ? cards.getAllPerRun - state.getAllUsed : 0,
        onGetAllUsed: () => (state.getAllUsed += 1),
      })
      updateHealth()
      await this.pour.slideOut()
    }

    this.hud.setWave(won ? TOTAL_WAVES + 1 : state.wave)
    // The music carries on through the end screen and into the next run;
    // it only dips while the win or lose tune plays.
    sound.duck(1.4)
    sound.play(won ? 'win' : 'lose')
    await this.endCard.show(state, {
      won,
      onActivity: () => this.booth?.activity(),
    })
  }

  /** Simple boards early, harder ones later, never the same board twice running. */
  private pickBoard(wave: number): BoardDef {
    const maxTier = wave <= 4 ? 1 : wave <= 10 ? 2 : 3
    const minTier = wave <= 10 ? 1 : 2
    let pool = this.content.boards.filter((b) => b.tier >= minTier && b.tier <= maxTier && b !== this.lastBoard)
    if (pool.length === 0) pool = this.content.boards.filter((b) => b !== this.lastBoard)
    const board = pool[Math.floor(this.rng() * pool.length)]
    this.lastBoard = board
    return board
  }
}
