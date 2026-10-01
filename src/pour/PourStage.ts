import type { Application } from 'pixi.js'
import gsap from 'gsap'
import type { Art } from '../content/art'
import type { BoardDef, Content } from '../content/types'
import { makeRng } from '../rng'
import { PourSim } from './PourSim'
import { PourView, PX } from './PourView'

// Runs pours on the canvas: builds the sim and its view, takes the drag,
// steps the physics at a fixed rate and fits the board to the screen.

const MARGIN = 16
const MAX_STEPS_PER_FRAME = 6

export interface PourRequest {
  board: BoardDef
  startNuts: number
  seed: number
  mirror?: boolean
  /** Random multiply gates to raise by one before the pour starts. */
  upgradeGates?: number
  /** Bring the board up from below the screen instead of showing it in place. */
  slideIn?: boolean
}

export class PourStage {
  private sim: PourSim | null = null
  private view: PourView | null = null
  private carry = 0
  private dragging = false
  private finished: ((banked: number) => void) | null = null
  /** How far below its place the board is, as a share of the screen height. */
  private readonly offset = { y: 0 }

  constructor(
    private readonly app: Application,
    private readonly content: Content,
    private readonly art: Art,
  ) {
    const canvas = app.canvas
    canvas.addEventListener('pointerdown', (event) => {
      if (this.sim?.phase !== 'aim') return
      this.dragging = true
      canvas.setPointerCapture(event.pointerId)
      this.aim(event)
    })
    canvas.addEventListener('pointermove', (event) => {
      // With a mouse the cup follows the pointer without a button held, and a
      // click pours; on touch it follows the finger while it is down.
      if (this.dragging || (event.pointerType === 'mouse' && this.sim?.phase === 'aim')) this.aim(event)
    })
    const release = () => {
      if (!this.dragging) return
      this.dragging = false
      this.sim?.pour()
    }
    canvas.addEventListener('pointerup', release)
    canvas.addEventListener('pointercancel', release)
    app.ticker.add((ticker) => this.frame(ticker.deltaMS / 1000))
  }

  /** The pour in progress, for the browser console and automated checks. */
  get current(): PourSim | null {
    return this.sim
  }

  /** Shows a board and resolves with the nuts banked once the pour is over. */
  play(request: PourRequest): Promise<number> {
    this.clear()
    const sim = new PourSim({
      board: request.board,
      tuning: this.content.tuning,
      startNuts: request.startNuts,
      rng: makeRng(request.seed),
      mirror: request.mirror,
    })
    const view = new PourView(sim, this.art)
    sim.listener = {
      nutAdded: (nut) => view.nutAdded(nut),
      nutRemoved: (nut, exit, x, y) => view.nutRemoved(nut, exit, x, y),
      gateHit: (gate) => view.gateHit(gate),
      gateChanged: (gate) => view.gateChanged(gate),
      banked: (total) => view.banked(total),
      phaseChanged: (phase) => {
        view.phaseChanged(phase)
        if (phase === 'done') this.finished?.(sim.banked)
      },
    }
    this.sim = sim
    this.view = view
    this.app.stage.addChild(view.root)
    gsap.killTweensOf(this.offset)
    this.offset.y = request.slideIn ? 1 : 0
    this.fit()
    if (request.slideIn) gsap.to(this.offset, { y: 0, duration: 0.45, ease: 'power3.out' })
    view.enter()
    if (request.upgradeGates) view.showUpgrades(sim.upgradeMultipliers(request.upgradeGates))
    return new Promise((resolve) => {
      this.finished = resolve
    })
  }

  /** Drops the board off the bottom of the screen, then clears it. */
  async slideOut(): Promise<void> {
    await gsap.to(this.offset, { y: 1, duration: 0.35, ease: 'power2.in' })
    this.clear()
  }

  clear(): void {
    this.finished = null
    this.dragging = false
    this.carry = 0
    this.view?.destroy()
    this.sim?.destroy()
    this.view = null
    this.sim = null
  }

  /**
   * Pours one board from a sweep of cup positions with no drawing, and
   * reports what each banked, lost and how long it took.
   */
  measure(
    boardId: string,
    startNuts = 12,
    mirror = false,
  ): { cupX: number; banked: number; lost: number; seconds: number; gateHits: number[] }[] {
    const board = this.content.boards.find((b) => b.id === boardId)
    if (!board) throw new Error(`No board called ${boardId}`)
    const rows = []
    for (let cupX = 1; cupX <= 7; cupX += 0.5) {
      // Two seeds per spot, so moving gates are caught at different moments.
      for (const seed of [7, 8]) {
        const sim = new PourSim({ board, tuning: this.content.tuning, startNuts, rng: makeRng(seed), mirror })
        const gateHits = sim.gates.map(() => 0)
        sim.listener = { gateHit: (gate) => (gateHits[gate.id] += 1) }
        const banked = sim.runToEnd(cupX)
        rows.push({ cupX, banked, lost: sim.lost, seconds: Math.round(sim.time * 10) / 10, gateHits })
        sim.destroy()
      }
    }
    return rows
  }

  private aim(event: PointerEvent): void {
    if (!this.sim || !this.view) return
    const bounds = this.app.canvas.getBoundingClientRect()
    const local = (event.clientX - bounds.left - this.view.root.x) / this.view.root.scale.x
    this.sim.setCupX(this.view.boardX(local))
  }

  private frame(seconds: number): void {
    if (!this.sim || !this.view) return
    this.fit()
    // Fixed physics steps, however fast the screen draws.
    this.carry += Math.min(seconds, 0.1)
    const step = this.sim.stepSeconds
    let steps = 0
    while (this.carry >= step && steps < MAX_STEPS_PER_FRAME && this.sim.phase !== 'done') {
      this.sim.step()
      this.carry -= step
      steps += 1
    }
    if (steps === MAX_STEPS_PER_FRAME) this.carry = 0
    this.view.update(seconds)
  }

  private fit(): void {
    if (!this.view) return
    const b = this.content.tuning.board
    const width = this.app.screen.width - MARGIN * 2
    const height = this.app.screen.height - MARGIN * 2
    const scale = Math.min(width / (b.width * PX), height / (b.height * PX))
    this.view.root.scale.set(scale)
    this.view.root.position.set(
      (this.app.screen.width - b.width * PX * scale) / 2,
      (this.app.screen.height - b.height * PX * scale) / 2 + this.offset.y * this.app.screen.height,
    )
  }
}
