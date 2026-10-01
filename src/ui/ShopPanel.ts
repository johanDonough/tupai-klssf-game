import gsap from 'gsap'
import { sound } from '../audio/sound'
import { artUrl, iconUrl } from '../content/load'
import type { CardDef } from '../content/types'
import type { AnswerFormat } from '../questions/questions'
import type { RunState } from '../run/RunState'

// The upgrade shop that slides up after every pour. Three cards, bought with
// nuts, or won by answering a maths question: one card you cannot afford, a
// free reroll, or all three at once.

export interface ShopOptions {
  title: string
  /** The opening pick: commons only, no charge, no reroll, skip or maths. */
  free: boolean
  onChange: () => void
  /** Asks a maths question; true if it was answered right in time. */
  ask?: (format: AnswerFormat, title: string, reward: string) => Promise<boolean>
  /** How many more "get all" questions this run allows. */
  getAllLeft?: number
  onGetAllUsed?: () => void
}

const nutPrice = (amount: number | string) => `<img src="${artUrl('nut.webp')}" alt="" />${amount}`
const icon = (name: string) => `<span class="icon" style="--icon: url('${iconUrl(name)}')"></span>`

export class ShopPanel {
  private readonly sheet: HTMLElement
  private readonly heading: HTMLElement
  private readonly balance: HTMLElement
  private readonly cards: HTMLElement
  private readonly maths: HTMLElement
  private readonly actions: HTMLElement
  private readonly getAll: HTMLButtonElement
  private readonly freeReroll: HTMLButtonElement
  private readonly reroll: HTMLButtonElement
  private readonly skip: HTMLButtonElement
  /** Every card shown so far, to look up the one that was tapped. */
  private readonly cardDefs: CardDef[] = []
  private state!: RunState

  constructor(stage: HTMLElement) {
    stage.insertAdjacentHTML(
      'beforeend',
      `<div class="sheet" hidden>
         <div class="sheet-head">
           <h2></h2>
           <span class="chip"></span>
         </div>
         <div class="cards"></div>
         <div class="sheet-maths">
           <div class="sheet-maths-buttons">
             <button class="button maths" data-action="get-all">${icon('calculator')}Get all 3</button>
             <button class="button maths" data-action="free-reroll">${icon('calculator')}Free reroll</button>
           </div>
           <p class="sheet-note">${icon('calculator')} means: answer a quick maths question</p>
         </div>
         <div class="sheet-actions">
           <button class="button" data-action="reroll"></button>
           <button class="button" data-action="skip">Skip</button>
         </div>
       </div>`,
    )
    this.sheet = stage.querySelector('.sheet')!
    this.heading = this.sheet.querySelector('h2')!
    this.balance = this.sheet.querySelector('.chip')!
    this.cards = this.sheet.querySelector('.cards')!
    this.maths = this.sheet.querySelector('.sheet-maths')!
    this.actions = this.sheet.querySelector('.sheet-actions')!
    this.getAll = this.sheet.querySelector('[data-action="get-all"]')!
    this.freeReroll = this.sheet.querySelector('[data-action="free-reroll"]')!
    this.reroll = this.sheet.querySelector('[data-action="reroll"]')!
    this.skip = this.sheet.querySelector('[data-action="skip"]')!
  }

