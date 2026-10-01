import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import gsap from 'gsap'
import { sound } from '../audio/sound'
import { confetti } from '../fight/effects'
import type { Art } from '../content/art'
import { colour, font } from '../theme'
import { LOCK_MAX_SAG, lockDip, type Gate, type Nut, type NutExit, type PourListener, type PourSim } from './PourSim'

// Draws one pour. Works in "design pixels": 100 per board unit, y down, so a
// board 8 wide is 800 across. The owner scales this container to fit.

export const PX = 100

const WALL_WIDTH = 22
const CUP_LIP_OFFSET = 0.4 // the cup sits this far left of where it pours
const CUP_TILT = 1.95

interface GateArt {
  root: Container
  bar: Graphics
  label: Text
  chevrons: Graphics
  /** Locks only: the bend as drawn, which springs after the real one. */
  bend: { sag: number }
  /** Nuts through this gate so far; a multiplier swells a little with each. */
  hits: number
}

/** Blends two colours: share 0 is `a`, 1 is `b`. */
function mix(a: number, b: number, share: number): number {
  const channel = (shift: number) => {
    const from = (a >> shift) & 0xff
    const to = (b >> shift) & 0xff
    return Math.round(from + (to - from) * share) << shift
  }
  return channel(16) | channel(8) | channel(0)
}

/** One colour per teleport pair, so the two ends read as a pair. */
const PORTAL_COLOURS = [colour.teal, colour.pink, colour.blue]

interface Spark {
  shape: Graphics
  vx: number
  vy: number
  life: number
}

export class PourView implements PourListener {
  readonly root = new Container()

  private readonly nutLayer = new Container()
  private readonly sparkLayer = new Container()
  private readonly aimLine = new Graphics()
  private readonly cup = new Container()
  private readonly cupBody = new Container()
  private readonly cupCount: Text
  private readonly basketCount: Text
  private readonly basketFront = new Container()
  private readonly gateArt = new Map<number, GateArt>()
  private readonly nutSprites = new Map<number, Sprite>()
  private readonly sparks: Spark[] = []
  private readonly height: number
  private readonly nutTexture: Texture
  private readonly superNutTexture: Texture
  private readonly nutAspect: number
  private shownBanked = 0

  constructor(
    private readonly sim: PourSim,
    private readonly art: Art,
  ) {
    const b = sim.tuning.board
    this.height = b.height
    this.nutTexture = art.texture('nut')
    this.superNutTexture = art.texture('nut-super')
    this.nutAspect = art.aspect('nut')

    this.root.addChild(this.drawPanel())
    this.root.addChild(this.aimLine)
    const walls = this.drawWalls()
    const clip = new Graphics().roundRect(0, 0, b.width * PX, b.height * PX, 36).fill(colour.white)
    walls.mask = clip
    this.root.addChild(clip, walls)
    for (const gate of sim.gates) this.root.addChild(this.buildGate(gate).root)
    this.root.addChild(this.nutLayer, this.sparkLayer)

    this.basketCount = this.makeText('0', 64, colour.content)
    this.root.addChild(this.buildBasket())

    this.cupCount = this.makeText(String(sim.remaining), 52, colour.white)
    this.root.addChild(this.buildCup())

    this.update(0)
  }

  /** Plays the board's arrival: gates pop in, the cup drops into place. */
  enter(): void {
    const gates = [...this.gateArt.values()].map((art) => art.root.scale)
    gsap.from(gates, { x: 0, y: 0, duration: 0.35, ease: 'back.out(2)', stagger: 0.05 })
    gsap.from(this.cupBody, { y: -260, duration: 0.45, ease: 'bounce.out' })
    gsap.from(this.cupCount, { alpha: 0, duration: 0.3, delay: 0.3 })
  }

  /**
   * Plays the "Upgrade gates" card: a sparkle flies from the cup to each
   * upgraded gate, which then shows its new value.
   */
  showUpgrades(gates: Gate[]): void {
    const counts = new Map<Gate, number>()
    for (const gate of gates) counts.set(gate, (counts.get(gate) ?? 0) + 1)
    let delay = 0.55 // after the board has arrived
    for (const [gate, count] of counts) {
      const art = this.gateArt.get(gate.id)!
      const sparkle = new Sprite(this.art.texture('fx-sparkle'))
      sparkle.anchor.set(0.5)
      sparkle.scale.set(0.9)
      sparkle.position.set(this.sim.cupX * PX, this.y(this.sim.tuning.board.cupY))
      sparkle.alpha = 0
      this.sparkLayer.addChild(sparkle)
      // Show the old value until the sparkle lands.
      art.label.text = `×${gate.value - count}`
      gsap
        .timeline({ delay })
        .set(sparkle, { alpha: 1 })
        .to(sparkle, { x: gate.x * PX, y: this.y(gate.y), rotation: 3, duration: 0.4, ease: 'power2.in' })
        .add(() => {
          if (this.destroyed) return
          sparkle.destroy()
          this.paintGate(gate, art)
          this.gateHit(gate)
          this.floatText(gate.x, gate.y + 0.55, `+${count}×`)
        })
      delay += 0.22
    }
  }

