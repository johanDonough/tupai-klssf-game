import gsap from 'gsap'
import { sound } from '../audio/sound'
import { iconUrl } from '../content/load'
import type { AnswerFormat, Question } from '../questions/questions'
import type { Rng } from '../rng'

// The maths question: the sum, a draining timer, and either four answers to
// tap or a number pad. Resolves with whether it was answered right in time.

export interface AskOptions {
  /** What the question is for, e.g. "Ricochet" or "Revive Junior". */
  title: string
  format: AnswerFormat
  seconds: number
  /** What a right answer is worth, e.g. "Each right answer: +8 health". */
  note?: string
  /**
   * The wave quiz's own look: green for healing, amber for bonus nuts. It
   * sits low on the screen so Junior stays in view above it.
   */
  look?: QuizLook
}

export type QuizLook = 'heal' | 'nuts' | 'revive'

/** 340000 → "340,000", so big answers are easy to read. */
export const formatNumber = (value: number) => value.toLocaleString('en-US')

export interface AskResult {
  correct: boolean
  given: number | null
  milliseconds: number
}

const icon = (name: string) => `<span class="icon" style="--icon: url('${iconUrl(name)}')"></span>`

export class QuestionPanel {
  private readonly overlay: HTMLElement

  constructor(
    stage: HTMLElement,
    private readonly rng: Rng,
  ) {
    stage.insertAdjacentHTML('beforeend', `<div class="quiz" hidden role="dialog" aria-modal="true"></div>`)
    this.overlay = stage.querySelector('.quiz')!
  }

  get isOpen(): boolean {
    return !this.overlay.hidden
  }

  ask(question: Question, options: AskOptions): Promise<AskResult> {
    const typed = options.format === 'typed'
    const look = options.look
    this.overlay.className = `quiz${look ? ` is-low is-${look}` : ''}`
    const titleIcon = look === 'heal' ? 'heart-plus' : look === 'nuts' ? 'basket-plus' : look === 'revive' ? 'heart' : 'calculator'
    this.overlay.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-for">${icon(titleIcon)}<span>${options.title}</span></div>
        ${options.note ? `<p class="quiz-note">${options.note}</p>` : ''}
        <div class="quiz-timer"><i></i></div>
        <div class="quiz-sum${question.text.length > 13 ? ' is-long' : ''}">${question.text} = <span class="quiz-typed">${typed ? '' : '?'}</span></div>
        ${typed ? this.padHtml() : this.choicesHtml(question)}
        <div class="quiz-result" aria-live="polite"></div>
      </div>`
    this.overlay.hidden = false
    const card = this.overlay.querySelector<HTMLElement>('.quiz-card')!
    const timer = this.overlay.querySelector<HTMLElement>('.quiz-timer i')!
    const shown = this.overlay.querySelector<HTMLElement>('.quiz-typed')!
    const result = this.overlay.querySelector<HTMLElement>('.quiz-result')!
    gsap.fromTo(this.overlay, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15 })
    gsap.fromTo(card, { y: 40, scale: 0.9 }, { y: 0, scale: 1, duration: 0.3, ease: 'back.out(2)' })

    return new Promise((resolve) => {
      const started = performance.now()
      let done = false
      let entry = ''
      let lastTick = 0

      const finish = (correct: boolean, given: number | null) => {
        if (done) return
        done = true
        clock.kill()
        document.removeEventListener('keydown', onKey)
        const milliseconds = Math.round(performance.now() - started)
        card.classList.add(correct ? 'is-right' : 'is-wrong')
        sound.play(correct ? 'correct' : 'wrong')
        result.innerHTML = correct
          ? `${icon('check')}<b>Correct!</b>`
          : `${icon('x')}<span>${given === null ? 'Out of time.' : 'Not quite.'} It's <b>${formatNumber(question.answer)}</b></span>`
        if (!correct) shown.textContent = formatNumber(question.answer)
        for (const button of this.overlay.querySelectorAll<HTMLButtonElement>('button')) {
          button.disabled = true
          if (Number(button.dataset.value) === question.answer) button.classList.add('is-answer')
        }
        gsap.fromTo(result, { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.2 })
        if (!correct) gsap.fromTo(card, { x: -10 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)' })
        gsap
          .to(this.overlay, { autoAlpha: 0, duration: 0.2, delay: correct ? 0.5 : 1.0 })
          .then(() => {
            this.overlay.hidden = true
            resolve({ correct, given, milliseconds })
          })
      }

      const clock = gsap.fromTo(
        timer,
        { width: '100%' },
        {
          width: '0%',
          duration: options.seconds,
          ease: 'none',
          // A plain function, so `this` is the tween: GSAP calls this once
          // while the tween is still being made, before `clock` exists.
          onUpdate(this: gsap.core.Tween) {
            // A tick for each of the last three seconds.
            const left = Math.ceil(options.seconds * (1 - this.progress()))
            if (left <= 3 && left !== lastTick) {
              lastTick = left
              sound.play('tick')
            }
          },
          onComplete: () => finish(false, null),
        },
      )

      const press = (key: string) => {
        if (done) return
        if (!typed) return
        if (key === 'back') entry = entry.slice(0, -1)
        else if (entry.length < 5) entry += key
        shown.textContent = entry
        // No enter key: right as soon as it matches, wrong once it is as
        // long as the answer and does not.
        const target = String(question.answer)
        if (entry === target) finish(true, Number(entry))
        else if (entry.length >= target.length) finish(false, Number(entry))
      }

      const onKey = (event: KeyboardEvent) => {
        if (/^[0-9]$/.test(event.key)) press(event.key)
        else if (event.key === 'Backspace') press('back')
      }
      document.addEventListener('keydown', onKey)

      this.overlay.onclick = (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
        if (!button || done) return
        if (typed) {
          sound.play('button')
          press(button.dataset.key!)
        }
        else {
          const given = Number(button.dataset.value)
          button.classList.add('is-chosen')
          finish(given === question.answer, given)
        }
      }
    })
  }

  private choicesHtml(question: Question): string {
    const options = [question.answer, ...question.wrong]
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1))
      ;[options[i], options[j]] = [options[j], options[i]]
    }
    return `<div class="quiz-choices">${options
      .map((value) => `<button class="quiz-choice" data-value="${value}">${formatNumber(value)}</button>`)
      .join('')}</div>`
  }

  private padHtml(): string {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back']
    return `<div class="quiz-pad">${keys
      .map((key) =>
        key === ''
          ? '<span></span>'
          : `<button class="quiz-key" data-key="${key}" ${key === 'back' ? 'aria-label="Delete"' : ''}>${
              key === 'back' ? icon('backspace') : key
            }</button>`,
      )
      .join('')}</div>`
  }
}