  /** Opens the shop and resolves once a card is taken or the shop is skipped. */
  open(state: RunState, options: ShopOptions): Promise<void> {
    this.state = state
    const { free, ask } = options
    // Each maths offer is one go per visit: right or wrong, it then closes.
    const solveClosed = new Set<string>()
    let freeRerollUsed = false
    let getAllUsed = false

    return new Promise((resolve) => {
      let busy = false
      const close = async (chosen: HTMLElement | null, taken: HTMLElement[] = chosen ? [chosen] : []) => {
        busy = true
        await this.leave(chosen, taken)
        resolve()
      }

      const refresh = () => {
        this.balance.innerHTML = nutPrice(state.nuts)
        for (const cardEl of this.cards.querySelectorAll<HTMLElement>('.card')) {
          const card = this.findCard(cardEl.dataset.id!)!
          const affordable = free || state.canAfford(card)
          cardEl.classList.toggle('is-locked', !affordable)
          const solve = cardEl.querySelector<HTMLButtonElement>('.card-solve')!
          solve.hidden = free || affordable || !ask
          solve.disabled = solveClosed.has(card.id)
          solve.innerHTML = solveClosed.has(card.id) ? 'Next time' : `${icon('calculator')}Solve it`
        }
        this.reroll.innerHTML = `${icon('refresh')}Reroll ${nutPrice(state.rerollPrice)}`
        this.reroll.disabled = state.rerollPrice > state.nuts
        this.freeReroll.disabled = freeRerollUsed
        const getAllLeft = (options.getAllLeft ?? 0) - (getAllUsed ? 1 : 0)
        // Only a comeback for players short of nuts: if every card on show is
        // affordable anyway, it isn't offered.
        const onShow = [...this.cards.querySelectorAll<HTMLElement>('.card')].map((el) => this.findCard(el.dataset.id!)!)
        const plenty = onShow.length > 0 && onShow.every((card) => state.canAfford(card))
        this.getAll.hidden = getAllUsed || getAllLeft <= 0 || plenty
      }

      const deal = () => {
        const offer = state.offer(free)
        this.cards.replaceChildren(...offer.map((card) => this.buildCard(card, free)))
        refresh()
        gsap.fromTo(
          this.cards.children,
          { y: 70, autoAlpha: 0, rotation: (i: number) => (i - 1) * 6 },
          { y: 0, autoAlpha: 1, rotation: 0, duration: 0.45, ease: 'back.out(1.6)', stagger: 0.07 },
        )
      }

      const redeal = () => {
        sound.play('button')
        gsap.to(this.cards.children, { y: 40, autoAlpha: 0, duration: 0.18, stagger: 0.03, onComplete: deal })
      }

      this.cards.onclick = async (event) => {
        if (busy) return
        const target = event.target as HTMLElement
        const cardEl = target.closest<HTMLElement>('.card')
        if (!cardEl) return
        const card = this.findCard(cardEl.dataset.id!)!
        if (target.closest('.card-solve')) {
          if (!ask || solveClosed.has(card.id)) return
          busy = true
          const right = await ask('choice', card.name, `card:${card.id}`)
          busy = false
          solveClosed.add(card.id)
          if (right) {
            state.take(card, true)
            options.onChange()
            void close(cardEl)
          } else refresh()
          return
        }
        if (!free && !state.canAfford(card)) {
          gsap.fromTo(cardEl, { x: -6 }, { x: 0, duration: 0.3, ease: 'elastic.out(1, 0.3)' })
          return
        }
        state.take(card, free)
        options.onChange()
        void close(cardEl)
      }

      this.reroll.onclick = () => {
        if (busy || state.rerollPrice > state.nuts) return
        state.payForReroll()
        options.onChange()
        redeal()
      }

      this.freeReroll.onclick = async () => {
        if (busy || freeRerollUsed || !ask) return
        busy = true
        const right = await ask('choice', 'A free reroll', 'reroll')
        busy = false
        freeRerollUsed = true
        if (right) redeal()
        else refresh()
      }

      this.getAll.onclick = async () => {
        if (busy || getAllUsed || !ask) return
        busy = true
        const right = await ask('typed', 'All 3 cards', 'get-all')
        busy = false
        getAllUsed = true
        options.onGetAllUsed?.()
        if (right) {
          for (const cardEl of this.cards.querySelectorAll<HTMLElement>('.card')) {
            state.take(this.findCard(cardEl.dataset.id!)!, true)
          }
          options.onChange()
          void close(null, [...this.cards.querySelectorAll<HTMLElement>('.card')])
        } else refresh()
      }

      this.skip.onclick = () => {
        if (!busy) void close(null)
      }

      this.heading.textContent = options.title
      this.actions.hidden = free
      this.maths.hidden = free || !ask
      this.sheet.hidden = false
      gsap.fromTo(this.sheet, { yPercent: 100 }, { yPercent: 0, duration: 0.4, ease: 'power3.out' })
      deal()
    })
  }

  private findCard(id: string): CardDef | undefined {
    return this.cardDefs.find((card) => card.id === id)
  }