  /** Board x for a pointer position given in this container's own pixels. */
  boardX(localX: number): number {
    return localX / PX
  }

  /** Call once per drawn frame, after the sim has been stepped. */
  update(frameSeconds: number): void {
    const sim = this.sim
    const b = sim.tuning.board
    const size = sim.tuning.nut.radius * 2 * PX * 1.35

    for (const nut of sim.nuts) {
      const sprite = this.nutSprites.get(nut.id)
      if (!sprite) continue
      const at = nut.body.translation()
      sprite.position.set(at.x * PX, this.y(at.y))
      sprite.rotation = -nut.body.rotation()
      // Pop in over the first tenth of a second. A super nut stands for many.
      const grow = Math.min(1, 0.55 + (sim.time - nut.bornAt) * 4.5)
      const isSuper = nut.value > 1
      const scale = grow * (isSuper ? 1.35 : 1)
      sprite.texture = isSuper ? this.superNutTexture : this.nutTexture
      sprite.height = size * scale
      sprite.width = size * scale * this.nutAspect
    }

    for (const gate of sim.gates) {
      if (gate.moving) this.gateArt.get(gate.id)!.root.x = gate.x * PX
    }

    this.cup.position.set((sim.cupX - CUP_LIP_OFFSET) * PX, this.y(b.cupY))
    this.cupCount.text = String(sim.remaining)
    this.drawAimLine()
    this.updateSparks(frameSeconds)
  }

  destroy(): void {
    this.destroyed = true
    // Stop every animation still running on anything in the board, so none
    // of them touches it after it is gone.
    const stop = (node: Container) => {
      gsap.killTweensOf([node, node.scale, node.position])
      for (const child of node.children) stop(child)
    }
    stop(this.root)
    for (const art of this.gateArt.values()) gsap.killTweensOf(art.bend)
    this.root.destroy({ children: true })
  }

  private destroyed = false

  // ---- sim events -------------------------------------------------------

  nutAdded(nut: Nut): void {
    const sprite = new Sprite(this.nutTexture)
    sprite.anchor.set(0.5)
    this.nutSprites.set(nut.id, sprite)
    this.nutLayer.addChild(sprite)
  }

  nutRemoved(nut: Nut, exit: NutExit, x: number, y: number): void {
    const sprite = this.nutSprites.get(nut.id)
    if (sprite) {
      this.nutSprites.delete(nut.id)
      sprite.destroy()
    }
    if (exit === 'eaten') this.burst(x, y, colour.error, 5)
    if (exit === 'lost') this.burst(x, y, colour.hint, 3)
  }

  gateHit(gate: Gate): void {
    const art = this.gateArt.get(gate.id)!
    this.gateSound(gate)
    if (gate.type === 'lock') {
      // The lock gives under the nut and springs back to its new bend.
      if (!gate.active) return
      gsap.killTweensOf(art.bend)
      gsap.fromTo(
        art.bend,
        { sag: (gate.sag ?? 0) + 0.12 },
        { sag: gate.sag ?? 0, duration: 0.5, ease: 'elastic.out(1.2, 0.3)', onUpdate: () => this.paintGate(gate, art) },
      )
      return
    }
    // Busy multipliers grow (up to a third bigger), so the hot gates stand out.
    if (gate.type === 'multiply') art.hits += 1
    const size = 1 + Math.min(0.32, art.hits * 0.012)
    gsap.killTweensOf(art.root.scale)
    art.root.scale.set(size * 1.08, size * 1.35)
    gsap.to(art.root.scale, { x: size, y: size, duration: 0.25, ease: 'back.out(3)' })
  }

