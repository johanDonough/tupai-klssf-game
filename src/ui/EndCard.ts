import gsap from 'gsap'
import { artUrl, iconUrl } from '../content/load'
import type { GameConfig, LevelId } from '../content/types'
import { cleanName, deviceBest, makeName, NAME_MAX, type Board, type BoardRow, type Leaderboard } from '../leaderboard/Leaderboard'
import type { AnswerLog, RunState } from '../run/RunState'
import { formatNumber } from './QuestionPanel'
import { qrSvg } from './qr'

// End of a run: the score, the best on this device, the booth leaderboard,
// and the way to the Family Duo claim page.

const icon = (name: string) => `<span class="icon" style="--icon: url('${iconUrl(name)}')"></span>`

export interface EndOptions {
  won: boolean
  /** On the booth's own device the claim page is a QR code to scan, not a link. */
  booth: boolean
  /** Called on any tap, so booth mode knows someone is still there. */
  onActivity?: () => void
}

export class EndCard {
  private readonly card: HTMLElement
  private resolve: (() => void) | null = null

  constructor(
    stage: HTMLElement,
    private readonly config: GameConfig,
    private readonly leaderboard: Leaderboard,
  ) {
    stage.insertAdjacentHTML('beforeend', `<div class="end-card" hidden></div>`)
    this.card = stage.querySelector('.end-card')!
  }

  /** Closes the card as if "Play again" was tapped (booth mode's idle reset). */
  dismiss(): void {
    if (!this.resolve) return
    const done = this.resolve
    this.resolve = null
    this.card.hidden = true
    done()
  }

  show(state: RunState, options: EndOptions): Promise<void> {
    const { won, booth } = options
    const level = state.level
    const best = deviceBest.get(level.id)
    const newBest = state.score > best
    if (newBest) deviceBest.set(level.id, state.score)
    const runId = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
    const claimed = this.config.claimUrl !== ''

    this.card.innerHTML = `
      <img class="end-junior" src="${artUrl(won ? 'junior-cheer.webp' : 'junior-down.webp')}" alt="" />
      <h2>${won ? 'Well played!' : 'Junior needs a rest'}</h2>
      <p class="end-sub">${won ? 'All 15 waves cleared, King Muddle beaten' : `Beaten on wave ${state.wave} of 15`} · <b>${level.name}</b> (${level.label})</p>
      <div class="end-score"><b>0</b><span>nuts banked</span></div>
      <p class="end-best">${newBest && best > 0 ? `${icon('star')}New best on this device!` : best > 0 ? `Best on this device: <b>${Math.max(best, state.score)}</b>` : ''}</p>
      ${mathsHtml(state.answers)}
      ${this.leaderboard.enabled ? `
        <section class="end-board">
          <form class="end-name" autocomplete="off">
            <label for="end-name-input">Your name on the ${level.name} leaderboard</label>
            <div class="end-name-row">
              <input id="end-name-input" name="name" maxlength="${NAME_MAX}" value="${makeName()}" spellcheck="false" autocapitalize="words" />
              <button type="button" class="end-dice" aria-label="Make up another name">${icon('dice-5')}</button>
            </div>
            <button type="submit" class="button primary end-post">Post my score</button>
          </form>
          <p class="end-board-note" aria-live="polite"></p>
          <div class="board-tabs" role="tablist">
            <button type="button" role="tab" data-tab="today" aria-selected="true">Today</button>
            <button type="button" role="tab" data-tab="weekend" aria-selected="false">All weekend</button>
          </div>
          <div class="board-levels" role="group" aria-label="Which level">
            <button type="button" data-level="all">All</button>
            ${this.config.levels.map((l) => `<button type="button" data-level="${l.id}">${l.name}</button>`).join('')}
          </div>
          <ol class="board-list"><li class="board-empty">Loading the leaderboard…</li></ol>
        </section>` : ''}
      ${claimed ? `
        <section class="end-claim">
          <p>${this.config.claimNote}</p>
          ${booth
            ? `<div class="end-qr">${qrSvg(this.config.claimUrl)}<span>Scan with your phone to claim</span></div>`
            : `<a class="button claim" href="${this.config.claimUrl}" target="_blank" rel="noopener">${icon('gift')}${this.config.claimLabel}</a>`}
        </section>` : ''}
      <button class="button primary end-again" data-action="again">${icon('refresh')}Play again</button>`
    this.card.hidden = false
    this.card.scrollTop = 0

    const number = this.card.querySelector('.end-score b')!
    const counter = { value: 0 }
    gsap.fromTo(this.card, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.35 })
    gsap.from(this.card.querySelector('.end-junior'), { y: 60, scale: 0.6, duration: 0.6, ease: 'elastic.out(1, 0.5)' })
    gsap.to(counter, {
      value: state.score,
      duration: 1.2,
      delay: 0.3,
      ease: 'power2.out',
      onUpdate: () => {
        number.textContent = String(Math.round(counter.value))
      },
    })

