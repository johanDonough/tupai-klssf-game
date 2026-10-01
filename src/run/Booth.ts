// Booth mode (?booth in the address), for the Tupai booth's own device:
// the title screen becomes an attract screen, the page can't be scrolled,
// zoomed or long-pressed, and a game left alone goes back to the start.

const WARNING_SECONDS = 10

export class Booth {
  private idleTimer = 0
  private countdown = 0
  private watching = false
  private readonly prompt: HTMLElement

  constructor(
    stage: HTMLElement,
    private readonly idleSeconds: number,
  ) {
    stage.insertAdjacentHTML(
      'beforeend',
      `<div class="booth-idle" hidden>
         <div class="booth-idle-card">
           <h2>Still playing?</h2>
           <p>Tap anywhere to carry on. Starting over in <b>${WARNING_SECONDS}</b></p>
         </div>
       </div>`,
    )
    this.prompt = stage.querySelector('.booth-idle')!
    const activity = () => this.activity()
    window.addEventListener('pointerdown', activity, true)
    window.addEventListener('keydown', activity, true)
    // No long-press menus, pinch zoom or double-tap zoom on the booth screen.
    document.addEventListener('contextmenu', (event) => event.preventDefault())
    document.addEventListener('gesturestart', (event) => event.preventDefault())
    document.addEventListener('dblclick', (event) => event.preventDefault())
    document.documentElement.classList.add('is-booth')
  }

  /** Starts watching for a player who has walked away. */
  watch(): void {
    this.watching = true
    this.activity()
  }

  /** Stops watching, e.g. on the title screen, which is meant to sit idle. */
  rest(): void {
    this.watching = false
    clearTimeout(this.idleTimer)
    this.hidePrompt()
  }

  /** Someone touched the screen. */
  activity(): void {
    this.hidePrompt()
    clearTimeout(this.idleTimer)
    if (!this.watching) return
    this.idleTimer = window.setTimeout(() => this.warn(), this.idleSeconds * 1000)
  }

  private warn(): void {
    this.prompt.hidden = false
    let left = WARNING_SECONDS
    const number = this.prompt.querySelector('b')!
    number.textContent = String(left)
    this.countdown = window.setInterval(() => {
      left -= 1
      number.textContent = String(left)
      // The simplest clean start for the next visitor is a fresh page.
      if (left <= 0) location.reload()
    }, 1000)
  }

  private hidePrompt(): void {
    clearInterval(this.countdown)
    this.prompt.hidden = true
  }
}