  gateChanged(gate: Gate): void {
    const art = this.gateArt.get(gate.id)!
    this.paintGate(gate, art)
    if (gate.type === 'lock' && gate.active && gate.value === 0 && !gsap.isTweening(art.root)) {
      // Holding enough: it strains and shakes for a moment before it gives.
      gsap.fromTo(art.root, { rotation: -0.03 }, { rotation: 0.03, duration: 0.06, yoyo: true, repeat: -1, ease: 'sine.inOut' })
      this.burst(gate.x, gate.y, colour.peach, 4)
    }
    if (gate.active) return
    if (gate.type === 'lock') {
      // The lock snaps: pieces fly and the bar is gone.
      gsap.killTweensOf(art.root)
      art.root.rotation = 0
      sound.play('lock-break')
      for (let i = -2; i <= 2; i++) this.burst(gate.x + (i * gate.w) / 5, gate.y, colour.peach, 3)
      gsap.to(art.root, { alpha: 0, duration: 0.15 })
    } else {
      gsap.to(art.root, { alpha: 0.18, duration: 0.3 })
    }
  }

  banked(total: number): void {
    if (total === this.shownBanked) return
    this.shownBanked = total
    this.basketCount.text = String(total)
    sound.play('bank')
    gsap.killTweensOf(this.basketCount.scale)
    this.basketCount.scale.set(1.25)
    gsap.to(this.basketCount.scale, { x: 1, y: 1, duration: 0.2, ease: 'power2.out' })
  }

  phaseChanged(phase: string): void {
    if (phase === 'pouring') {
      gsap.to(this.cupBody, { rotation: CUP_TILT, duration: 0.18, ease: 'power2.out' })
      gsap.to(this.cupCount, { y: -4, duration: 0.18 })
    }
    if (phase === 'done' && this.sim.banked >= Math.max(80, this.sim.startNuts * 5)) {
      // A big haul: confetti over the board.
      const b = this.sim.tuning.board
      confetti(this.sparkLayer, b.width * PX, b.height * PX, 80)
      const label = this.makeText('Big haul!', 84, colour.orange)
      label.style.stroke = { color: 0xffffff, width: 12 }
      label.position.set((b.width / 2) * PX, this.y(b.height * 0.55))
      this.sparkLayer.addChild(label)
      gsap.fromTo(label.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2.5)' })
      gsap.to(label, { alpha: 0, duration: 0.4, delay: 1.2 })
      sound.play('win', { volume: 0.6 })
    }
    if (phase === 'done') {
      gsap.fromTo(
        this.basketFront.scale,
        { x: 1.12, y: 1.12 },
        { x: 1, y: 1, duration: 0.5, ease: 'elastic.out(1, 0.45)' },
      )
    }
  }

  private gateSound(gate: Gate): void {
    if (gate.type === 'multiply') {
      // Bigger multipliers ring a little higher.
      sound.play('pour-gate', { rate: 0.9 + Math.min(gate.value, 6) * 0.06 })
    } else if (gate.type === 'bounce') sound.play('bounce')
    else if (gate.type === 'teleport') sound.play('portal')
    else if (gate.type === 'subtract') sound.play('hit', { rate: 0.8, volume: 0.5 })
  }

  // ---- building ---------------------------------------------------------

  private y(boardY: number): number {
    return (this.height - boardY) * PX
  }

  private makeText(text: string, size: number, fill: number, family: string = font.heading): Text {
    const label = new Text({ text, style: { fontFamily: family, fontSize: size, fill } })
    label.anchor.set(0.5)
    return label
  }

  private drawPanel(): Graphics {
    const b = this.sim.tuning.board
    return new Graphics()
      .roundRect(0, 0, b.width * PX, b.height * PX, 36)
      .fill(colour.cream)
      .stroke({ width: 2, color: colour.border })
  }

  private drawWalls(): Graphics {
    const walls = new Graphics()
    for (const [x1, y1, x2, y2] of this.sim.walls) {
      walls.moveTo(x1 * PX, this.y(y1)).lineTo(x2 * PX, this.y(y2))
    }
    return walls.stroke({ width: WALL_WIDTH, color: colour.content, cap: 'round' })
  }

  private buildGate(gate: Gate): GateArt {
    const root = new Container()
    root.position.set(gate.x * PX, this.y(gate.y))
    const art: GateArt = {
      root,
      bar: new Graphics(),
      label: this.makeText('', 40, colour.white),
      chevrons: new Graphics(),
      bend: { sag: 0 },
      hits: 0,
    }
    root.addChild(art.bar, art.chevrons, art.label)
    this.gateArt.set(gate.id, art)
    this.paintGate(gate, art)
    if (gate.type === 'teleport') this.pulsePortal(gate, art)
    return art
  }

