import gsap from 'gsap'
import { sound } from '../audio/sound'
import { artUrl, iconUrl } from '../content/load'
import type { CardDef } from '../content/types'
import { TOTAL_WAVES } from '../run/RunState'

// The bar across the top during a run: which wave, the nuts to spend, and a
// row of the upgrades Junior has picked up.

export class Hud {
  private readonly waveNumber: HTMLElement
  private readonly progress: HTMLElement
  private readonly nuts: HTMLElement
  private readonly nutsBox: HTMLElement
  private readonly shown = { nuts: 0 }
  private readonly upgrades: HTMLElement
  /** Tapping the row of upgrade icons. */
  onUpgradesTap: (() => void) | null = null

  constructor(host: HTMLElement) {
    host.insertAdjacentHTML(
      'afterbegin',
      `<div class="hud run-hud">
         <div class="hud-wave">
           <div class="hud-title">Wave <b class="wave-number">1</b> of ${TOTAL_WAVES}</div>
           <div class="progress"><i></i></div>
         </div>
         <div class="hud-nuts" aria-label="Nuts to spend">
           <img src="${artUrl('nut.webp')}" alt="" /><b>0</b>
         </div>
         <button class="hud-mute" aria-label="Sound on or off"><span class="icon"></span></button>
       </div>
       <button class="hud-upgrades" aria-label="Junior's upgrades: tap to pause and see them"></button>`,
    )
    this.upgrades = host.querySelector('.hud-upgrades')!
    this.upgrades.addEventListener('click', () => this.onUpgradesTap?.())
    const mute = host.querySelector<HTMLButtonElement>('.hud-mute')!
    const showMute = () => {
      mute.querySelector<HTMLElement>('.icon')!.style.setProperty('--icon', `url('${iconUrl(sound.muted ? 'volume-off' : 'volume')}')`)
      mute.setAttribute('aria-pressed', String(sound.muted))
    }
    mute.addEventListener('click', () => {
      sound.setMuted(!sound.muted)
      showMute()
    })
    showMute()
    this.waveNumber = host.querySelector('.wave-number')!
    this.progress = host.querySelector('.progress i')!
    this.nutsBox = host.querySelector('.hud-nuts')!
    this.nuts = this.nutsBox.querySelector('b')!
  }

  /** Wave in play; pass TOTAL_WAVES + 1 once the run is over to fill the bar. */
  setWave(wave: number): void {
    this.waveNumber.textContent = String(Math.min(wave, TOTAL_WAVES))
    const done = Math.min(wave - 1, TOTAL_WAVES) / TOTAL_WAVES
    gsap.to(this.progress, { width: `${done * 100}%`, duration: 0.5, ease: 'power2.out' })
  }

  /** One chip per upgrade owned, with how many times it was taken. */
  setUpgrades(owned: { card: CardDef; times: number }[]): void {
    const before = new Set([...this.upgrades.children].map((chip) => (chip as HTMLElement).dataset.id))
    this.upgrades.innerHTML = owned
      .map(
        ({ card, times }) =>
          `<span class="upgrade" data-id="${card.id}" title="${card.name}" style="--tint: ${card.colour}">
             <i class="icon" style="--icon: url('${iconUrl(card.icon)}')"></i>${times > 1 ? `<b>${times}</b>` : ''}
           </span>`,
      )
      .join('')
    // A new upgrade pops in so the eye goes to it.
    for (const chip of this.upgrades.querySelectorAll<HTMLElement>('.upgrade')) {
      if (!before.has(chip.dataset.id)) gsap.from(chip, { scale: 0, duration: 0.35, ease: 'back.out(3)' })
    }
  }

  /** Counts the nut total up or down to `nuts`. */
  setNuts(nuts: number, animate = true): void {
    gsap.killTweensOf(this.shown)
    if (!animate) {
      this.shown.nuts = nuts
      this.nuts.textContent = String(nuts)
      return
    }
    const gaining = nuts > this.shown.nuts
    gsap.to(this.shown, {
      nuts,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => {
        this.nuts.textContent = String(Math.round(this.shown.nuts))
      },
    })
    if (gaining) gsap.fromTo(this.nutsBox, { scale: 1.2 }, { scale: 1, duration: 0.4, ease: 'back.out(3)' })
  }
}