    const toggle = this.card.querySelector<HTMLButtonElement>('.end-log-toggle')
    if (toggle) {
      toggle.onclick = () => {
        const log = this.card.querySelector<HTMLElement>('.end-log')!
        log.hidden = !log.hidden
        toggle.innerHTML = `${icon('list-check')}${log.hidden ? 'See my answers' : 'Hide my answers'}`
        toggle.setAttribute('aria-expanded', String(!log.hidden))
        if (!log.hidden) gsap.from(log.children, { x: -12, autoAlpha: 0, duration: 0.2, stagger: 0.03 })
      }
    }
    gsap.from(this.card.querySelectorAll('.end-dots i'), { scale: 0, duration: 0.25, stagger: 0.04, delay: 0.5, ease: 'back.out(3)' })

    if (this.leaderboard.enabled) this.wireBoard(state, won, runId)
    if (claimed) void this.hideClaimIfFull()
    this.card.onpointerdown = () => options.onActivity?.()
    this.card.oninput = () => options.onActivity?.()

    return new Promise((resolve) => {
      this.resolve = resolve
      this.card.querySelector<HTMLButtonElement>('[data-action="again"]')!.onclick = () => this.dismiss()
    })
  }

  /** Leaves the claim button out once all the Family Duo accounts are claimed. */
  private async hideClaimIfFull(): Promise<void> {
    const url = this.config.claimStatusUrl
    if (!url) return
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 6000)
      const response = await fetch(`${url}?action=status`, { redirect: 'follow', signal: controller.signal })
      const status = (await response.json()) as { kssm_left?: number; igcse_left?: number }
      if (status.kssm_left === 0 && status.igcse_left === 0) {
        this.card.querySelector<HTMLElement>('.end-claim')?.remove()
      }
    } catch {
      // Can't tell, so the button stays.
    }
  }

  private wireBoard(state: RunState, won: boolean, runId: string): void {
    const form = this.card.querySelector<HTMLFormElement>('.end-name')!
    const input = form.querySelector<HTMLInputElement>('input')!
    const post = form.querySelector<HTMLButtonElement>('.end-post')!
    const note = this.card.querySelector<HTMLElement>('.end-board-note')!
    const list = this.card.querySelector<HTMLElement>('.board-list')!
    const tabs = [...this.card.querySelectorAll<HTMLButtonElement>('.board-tabs button')]
    const filters = [...this.card.querySelectorAll<HTMLButtonElement>('.board-levels button')]
    let board: Board | null = null
    let tab: 'today' | 'weekend' = 'today'
    // Opens on the level just played; "All" mixes every level's board.
    let filter: LevelId | 'all' = state.level.id
    let mine: (BoardRow & { level: LevelId }) | null = null

    const render = () => {
      for (const button of tabs) button.setAttribute('aria-selected', String(button.dataset.tab === tab))
      for (const button of filters) button.setAttribute('aria-pressed', String(button.dataset.level === filter))
      if (!board) return
      const levels = this.config.levels.filter((l) => filter === 'all' || l.id === filter)
      const rows = levels
        .flatMap((l) => (board!.shared && filter === 'all' && l !== levels[0] ? [] : (board!.levels[l.id]?.[tab] ?? []).map((row) => ({ ...row, level: l }))))
        .sort((a, b) => b.score - a.score || b.wave - a.wave)
        .slice(0, 20)
      if (rows.length === 0) {
        list.innerHTML = `<li class="board-empty">No scores yet${tab === 'today' ? ' today' : ''}. Post yours to be first!</li>`
        return
      }
      let marked = false
      list.innerHTML = rows
        .map((row, i) => {
          const you = !marked && mine !== null && row.name === mine.name && row.score === mine.score && row.level.id === mine.level
          if (you) marked = true
          const tag = filter === 'all' && !board!.shared ? `<span class="board-level level-${row.level.id}" title="${row.level.name}">${row.level.label}</span>` : ''
          return `<li class="${you ? 'is-you' : ''}">
              <span class="board-rank">${i + 1}</span>
              <span class="board-name">${escape(row.name)}${tag}</span>
              <span class="board-wave">${row.won ? `${icon('crown')}` : `W${row.wave}`}</span>
              <b>${row.score}</b>
            </li>`
        })
        .join('')
      list.querySelector('.is-you')?.scrollIntoView({ block: 'nearest' })
    }

    const load = async () => {
      board = await this.leaderboard.board()
      if (!board) {
        list.innerHTML = `<li class="board-empty">The leaderboard can't be reached right now. Your best is saved on this device.</li>`
        return
      }
      render()
    }
    void load()

    for (const button of tabs) {
      button.onclick = () => {
        tab = button.dataset.tab as 'today' | 'weekend'
        render()
      }
    }
    for (const button of filters) {
      button.onclick = () => {
        filter = button.dataset.level as LevelId | 'all'
        render()
      }
    }
    this.card.querySelector<HTMLButtonElement>('.end-dice')!.onclick = () => {
      input.value = makeName()
      note.textContent = ''
    }
    input.oninput = () => {
      const clean = cleanName(input.value)
      if (clean !== input.value) input.value = clean
    }

    form.onsubmit = async (event) => {
      event.preventDefault()
      const name = cleanName(input.value).trim()
      if (!name) {
        note.textContent = 'Type a name first, or tap the dice for one.'
        return
      }
      post.disabled = true
      post.textContent = 'Posting…'
      note.textContent = ''
      const result = await this.leaderboard.submit({
        name,
        score: state.score,
        wave: Math.min(state.wave, 15),
        won,
        mathsRight: state.questionsRight,
        mathsAsked: state.questionsAsked,
        run: runId,
        level: state.level.id,
      })
      if (result.ok) {
        mine = { name, score: state.score, wave: state.wave, won, level: state.level.id }
        form.hidden = true
        note.innerHTML = result.todayRank
          ? `You're <b>number ${result.todayRank}</b> today${result.weekendRank && result.weekendRank <= 20 ? ` and number ${result.weekendRank} this weekend` : ''}!`
          : 'Posted! Not in the top 20 yet. Play again to climb.'
        if (result.todayRank === 1) note.classList.add('is-top')
        await load()
        return
      }
      post.disabled = false
      post.textContent = 'Post my score'
      if (result.reason === 'name') {
        note.textContent = "That name can't go on the board. Try another, or tap the dice."
        input.focus()
      } else if (result.reason === 'busy') {
        note.textContent = 'The leaderboard is busy. Try again in a moment.'
      } else if (result.reason === 'invalid') {
        note.textContent = 'Names can use letters, numbers and spaces.'
      } else {
        note.textContent = "Couldn't reach the leaderboard. Your best is saved on this device. Try again in a moment."
      }
    }
  }
}