  private portalColour(gate: Gate): number {
    const pairs = [...new Set(this.sim.gates.filter((g) => g.pair).map((g) => g.pair))]
    return PORTAL_COLOURS[pairs.indexOf(gate.pair) % PORTAL_COLOURS.length]
  }

  /**
   * Rings that never stop, so a portal reads as one: an end that takes nuts
   * in draws its rings inwards, an end that only lets them out sends them out.
   */
  private pulsePortal(gate: Gate, art: GateArt): void {
    const w = gate.w * PX
    const h = this.sim.tuning.gate.height * PX
    const tint = this.portalColour(gate)
    const out = !!gate.exitOnly
    for (let i = 0; i < 2; i++) {
      const ring = new Graphics().roundRect(-w / 2, -h / 2, w, h, h / 2).stroke({ width: 6, color: tint })
      art.root.addChildAt(ring, 0)
      gsap.fromTo(
        ring.scale,
        { x: out ? 1 : 1.18, y: out ? 1 : 1.9 },
        { x: out ? 1.18 : 1, y: out ? 1.9 : 1, duration: 1.2, ease: out ? 'power1.out' : 'power1.in', repeat: -1, delay: i * 0.6 },
      )
      gsap.fromTo(
        ring,
        { alpha: out ? 0.9 : 0 },
        { alpha: out ? 0 : 0.9, duration: 1.2, ease: 'none', repeat: -1, delay: i * 0.6 },
      )
    }
    // The slot itself glows on and off.
    gsap.to(art.bar, { alpha: 0.75, duration: 0.6, yoyo: true, repeat: -1, ease: 'sine.inOut' })
  }

  private paintGate(gate: Gate, art: GateArt): void {
    const w = gate.w * PX
    const h = this.sim.tuning.gate.height * PX
    let fill: number = colour.orange
    let ink: number = colour.white
    let text = ''

    if (gate.hidden) {
      fill = colour.teal
      ink = colour.content
      text = '?'
    } else if (gate.type === 'multiply') {
      text = `×${gate.value}`
      if (gate.value <= 2) {
        fill = colour.amber
        ink = colour.content
      } else if (gate.value >= 4) {
        fill = colour.pink
      }
    } else if (gate.type === 'subtract') {
      fill = colour.error
      text = gate.active ? `−${gate.value}` : ''
    } else if (gate.type === 'teleport') {
      fill = colour.content
    } else if (gate.type === 'lock') {
      this.paintLock(gate, art, w, h)
      return
    } else {
      fill = colour.blue
    }

    art.bar.clear().roundRect(-w / 2, -h / 2, w, h, h / 2).fill(fill)
    if (gate.type === 'teleport') {
      // A glowing slot: nuts that drop in come out of the other one.
      art.bar.roundRect(-w / 2 + 14, -h / 2 + 10, w - 28, h - 20, (h - 20) / 2).fill(this.portalColour(gate))
    }
    if (gate.moving) {
      // The solid posts at each end of a moving gate.
      art.bar.circle(-w / 2, 0, 15).circle(w / 2, 0, 15).fill(colour.content)
    }

    art.chevrons.clear()
    if (gate.type === 'bounce' && !gate.hidden) {
      for (const dy of [-9, 5]) {
        art.chevrons.moveTo(-22, dy + 9).lineTo(0, dy - 5).lineTo(22, dy + 9)
      }
      art.chevrons.stroke({ width: 7, color: colour.white, cap: 'round', join: 'round' })
    }

    art.label.text = text
    art.label.style.fill = ink
    art.label.position.set(0, 0)
  }