  private buildCard(card: CardDef, free: boolean): HTMLElement {
    if (!this.cardDefs.includes(card)) this.cardDefs.push(card)
    const owned = this.state.timesOwned(card)
    const level = Array.from({ length: Math.min(card.max, 6) }, (_, i) => `<i class="${i < owned ? 'on' : ''}"></i>`).join('')
    const element = document.createElement('div')
    element.className = `card ${card.rarity}`
    element.dataset.id = card.id
    element.innerHTML = `
      ${card.rarity === 'rare' ? '<span class="card-rarity">Rare</span>' : ''}
      <span class="card-icon" style="--icon: url('${iconUrl(card.icon)}'); --tint: ${card.colour}"></span>
      <span class="card-name">${card.name}</span>
      <span class="card-desc">${card.description.replace('{amount}', String(card.effect.amount))}</span>
      <span class="card-level" aria-label="Owned ${owned} of ${card.max}">${level}</span>
      <button class="card-price">${free ? 'Free' : nutPrice(this.state.price(card))}</button>
      <button class="card-solve" hidden></button>`
    return element
  }

  private async leave(chosen: HTMLElement | null, taken: HTMLElement[]): Promise<void> {
    sound.play(taken.length > 0 ? 'card-buy' : 'button')
    // Each card taken sends its icon flying up into Junior's row of upgrades.
    taken.forEach((cardEl, i) => this.flyToHud(cardEl, i * 0.12))
    const others = [...this.cards.children].filter((el) => el !== chosen)
    const timeline = gsap.timeline()
    if (chosen) {
      timeline.to(chosen, { scale: 1.12, duration: 0.15, ease: 'power2.out' })
      timeline.to(others, { y: 50, autoAlpha: 0, duration: 0.2, stagger: 0.03 }, '<')
      timeline.to(chosen, { y: -120, autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, '+=0.15')
    } else {
      timeline.to(this.cards.children, { y: -80, autoAlpha: 0, duration: 0.3, stagger: 0.05 })
    }
    timeline.to(this.sheet, { yPercent: 100, duration: 0.3, ease: 'power2.in' }, '-=0.05')
    await timeline
    this.sheet.hidden = true
  }

  /** A copy of the card's icon flies to its chip in the top bar, trailing sparkles. */
  private flyToHud(cardEl: HTMLElement, delay: number): void {
    const iconEl = cardEl.querySelector<HTMLElement>('.card-icon')
    const chip = document.querySelector<HTMLElement>(`.hud-upgrades .upgrade[data-id="${cardEl.dataset.id}"]`)
    if (!iconEl || !chip) return
    const from = iconEl.getBoundingClientRect()
    const to = chip.getBoundingClientRect()
    const tint = getComputedStyle(iconEl).getPropertyValue('--tint') || '#ff6300'
    const ghost = iconEl.cloneNode(true) as HTMLElement
    ghost.classList.add('card-ghost')
    Object.assign(ghost.style, {
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
    })
    document.body.appendChild(ghost)
    const dx = to.left + to.width / 2 - (from.left + from.width / 2)
    const dy = to.top + to.height / 2 - (from.top + from.height / 2)
    let frame = 0
    gsap
      .timeline({
        delay,
        onComplete: () => {
          ghost.remove()
          gsap.fromTo(chip, { scale: 1.7 }, { scale: 1, duration: 0.45, ease: 'back.out(3)' })
        },
      })
      .to(ghost, { scale: 1.25, duration: 0.15, ease: 'power2.out' })
      .to(ghost, {
        x: dx,
        y: dy,
        scale: to.width / from.width,
        duration: 0.6,
        ease: 'power2.inOut',
        onUpdate: () => {
          if (frame++ % 2) return
          const bounds = ghost.getBoundingClientRect()
          const dot = document.createElement('i')
          dot.className = 'fly-spark'
          dot.style.left = `${bounds.left + bounds.width / 2}px`
          dot.style.top = `${bounds.top + bounds.height / 2}px`
          dot.style.background = tint
          document.body.appendChild(dot)
          gsap.to(dot, { scale: 0.2, autoAlpha: 0, duration: 0.45, onComplete: () => dot.remove() })
        },
      })
  }
}