/**
 * The maths report: how many were right, a dot per question, and the full
 * list (question, their answer, the right one when they missed) behind a
 * button, whether the run was won or not.
 */
function mathsHtml(answers: AnswerLog[]): string {
  if (answers.length === 0) {
    return `<section class="end-maths-card is-empty"><p>${icon('calculator')}Tip: tap the calculator buttons to trade a quick maths question for upgrades.</p></section>`
  }
  const right = answers.filter((a) => a.correct).length
  const share = right / answers.length
  const cheer = share >= 0.9 ? 'Maths whizz!' : share >= 0.7 ? 'Great maths!' : share >= 0.4 ? 'Good effort!' : 'Keep practising!'
  const rows = answers
    .map((a) => {
      const sum = a.text.replace(/ = \?$/, '')
      const verdict = a.correct
        ? ''
        : `<span class="end-log-miss">${a.given === null ? 'Out of time' : `You said ${formatNumber(a.given)}`}</span>`
      return `<li class="${a.correct ? 'is-right' : 'is-wrong'}">
          ${icon(a.correct ? 'circle-check' : 'circle-x')}
          <span class="end-log-sum">${sum} = <b>${formatNumber(a.answer)}</b>${verdict}</span>
          <span class="end-log-for">${escape(a.forWhat)} · W${a.wave}</span>
        </li>`
    })
    .join('')
  return `<section class="end-maths-card">
      <div class="end-maths-head">
        <span class="end-maths-score"><b>${right}</b>/${answers.length}</span>
        <span class="end-maths-label"><strong>${cheer}</strong>maths questions right</span>
      </div>
      <div class="end-dots" aria-hidden="true">${answers.map((a) => `<i class="${a.correct ? 'is-right' : 'is-wrong'}"></i>`).join('')}</div>
      <button type="button" class="button end-log-toggle" aria-expanded="false">${icon('list-check')}See my answers</button>
      <ol class="end-log" hidden>${rows}</ol>
    </section>`
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
