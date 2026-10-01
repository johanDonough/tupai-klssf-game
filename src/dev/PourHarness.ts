import gsap from 'gsap'
import type { Content } from '../content/types'
import type { PourStage } from '../pour/PourStage'

// Test bench for boards: open the game with ?bench in the address. Pour any
// board as often as you like, with no waves or shop around it.

export class PourHarness {
  private boardIndex = 0
  private total = 0
  private seed = 1
  private readonly startNuts = 12

  private readonly title: HTMLElement
  private readonly sub: HTMLElement
  private readonly score: HTMLElement
  private readonly result: HTMLElement
  private readonly resultNumber: HTMLElement

  constructor(
    readonly pour: PourStage,
    private readonly content: Content,
    host: HTMLElement,
    stage: HTMLElement,
  ) {
    host.insertAdjacentHTML(
      'afterbegin',
      `<div class="hud">
         <div><div class="hud-title"></div><div class="hud-sub"></div></div>
         <div class="hud-score"><b>0</b><span class="hud-sub">nuts banked</span></div>
       </div>`,
    )
    host.insertAdjacentHTML(
      'beforeend',
      `<div class="actions">
         <button class="button" data-action="next">Next board</button>
         <button class="button primary" data-action="again">Pour again</button>
       </div>`,
    )
    stage.insertAdjacentHTML('beforeend', `<div class="result"><b></b><span class="hud-sub">nuts</span></div>`)

    this.title = host.querySelector('.hud-title')!
    this.sub = host.querySelector('.hud-title + .hud-sub')!
    this.score = host.querySelector('.hud-score b')!
    this.result = stage.querySelector('.result')!
    this.resultNumber = this.result.querySelector('b')!

    host.querySelector('[data-action="next"]')!.addEventListener('click', () => {
      this.boardIndex = (this.boardIndex + 1) % content.boards.length
      this.startPour()
    })
    host.querySelector('[data-action="again"]')!.addEventListener('click', () => this.startPour())
    this.startPour()
  }

  measure(boardId: string, startNuts?: number) {
    return this.pour.measure(boardId, startNuts)
  }

  get current() {
    return this.pour.current
  }

  private async startPour(): Promise<void> {
    const board = this.content.boards[this.boardIndex]
    this.title.textContent = board.name
    this.sub.textContent = `Board ${this.boardIndex + 1} of ${this.content.boards.length}. Drag, then let go.`
    gsap.killTweensOf(this.result)
    gsap.set(this.result, { autoAlpha: 0, xPercent: -50, yPercent: -50 })

    const seed = this.seed++
    const banked = await this.pour.play({ board, startNuts: this.startNuts, seed })
    if (seed !== this.seed - 1) return // a newer pour replaced this one
    this.total += banked
    this.score.textContent = String(this.total)
    this.resultNumber.textContent = `+${banked}`
    gsap.fromTo(
      this.result,
      { autoAlpha: 0, scale: 0.6, xPercent: -50, yPercent: -50 },
      { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' },
    )
  }
}
