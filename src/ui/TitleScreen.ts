import gsap from 'gsap'
import { sound } from '../audio/sound'
import { artUrl, iconUrl } from '../content/load'
import type { LevelDef } from '../content/types'
import type { Leaderboard } from '../leaderboard/Leaderboard'
import { levelButtonsHtml, waitForLevel } from './levels'
import { Tutorial } from './Tutorial'

// The screen before every run: the name, today's best scores, and two ways
// in: Play (then pick a level) or How to play (the tutorial slides, which end
// on the same level choice). In booth mode it is the attract screen, and a
// tap anywhere goes on to the level choice.

const icon = (name: string) => `<span class="icon" style="--icon: url('${iconUrl(name)}')"></span>`

export class TitleScreen {
  private readonly screen: HTMLElement
  private readonly tutorial: Tutorial

  constructor(
    stage: HTMLElement,
    private readonly leaderboard: Leaderboard,
    private readonly levels: LevelDef[],
  ) {
    stage.insertAdjacentHTML('beforeend', `<div class="title-screen" hidden></div>`)
    this.screen = stage.querySelector('.title-screen')!
    this.tutorial = new Tutorial(stage)
  }

  /** Shows the title and resolves with the level the player picks. */
  async show(booth: boolean): Promise<LevelDef> {
    for (;;) {
      const choice = await this.home(booth)
      const level = choice === 'tutorial' ? await this.tutorial.show(this.levels) : await this.pickLevel()
      if (level) {
        await this.leave()
        return level
      }
    }
  }

  private home(booth: boolean): Promise<'play' | 'tutorial'> {
    this.screen.innerHTML = `
      <div class="title-art">
        <img class="title-muddle" src="${artUrl('muddle-melee-small-idle.webp')}" alt="" />
        <img class="title-junior" src="${artUrl('junior-cheer.webp')}" alt="Junior the squirrel" />
      </div>
      <h1><span>Tupai</span> Nutty Hero</h1>
      <p class="title-tagline">Beat the Muddles, pour nuts, power up with maths!</p>
      <div class="title-top" aria-live="polite"></div>
      <div class="title-buttons">
        <button class="button primary title-play">${icon('player-play')}${booth ? 'Tap to play' : 'Play'}</button>
        <button class="button title-tutorial">${icon('book')}How to play</button>
      </div>`
    this.screen.hidden = false
    gsap.fromTo(this.screen, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 })
    gsap.from(this.screen.querySelector('.title-junior'), { y: 80, scale: 0.7, duration: 0.7, ease: 'elastic.out(1, 0.5)' })
    gsap.from(this.screen.querySelector('.title-muddle'), { x: 120, duration: 0.6, delay: 0.2, ease: 'back.out(2)' })
    gsap.from(this.screen.querySelectorAll('.title-buttons .button'), { y: 20, autoAlpha: 0, duration: 0.35, stagger: 0.08, delay: 0.25 })
    const play = this.screen.querySelector<HTMLButtonElement>('.title-play')!
    const pulse = gsap.to(play, { scale: 1.04, duration: 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut' })
    void this.showTop()

    return new Promise((resolve) => {
      const done = (choice: 'play' | 'tutorial') => {
        pulse.kill()
        this.screen.onclick = null
        sound.play('button')
        resolve(choice)
      }
      play.onclick = (event) => {
        event.stopPropagation()
        done('play')
      }
      this.screen.querySelector<HTMLButtonElement>('.title-tutorial')!.onclick = (event) => {
        event.stopPropagation()
        done('tutorial')
      }
      if (booth) this.screen.onclick = () => done('play')
    })
  }

  /** The level choice; resolves with a level, or null for Back. */
  private pickLevel(): Promise<LevelDef | null> {
    this.screen.innerHTML = `
      <h2 class="title-pick">Pick your level</h2>
      ${levelButtonsHtml(this.levels)}
      <button class="button title-back">${icon('chevron-left')}Back</button>`
    gsap.from(this.screen.querySelectorAll('.level-button'), { y: 30, autoAlpha: 0, duration: 0.35, stagger: 0.08, ease: 'back.out(2)' })
    return new Promise((resolve) => {
      this.screen.querySelector<HTMLButtonElement>('.title-back')!.onclick = () => resolve(null)
      void waitForLevel(this.screen, this.levels).then((level) => {
        sound.play('card-buy')
        resolve(level)
      })
    })
  }

  private leave(): Promise<void> {
    return new Promise((resolve) => {
      gsap.to(this.screen, {
        autoAlpha: 0,
        duration: 0.25,
        onComplete: () => {
          this.screen.hidden = true
          resolve()
        },
      })
    })
  }

  /** Today's best on each level's board, to beat. */
  private async showTop(): Promise<void> {
    // One retry: the Sheet can be slow to answer the first call after a quiet spell.
    const board = (await this.leaderboard.board()) ?? (await this.leaderboard.board())
    if (!board) return
    const levels = board.shared ? this.levels.slice(0, 1) : this.levels
    const rows = levels
      .map((level) => ({ level, top: board.levels[level.id]?.today[0] }))
      .filter((row) => row.top)
    const line = this.screen.querySelector<HTMLElement>('.title-top')
    if (!line || rows.length === 0) return
    line.innerHTML = `<span class="title-top-head">${icon('crown')}Today's best</span>${rows
      .map(({ level, top }) => `<span class="title-top-row"><i>${board.shared ? '' : level.name}</i><b>${top!.score}</b><span>${escape(top!.name)}</span></span>`)
      .join('')}`
    gsap.from(line, { autoAlpha: 0, y: 8, duration: 0.3 })
  }
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