  /**
   * A lock bends further down the more nuts it holds, warms from peach to
   * orange, and cracks just before it gives.
   */
  private paintLock(gate: Gate, art: GateArt, w: number, h: number): void {
    const sag = art.bend.sag
    const strain = Math.min(1, (gate.sag ?? 0) / LOCK_MAX_SAG)
    const dip = (x: number) => -lockDip(x / PX, gate.w, sag) * PX
    const fill = strain < 0.5 ? mix(colour.peach, colour.amber, strain * 2) : mix(colour.amber, colour.orange, strain * 2 - 1)
    const inset = h / 2
    const curve = (g: Graphics) => {
      const steps = 16
      for (let i = 0; i <= steps; i++) {
        const x = -w / 2 + inset + ((w - inset * 2) * i) / steps
        if (i === 0) g.moveTo(x, dip(x))
        else g.lineTo(x, dip(x))
      }
    }
    art.bar.clear()
    curve(art.bar)
    art.bar.stroke({ width: h + 8, color: colour.content, cap: 'round', join: 'round' })
    curve(art.bar)
    art.bar.stroke({ width: h, color: fill, cap: 'round', join: 'round' })
    // Cracks open up one by one as the load grows.
    const cracks = [-w * 0.22, w * 0.2, -w * 0.02].slice(0, strain >= 1 ? 3 : strain >= 0.7 ? 2 : strain >= 0.4 ? 1 : 0)
    for (const x of cracks) {
      const y = dip(x)
      art.bar
        .moveTo(x - 7, y - h / 2 + 1)
        .lineTo(x + 6, y - 7)
        .lineTo(x - 5, y + 3)
        .lineTo(x + 7, y + h / 2 - 1)
        .moveTo(x + 6, y - 7)
        .lineTo(x + 14, y - 10)
    }
    if (cracks.length > 0) art.bar.stroke({ width: 4, color: colour.content, cap: 'round', join: 'round' })
    if (gate.active) {
      // Padlock drawn to the left of the count.
      const x = -38
      const y = dip(x)
      art.bar.roundRect(x - 13, y - 8, 26, 20, 4).fill(colour.content)
      art.bar.arc(x, y - 8, 8, Math.PI, 0).stroke({ width: 4, color: colour.content })
    }
    art.chevrons.clear()
    art.label.text = gate.active && gate.value > 0 ? String(gate.value) : ''
    art.label.style.fill = colour.content
    art.label.position.set(14, dip(14))
  }

  private buildBasket(): Container {
    const b = this.sim.tuning.board
    const sprite = new Sprite(this.art.texture('basket'))
    sprite.anchor.set(0.5)
    sprite.width = (b.basketHalfWidth * 2 + 0.5) * PX
    sprite.height = sprite.width / this.art.aspect('basket')
    // Rim level with the bottom of the funnel, so the basket hides its own walls.
    const top = this.y(b.funnelBottomY) - 26
    this.basketFront.position.set((b.width / 2) * PX, top + sprite.height / 2)
    this.basketCount.y = sprite.height * 0.12
    this.basketFront.addChild(sprite, this.basketCount)
    return this.basketFront
  }

  private buildCup(): Container {
    // Only the cup tips over; the number on it stays upright.
    const sprite = new Sprite(this.art.texture('cup'))
    sprite.anchor.set(0.5)
    sprite.height = 1.45 * PX
    sprite.width = sprite.height * this.art.aspect('cup')
    this.cupBody.addChild(sprite)
    this.cupCount.y = 16
    this.cup.addChild(this.cupBody, this.cupCount)
    return this.cup
  }

  private drawAimLine(): void {
    this.aimLine.clear()
    if (this.sim.phase !== 'aim') return
    const x = this.sim.cupX * PX
    const from = this.y(this.sim.tuning.board.cupY - 0.8)
    const to = this.y(this.sim.tuning.board.funnelTopY)
    for (let y = from; y < to; y += 34) this.aimLine.moveTo(x, y).lineTo(x, y + 14)
    this.aimLine.stroke({ width: 6, color: colour.hint, cap: 'round' })
  }

  private floatText(boardX: number, boardY: number, text: string): void {
    const label = this.makeText(text, 44, colour.orange)
    label.position.set(boardX * PX, this.y(boardY))
    this.sparkLayer.addChild(label)
    gsap.to(label, { y: label.y - 70, alpha: 0, duration: 0.8, ease: 'power1.out', onComplete: () => label.destroy() })
  }

  // ---- sparks -----------------------------------------------------------

  private burst(boardX: number, boardY: number, fill: number, count: number): void {
    if (this.sparks.length > 120) return
    for (let i = 0; i < count; i++) {
      const shape = new Graphics().circle(0, 0, 7).fill(fill)
      shape.position.set(boardX * PX, this.y(boardY))
      const angle = Math.random() * Math.PI * 2
      const speed = 120 + Math.random() * 220
      this.sparks.push({ shape, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.35 })
      this.sparkLayer.addChild(shape)
    }
  }

  private updateSparks(seconds: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const spark = this.sparks[i]
      spark.life -= seconds
      if (spark.life <= 0) {
        spark.shape.destroy()
        this.sparks.splice(i, 1)
        continue
      }
      spark.shape.x += spark.vx * seconds
      spark.shape.y += spark.vy * seconds
      spark.shape.alpha = spark.life / 0.35
      spark.shape.scale.set(spark.life / 0.35)
    }
  }
}
