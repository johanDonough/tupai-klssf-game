import { iconUrl } from '../content/load'
import type { Content } from '../content/types'
import type { RunState } from '../run/RunState'

// What Junior has picked up so far, opened by tapping the upgrade icons under
// the wave bar. The game is paused while it is open. It animates with CSS,
// not GSAP, because GSAP is what the pause stops.

const icon = (name: string) => `<span class="icon" style="--icon: url('${iconUrl(name)}')"></span>`
const round = (value: number) => String(Math.round(value))

export class StatsPanel {
  private readonly overlay: HTMLElement
  private closing: (() => void) | null = null

  constructor(
    stage: HTMLElement,
    private readonly content: Content,
  ) {
    stage.insertAdjacentHTML('beforeend', `<div class="stats" hidden role="dialog" aria-modal="true" aria-label="Junior's upgrades"></div>`)
    this.overlay = stage.querySelector('.stats')!
    this.overlay.addEventListener('click', (event) => {
      const target = event.target as HTMLElement
      // A tap on the dimmed backdrop closes it too.
      if (target === this.overlay || target.closest('.stats-close')) this.close()
    })
  }

  get isOpen(): boolean {
    return !this.overlay.hidden
  }

  /** Shows the panel and resolves once it is closed. `health` is Junior's health right now. */
  open(state: RunState, health: number): Promise<void> {
    const base = this.content.waves.hero
    const stats = state.heroStats()
    const owned = state.ownedCards()
    const changed = (from: string, to: string) => (from === to ? `<b>${to}</b>` : `<s>${from}</s><b>${to}</b>`)
    const rows = owned
      .map(({ card, times }) => {
        const total = card.effect.amount * times
        const level = Array.from({ length: card.max }, (_, i) => `<i class="${i < times ? 'on' : ''}"></i>`).join('')
        const text = card.total.replace('{total}', String(total)).replace('{s}', total > 1 ? 's' : '')
        return `<li>
            <span class="card-icon" style="--icon: url('${iconUrl(card.icon)}'); --tint: ${card.colour}"></span>
            <span class="stats-card">
              <span class="stats-name">${card.name}<span class="card-level" aria-label="Level ${times} of ${card.max}">${level}</span></span>
              <span class="stats-total">${text}</span>
            </span>
          </li>`
      })
      .join('')
    this.overlay.innerHTML = `
      <div class="stats-card-wrap">
        <div class="stats-head">
          <h2>Junior's upgrades</h2>
          <button class="stats-close" aria-label="Close and carry on">${icon('x')}</button>
        </div>
        <div class="stats-numbers">
          <div><span>Health</span><b>${round(health)}/${stats.maxHealth}</b></div>
          <div><span>Attack</span>${changed(round(base.attack), round(stats.attack))}</div>
          <div><span>Nuts per pour</span>${changed(String(this.content.waves.cupBase), String(state.cupStart()))}</div>
        </div>
        ${owned.length > 0 ? `<ul class="stats-list">${rows}</ul>` : '<p class="stats-empty">No upgrades yet. Pick some in the shop after each pour.</p>'}
        <p class="stats-paused">Game paused</p>
      </div>`
    this.overlay.hidden = false
    // Next frame, so the transition runs from the hidden state.
    requestAnimationFrame(() => this.overlay.classList.add('is-open'))
    return new Promise((resolve) => {
      this.closing = resolve
    })
  }

  close(): void {
    if (!this.closing) return
    const done = this.closing
    this.closing = null
    this.overlay.classList.remove('is-open')
    setTimeout(() => {
      this.overlay.hidden = true
      done()
    }, 180)
  }
}
