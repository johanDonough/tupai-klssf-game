import gsap from 'gsap'
import { sound } from '../audio/sound'
import { artUrl, iconUrl } from '../content/load'
import type { LevelDef } from '../content/types'
import { levelButtonsHtml, waitForLevel } from './levels'

// "How to play": story-style slides, each with a little looping animation.
// Tap the right side (or Next) to go on, the left side to go back; each
// slide also moves on by itself. The last slide starts a game at the chosen
// level, or plays the tutorial again from the start.

const icon = (name: string) => `<span class="icon" style="--icon: url('${iconUrl(name)}')"></span>`
const img = (name: string, className: string) => `<img class="${className}" src="${artUrl(`${name}.webp`)}" alt="" />`
const SLIDE_SECONDS = 7

interface Slide {
  title: string
  text: string
  scene: string
  /** Builds the slide's looping animation; it is killed when the slide is left. */
  play?: (scene: HTMLElement) => gsap.core.Timeline
}

const SLIDES: Slide[] = [
  {
    title: 'Junior vs the Muddles',
    text: 'Junior throws nuts at the Muddles all by himself. Clear all 15 waves and beat King Muddle to win!',
    scene: `${img('junior-idle', 't-junior')}${img('muddle-melee-small-idle', 't-muddle')}${img('nut', 't-nut')}<b class="t-damage">12</b>`,
    play: (scene) => {
      const junior = scene.querySelector<HTMLImageElement>('.t-junior')!
      const muddle = scene.querySelector<HTMLElement>('.t-muddle')!
      const nut = scene.querySelector<HTMLElement>('.t-nut')!
      const damage = scene.querySelector<HTMLElement>('.t-damage')!
      return gsap
        .timeline({ repeat: -1, repeatDelay: 0.4 })
        .set(nut, { x: 0, y: 0, autoAlpha: 0, rotation: 0 })
        .set(damage, { autoAlpha: 0, y: 0 })
        .call(() => (junior.src = artUrl('junior-throw.webp')), [], 0.2)
        .set(nut, { autoAlpha: 1 }, 0.25)
        .to(nut, { x: 150, duration: 0.45, ease: 'none' }, 0.25)
        .to(nut, { y: -50, duration: 0.22, ease: 'power2.out' }, 0.25)
        .to(nut, { y: 0, duration: 0.23, ease: 'power2.in' }, 0.47)
        .to(nut, { rotation: 540, duration: 0.45 }, 0.25)
        .call(() => (junior.src = artUrl('junior-idle.webp')), [], 0.6)
        .set(nut, { autoAlpha: 0 }, 0.7)
        .call(() => muddle.classList.add('is-hit'), [], 0.7)
        .fromTo(muddle, { x: 0 }, { x: 14, duration: 0.08, yoyo: true, repeat: 3 }, 0.7)
        .to(damage, { autoAlpha: 1, y: -30, duration: 0.3 }, 0.7)
        .call(() => muddle.classList.remove('is-hit'), [], 1.0)
        .to(damage, { autoAlpha: 0, duration: 0.3 }, 1.2)
    },
  },
  {
    title: 'Pour to multiply',
    text: 'After each fight, drag the cup (or move your mouse) and let go. Gates like ×2 and ×3 multiply your nuts on the way down!',
    scene: `<div class="t-board">
        ${img('cup', 't-cup')}
        <span class="t-gate">×2</span>
        ${img('nut', 't-drop t-drop-a')}${img('nut', 't-drop t-drop-b')}${img('nut', 't-drop t-drop-c')}
        <span class="t-basket"><b>0</b></span>
      </div>`,
    play: (scene) => {
      const cup = scene.querySelector<HTMLElement>('.t-cup')!
      const [a, b, c] = scene.querySelectorAll<HTMLElement>('.t-drop')
      const gate = scene.querySelector<HTMLElement>('.t-gate')!
      const count = scene.querySelector<HTMLElement>('.t-basket b')!
      const timeline = gsap.timeline({ repeat: -1, repeatDelay: 0.3 })
      timeline
        .call(() => (count.textContent = '0'))
        .set([a, b, c], { autoAlpha: 0, x: 0, y: 0 })
        .fromTo(cup, { x: -60 }, { x: 0, duration: 0.8, ease: 'power1.inOut' })
        .to(cup, { rotation: 100, duration: 0.2 })
        .set(a, { autoAlpha: 1 })
        .to(a, { y: 62, duration: 0.35, ease: 'power1.in' })
        .fromTo(gate, { scale: 1 }, { scale: 1.2, duration: 0.1, yoyo: true, repeat: 1 })
        .set(b, { autoAlpha: 1, y: 62 }, '<')
        .to(a, { x: -16, y: 128, duration: 0.4, ease: 'power1.in' }, '>-0.1')
        .to(b, { x: 16, y: 128, duration: 0.4, ease: 'power1.in' }, '<')
        .call(() => (count.textContent = '2'))
        .set([a, b], { autoAlpha: 0 })
        .set(c, { autoAlpha: 0 })
        .to(cup, { rotation: 0, duration: 0.2 }, '+=0.6')
      return timeline
    },
  },
  {
    title: 'Upgrade Junior',
    text: 'Spend your nuts on one of three upgrades after every pour. Tap the little icons at the top any time to see what Junior has.',
    scene: `<div class="t-cards">
        <span class="t-card">${icon('sword')}<b>Attack</b></span>
        <span class="t-card">${icon('shield')}<b>Armour</b></span>
        <span class="t-card">${icon('heart')}<b>Health</b></span>
      </div>
      <span class="t-wallet">${img('nut', 't-wallet-nut')}<b>120</b></span>
      <span class="t-finger">${icon('hand-finger')}</span>`,
    play: (scene) => {
      const cards = scene.querySelectorAll<HTMLElement>('.t-card')
      const finger = scene.querySelector<HTMLElement>('.t-finger')!
      const wallet = scene.querySelector<HTMLElement>('.t-wallet b')!
      return gsap
        .timeline({ repeat: -1, repeatDelay: 0.4 })
        .call(() => (wallet.textContent = '120'))
        .set(cards, { autoAlpha: 0, y: 40, scale: 1 })
        .set(finger, { autoAlpha: 0, x: 60, y: 60 })
        .to(cards, { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.1, ease: 'back.out(2)' })
        .to(finger, { autoAlpha: 1, x: 0, y: 0, duration: 0.5 }, '+=0.2')
        .to(finger, { scale: 0.85, duration: 0.1, yoyo: true, repeat: 1 })
        .to(cards[1], { scale: 1.15, duration: 0.15 }, '<')
        .call(() => (wallet.textContent = '60'))
        .to(cards[1], { y: -90, autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, '+=0.2')
        .to([cards[0], cards[2]], { y: 40, autoAlpha: 0, duration: 0.3 }, '<')
        .to(finger, { autoAlpha: 0, duration: 0.2 }, '<')
    },
  },
  {
    title: 'Maths makes you stronger',
    text: 'Answer quick maths questions in 7 seconds to win upgrades for free, heal Junior before each wave, and earn bonus nuts. The more you get right, the stronger he gets!',
    scene: `<div class="t-quiz">
        <span class="t-sum">6 × 7 = ?</span>
        <span class="t-choices"><i>48</i><i class="t-right">42</i><i>36</i><i>49</i></span>
      </div>
      <span class="t-finger">${icon('hand-finger')}</span>
      <b class="t-reward">+8 health</b>`,
    play: (scene) => {
      const right = scene.querySelector<HTMLElement>('.t-right')!
      const finger = scene.querySelector<HTMLElement>('.t-finger')!
      const reward = scene.querySelector<HTMLElement>('.t-reward')!
      return gsap
        .timeline({ repeat: -1, repeatDelay: 0.5 })
        .call(() => right.classList.remove('is-right'))
        .set(finger, { autoAlpha: 0, x: 70, y: 70 })
        .set(reward, { autoAlpha: 0, y: 0, scale: 0.6 })
        .to(finger, { autoAlpha: 1, x: 0, y: 0, duration: 0.6 }, 0.5)
        .to(finger, { scale: 0.85, duration: 0.1, yoyo: true, repeat: 1 })
        .call(() => right.classList.add('is-right'))
        .to(reward, { autoAlpha: 1, y: -24, scale: 1, duration: 0.35, ease: 'back.out(2)' })
        .to(finger, { autoAlpha: 0, duration: 0.2 }, '<')
        .to(reward, { autoAlpha: 0, duration: 0.3 }, '+=1')
    },
  },
]

export class Tutorial {
  private readonly overlay: HTMLElement

  constructor(stage: HTMLElement) {
    stage.insertAdjacentHTML('beforeend', `<div class="tutorial" hidden role="dialog" aria-modal="true" aria-label="How to play"></div>`)
    this.overlay = stage.querySelector('.tutorial')!
  }

  /** Plays the slides; resolves with a level to start, or null if closed. */
  show(levels: LevelDef[]): Promise<LevelDef | null> {
    const count = SLIDES.length + 1
    this.overlay.innerHTML = `
      <div class="story-bars">${Array.from({ length: count }, () => '<span><i></i></span>').join('')}</div>
      <button class="story-close" aria-label="Close">${icon('x')}</button>
      <div class="story-slides">
        ${SLIDES.map(
          (slide) => `
          <section class="story-slide">
            <div class="story-scene">${slide.scene}</div>
            <h2>${slide.title}</h2>
            <p>${slide.text}</p>
          </section>`,
        ).join('')}
        <section class="story-slide story-ready">
          ${'<img class="story-ready-junior" src="' + artUrl('junior-cheer.webp') + '" alt="" />'}
          <h2>Ready, hero?</h2>
          <p>Pick your level to start.</p>
          ${levelButtonsHtml(levels)}
          <button class="button story-again">${icon('refresh')}Watch again</button>
        </section>
      </div>
      <div class="story-nav">
        <button class="story-prev" aria-label="Back">${icon('chevron-left')}</button>
        <button class="story-next" aria-label="Next">${icon('chevron-right')}</button>
      </div>`
    this.overlay.hidden = false
    gsap.fromTo(this.overlay, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 })

    const slides = [...this.overlay.querySelectorAll<HTMLElement>('.story-slide')]
    const bars = [...this.overlay.querySelectorAll<HTMLElement>('.story-bars i')]
    let index = -1
    let loop: gsap.core.Timeline | null = null
    let timer: gsap.core.Tween | null = null

    const go = (next: number) => {
      if (next < 0 || next >= count || next === index) return
      sound.play('button')
      loop?.kill()
      timer?.kill()
      if (index >= 0) gsap.to(slides[index], { autoAlpha: 0, x: next > index ? -40 : 40, duration: 0.25 })
      index = next
      bars.forEach((bar, i) => gsap.set(bar, { width: i < index ? '100%' : '0%' }))
      const slide = slides[index]
      gsap.fromTo(slide, { autoAlpha: 0, x: 0, scale: 0.96 }, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'power2.out' })
      const def = SLIDES[index]
      if (def?.play) loop = def.play(slide.querySelector('.story-scene')!)
      // Story-style: each slide fills its bar, then moves on, except the last.
      if (index < count - 1) {
        timer = gsap.fromTo(bars[index], { width: '0%' }, { width: '100%', duration: SLIDE_SECONDS, ease: 'none', onComplete: () => go(index + 1) })
      } else {
        gsap.set(bars[index], { width: '100%' })
      }
      this.overlay.classList.toggle('is-last', index === count - 1)
    }

    return new Promise((resolve) => {
      const finish = (level: LevelDef | null) => {
        loop?.kill()
        timer?.kill()
        gsap.to(this.overlay, {
          autoAlpha: 0,
          duration: 0.2,
          onComplete: () => {
            this.overlay.hidden = true
            resolve(level)
          },
        })
      }
      this.overlay.querySelector<HTMLButtonElement>('.story-close')!.onclick = () => finish(null)
      this.overlay.querySelector<HTMLButtonElement>('.story-prev')!.onclick = () => go(index - 1)
      this.overlay.querySelector<HTMLButtonElement>('.story-next')!.onclick = () => go(index + 1)
      this.overlay.querySelector<HTMLButtonElement>('.story-again')!.onclick = () => go(0)
      // Tapping the left third goes back, anywhere else on a slide goes on.
      this.overlay.querySelector<HTMLElement>('.story-slides')!.onclick = (event) => {
        if ((event.target as HTMLElement).closest('button')) return
        const bounds = this.overlay.getBoundingClientRect()
        go(event.clientX - bounds.left < bounds.width / 3 ? index - 1 : index + 1)
      }
      void waitForLevel(this.overlay, levels).then(finish)
      go(0)
    })
  }
}
