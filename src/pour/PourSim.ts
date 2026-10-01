import RAPIER from '@dimforge/rapier2d-compat'
import type { BoardDef, GateDef, Tuning } from '../content/types'
import type { Rng } from '../rng'

// The rules and physics of one pour, with no drawing. PourView draws it; the
// same class can be run on its own to measure what a board pays out.
//
// Units: board units, origin at the bottom-left, y up. The board is
// tuning.board.width wide and tuning.board.height tall.

export type PourPhase = 'aim' | 'pouring' | 'settling' | 'done'
export type NutExit = 'banked' | 'eaten' | 'lost'

export interface Nut {
  id: number
  body: RAPIER.RigidBody
  /** How many nuts this one stands for. Above 1 once the screen is full. */
  value: number
  usedGates: Set<number>
  bounces: number
  bornAt: number
}

export interface Gate {
  id: number
  type: GateDef['type']
  x: number
  y: number
  w: number
  /**
   * Multiplier for a multiply gate; nuts still to swallow for a subtract
   * gate; nuts still needed to break a lock.
   */
  value: number
  /** Teleports only: the name shared with the other end. */
  pair?: string
  /** Teleports only: nuts come out here but cannot go in. */
  exitOnly?: boolean
  hidden: boolean
  active: boolean
  moving: boolean
  /** Locks only: how far the middle has bent down under the nuts, in board units. */
  sag?: number
}

export interface PourListener {
  nutAdded?(nut: Nut): void
  nutRemoved?(nut: Nut, exit: NutExit, x: number, y: number): void
  gateHit?(gate: Gate): void
  gateChanged?(gate: Gate): void
  banked?(total: number, added: number): void
  phaseChanged?(phase: PourPhase): void
}

export interface PourOptions {
  board: BoardDef
  tuning: Tuning
  startNuts: number
  rng: Rng
  mirror?: boolean
  listener?: PourListener
}

const WALL_RADIUS = 0.11
const POST_RADIUS = 0.13
const LOCK_RADIUS = 0.14
/** How far a lock's middle bends down just before it breaks, in board units. */
export const LOCK_MAX_SAG = 0.45
const LOCK_PIECES = 6

interface Lock {
  gate: Gate
  body: RAPIER.RigidBody
  colliders: RAPIER.Collider[]
  /** Nuts it took to break when the pour began. */
  start: number
  touched: Set<number>
  /** When it snaps, once it holds enough. */
  breakAt: number | null
}

/** Height of a bent lock at `x` from its middle: a curve, lowest in the middle. */
export function lockDip(x: number, w: number, sag: number): number {
  const t = (2 * x) / w
  return -sag * (1 - t * t)
}

// Who touches whom. A nut thrown up by a bounce pad flies through other nuts
// and through gates until it starts to fall again.
const SOLID = 0b0001
const NUT = 0b0010
const RISING = 0b0100
const SENSOR = 0b1000
const groups = (member: number, touches: number) => (member << 16) | touches
const SOLID_GROUPS = groups(SOLID, NUT | RISING)
const NUT_GROUPS = groups(NUT, SOLID | NUT | SENSOR)
const RISING_GROUPS = groups(RISING, SOLID)
const SENSOR_GROUPS = groups(SENSOR, NUT)

interface MovingGate {
  gate: Gate
  body: RAPIER.RigidBody
  baseX: number
  range: number
  period: number
  stopped: boolean
}

export class PourSim {
  readonly tuning: Tuning
  readonly startNuts: number
  readonly nuts: Nut[] = []
  readonly gates: Gate[] = []
  /** Wall segments to draw: [x1, y1, x2, y2]. The basket's own sides are left out. */
  readonly walls: [number, number, number, number][] = []

  /** Who hears about what happens. The view sets itself here. */
  listener: PourListener

  phase: PourPhase = 'aim'
  cupX: number
  remaining: number
  banked = 0
  /** Nuts left stranded when the pour ended. */
  lost = 0
  time = 0

  private readonly world: RAPIER.World
  private readonly events: RAPIER.EventQueue
  private readonly rng: Rng
  private readonly nutByCollider = new Map<number, Nut>()
  private readonly gateByCollider = new Map<number, Gate>()
  private readonly movers: MovingGate[] = []
  private readonly rising = new Set<Nut>()
  private readonly lockByCollider = new Map<number, Lock>()
  private readonly locks: Lock[] = []
  private basketCollider = -1
  private nextNutId = 1
  private pourBudget = 0
  private lastProgressAt = 0
  private nudged = false
  private pourStartedAt = 0

  constructor(options: PourOptions) {
    const { board, tuning, startNuts, rng, mirror = false, listener = {} } = options
    this.tuning = tuning
    this.startNuts = startNuts
    this.remaining = startNuts
    this.rng = rng
    this.listener = listener
    this.cupX = tuning.board.width / 2

    this.world = new RAPIER.World({ x: 0, y: tuning.physics.gravity })
    this.world.timestep = 1 / tuning.physics.stepsPerSecond
    this.events = new RAPIER.EventQueue(true)

    this.buildFrame()
    const flip = (x: number) => (mirror ? tuning.board.width - x : x)
    for (const [x1, y1, x2, y2] of board.walls) this.addWall(flip(x1), y1, flip(x2), y2)
    for (const def of board.gates) this.addGate(def, flip(def.x))
    if (board.hideOne && rng() < tuning.pour.hideOneChance) this.hideOneGate()
  }

  /** Fixed step length in seconds. */
  get stepSeconds(): number {
    return this.world.timestep
  }

  setCupX(x: number): void {
    if (this.phase !== 'aim') return
    const { width, cupRange } = this.tuning.board
    const mid = width / 2
    this.cupX = Math.min(mid + cupRange, Math.max(mid - cupRange, x))
  }

  pour(): void {
    if (this.phase !== 'aim') return
    this.pourStartedAt = this.time
    this.lastProgressAt = this.time
    this.setPhase('pouring')
  }

  /**
   * Raises `count` random multiply gates by one each, in order, and returns
   * them. Gates the player can see go first; with more upgrades than gates,
   * it goes round again.
   */
  upgradeMultipliers(count: number): Gate[] {
    const all = this.gates.filter((g) => g.type === 'multiply')
    const visible = all.filter((g) => !g.hidden)
    const order = [...this.shuffled(visible), ...this.shuffled(all.filter((g) => g.hidden))]
    const upgraded: Gate[] = []
    for (let i = 0; i < count && order.length > 0; i++) {
      const gate = order[i % order.length]
      gate.value += 1
      upgraded.push(gate)
    }
    return upgraded
  }

  private shuffled<T>(items: T[]): T[] {
    const copy = [...items]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }

  step(): void {
    if (this.phase === 'done') return
    const dt = this.world.timestep
    this.time += dt

    for (const mover of this.movers) {
      if (mover.stopped) continue
      const offset = (mover.range / 2) * Math.sin((Math.PI * this.time) / mover.period)
      mover.gate.x = mover.baseX + offset
      mover.body.setNextKinematicTranslation({ x: mover.gate.x, y: mover.gate.y })
    }

    if (this.phase === 'pouring') this.pourFromCup(dt)
    this.landRisingNuts()

    this.world.step(this.events)

    const gateHits: [Nut, Gate][] = []
    const lockHits: [Nut, number][] = []
    const basketHits: Nut[] = []
    this.events.drainCollisionEvents((a, b, started) => {
      if (!started) return
      const nut = this.nutByCollider.get(a) ?? this.nutByCollider.get(b)
      if (!nut) return
      const other = this.nutByCollider.has(a) ? b : a
      if (other === this.basketCollider) basketHits.push(nut)
      else if (this.lockByCollider.has(other)) lockHits.push([nut, other])
      else {
        const gate = this.gateByCollider.get(other)
        if (gate) gateHits.push([nut, gate])
      }
    })
    for (const [nut, gate] of gateHits) this.applyGate(nut, gate)
    for (const [nut, handle] of lockHits) this.touchLock(nut, handle)
    this.weighLocks()
    for (const nut of basketHits) this.bank(nut)

    if (this.phase === 'settling') this.checkFinished()
  }

  /** Runs the whole pour with no drawing and returns what was banked. */
  runToEnd(cupX: number): number {
    this.setCupX(cupX)
    this.pour()
    while (this.phase !== 'done') this.step()
    return this.banked
  }

  destroy(): void {
    this.events.free()
    this.world.free()
  }

  // ---- building ---------------------------------------------------------

  private buildFrame(): void {
    const b = this.tuning.board
    const mid = b.width / 2
    const frame = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    const solid = (desc: RAPIER.ColliderDesc) =>
      this.world.createCollider(desc.setFriction(0).setRestitution(0.2).setCollisionGroups(SOLID_GROUPS), frame)

    // Side walls and a ceiling, just outside the visible board.
    solid(RAPIER.ColliderDesc.cuboid(0.5, b.height).setTranslation(-0.5, b.height / 2))
    solid(RAPIER.ColliderDesc.cuboid(0.5, b.height).setTranslation(b.width + 0.5, b.height / 2))
    solid(RAPIER.ColliderDesc.cuboid(b.width, 0.5).setTranslation(mid, b.height + 0.5))

    // Funnel into the basket, then the basket's own sides and floor.
    const left = mid - b.basketHalfWidth
    const right = mid + b.basketHalfWidth
    this.addWall(0, b.funnelTopY, left, b.funnelBottomY)
    this.addWall(b.width, b.funnelTopY, right, b.funnelBottomY)
    this.addWall(left, b.funnelBottomY, left, b.basketFloorY, false)
    this.addWall(right, b.funnelBottomY, right, b.basketFloorY, false)
    solid(RAPIER.ColliderDesc.cuboid(b.basketHalfWidth, 0.25).setTranslation(mid, b.basketFloorY - 0.25))

    // Anything that drops into the basket is banked.
    const depth = b.funnelBottomY - b.basketFloorY
    const basket = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(b.basketHalfWidth, depth / 2 - 0.25)
        .setTranslation(mid, b.basketFloorY + depth / 2 - 0.25)
        .setSensor(true)
        .setCollisionGroups(SENSOR_GROUPS)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      frame,
    )
    this.basketCollider = basket.handle
  }

  private addWall(x1: number, y1: number, x2: number, y2: number, drawn = true): void {
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.hypot(dx, dy)
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation((x1 + x2) / 2, (y1 + y2) / 2)
        // A capsule lies along its own y axis, so turn it from there.
        .setRotation(Math.atan2(dy, dx) - Math.PI / 2),
    )
    this.world.createCollider(
      RAPIER.ColliderDesc.capsule(length / 2, WALL_RADIUS)
        .setFriction(0)
        .setRestitution(0.2)
        .setCollisionGroups(SOLID_GROUPS),
      body,
    )
    if (drawn) this.walls.push([x1, y1, x2, y2])
  }

  private addGate(def: GateDef, x: number): void {
    const gate: Gate = {
      id: this.gates.length,
      type: def.type,
      x,
      y: def.y,
      w: def.w,
      value:
        def.type === 'multiply'
          ? def.value
          : def.type === 'subtract'
            ? Math.max(1, Math.round(def.fraction * this.startNuts))
            : def.type === 'lock'
              ? Math.max(3, Math.round(def.fraction * this.startNuts))
              : 0,
      hidden: false,
      active: true,
      moving: !!def.move,
      pair: def.type === 'teleport' ? def.pair : undefined,
      exitOnly: def.type === 'teleport' ? !!def.exitOnly : undefined,
    }
    if (def.type === 'lock') {
      this.addLock(gate)
      return
    }
    const bodyDesc = def.move ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed()
    const body = this.world.createRigidBody(bodyDesc.setTranslation(x, def.y))
    const sensor = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(def.w / 2, 0.1)
        .setSensor(true)
        .setCollisionGroups(SENSOR_GROUPS)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    )
    this.gateByCollider.set(sensor.handle, gate)
    this.gates.push(gate)

    if (def.move) {
      // A moving gate carries a solid post at each end.
      for (const side of [-1, 1]) {
        this.world.createCollider(
          RAPIER.ColliderDesc.ball(POST_RADIUS)
            .setTranslation((side * def.w) / 2, 0)
            .setFriction(0)
            .setRestitution(0.2)
            .setCollisionGroups(SOLID_GROUPS),
          body,
        )
      }
      this.movers.push({ gate, body, baseX: x, range: def.move.range, period: def.move.period, stopped: false })
    }
  }

  private addLock(gate: Gate): void {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(gate.x, gate.y))
    gate.sag = 0
    const lock: Lock = { gate, body, colliders: [], start: gate.value, touched: new Set(), breakAt: null }
    this.locks.push(lock)
    this.shapeLock(lock)
    this.gates.push(gate)
  }

  /**
   * Gives a lock its solid shape for how bent it is: a chain of short pieces
   * along the curve, so nuts sit in the dip the player sees.
   */
  private shapeLock(lock: Lock): void {
    const { gate, body } = lock
    gate.sag = LOCK_MAX_SAG * (1 - gate.value / lock.start)
    this.dropLockColliders(lock)
    for (let i = 0; i < LOCK_PIECES; i++) {
      const x1 = -gate.w / 2 + (gate.w * i) / LOCK_PIECES
      const x2 = -gate.w / 2 + (gate.w * (i + 1)) / LOCK_PIECES
      const y1 = lockDip(x1, gate.w, gate.sag)
      const y2 = lockDip(x2, gate.w, gate.sag)
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.capsule(Math.hypot(x2 - x1, y2 - y1) / 2, LOCK_RADIUS)
          .setTranslation((x1 + x2) / 2, (y1 + y2) / 2)
          .setRotation(Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2)
          .setFriction(0)
          .setRestitution(0.1)
          .setCollisionGroups(SOLID_GROUPS)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body,
      )
      lock.colliders.push(collider)
      this.lockByCollider.set(collider.handle, lock)
    }
  }

  private dropLockColliders(lock: Lock): void {
    for (const collider of lock.colliders) {
      this.lockByCollider.delete(collider.handle)
      this.world.removeCollider(collider, true)
    }
    lock.colliders = []
  }

  private breakLock(lock: Lock): void {
    lock.breakAt = null
    lock.gate.value = 0
    lock.gate.active = false
    this.dropLockColliders(lock)
  }

  private hideOneGate(): void {
    const pool = this.gates.filter((g) => g.type === 'multiply' || g.type === 'subtract')
    if (pool.length > 0) pool[Math.floor(this.rng() * pool.length)].hidden = true
  }

  // ---- nuts -------------------------------------------------------------

  private pourFromCup(dt: number): void {
    this.pourBudget += this.tuning.nut.pourPerSecond * dt
    while (this.pourBudget >= 1 && this.remaining > 0) {
      this.pourBudget -= 1
      this.remaining -= 1
      const jitter = (this.rng() - 0.5) * 0.12
      this.addNut(this.cupX + jitter, this.tuning.board.cupY - 0.75, (this.rng() - 0.5) * 0.5, -2, 1, null)
    }
    if (this.remaining === 0) this.setPhase('settling')
  }

  private addNut(x: number, y: number, vx: number, vy: number, value: number, parent: Nut | null): Nut {
    const t = this.tuning.nut
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y)
        .setLinvel(vx, vy)
        .setAngvel((this.rng() - 0.5) * 12)
        .setLinearDamping(t.linearDamping)
        .setAngularDamping(0.4)
        .setCanSleep(false),
    )
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(t.radius)
        .setFriction(0)
        .setRestitution(t.restitution)
        .setCollisionGroups(NUT_GROUPS),
      body,
    )
    const nut: Nut = {
      id: this.nextNutId++,
      body,
      value,
      usedGates: new Set(parent?.usedGates),
      bounces: parent?.bounces ?? 0,
      bornAt: this.time,
    }
    this.nutByCollider.set(collider.handle, nut)
    this.nuts.push(nut)
    this.listener.nutAdded?.(nut)
    return nut
  }

  /** A bounced nut rejoins the others once it stops climbing. */
  private landRisingNuts(): void {
    for (const nut of this.rising) {
      if (nut.body.linvel().y > 0) continue
      nut.body.collider(0).setCollisionGroups(NUT_GROUPS)
      this.rising.delete(nut)
    }
  }

  private removeNut(nut: Nut, exit: NutExit): void {
    const index = this.nuts.indexOf(nut)
    if (index < 0) return
    this.nuts.splice(index, 1)
    const at = nut.body.translation()
    this.rising.delete(nut)
    this.nutByCollider.delete(nut.body.collider(0).handle)
    this.world.removeRigidBody(nut.body)
    this.listener.nutRemoved?.(nut, exit, at.x, at.y)
  }

  private isAlive(nut: Nut): boolean {
    return this.nuts.includes(nut)
  }

  // ---- gates ------------------------------------------------------------

  private applyGate(nut: Nut, gate: Gate): void {
    if (!gate.active || !this.isAlive(nut)) return

    // A moving gate stops for good where the first nut meets it.
    if (gate.moving) {
      const mover = this.movers.find((m) => m.gate === gate)
      if (mover) mover.stopped = true
    }

    if (gate.type === 'bounce') {
      if (nut.bounces >= this.tuning.gate.maxBouncesPerNut) return
      nut.bounces += 1
      this.bounce(nut, gate)
      this.listener.gateHit?.(gate)
      return
    }

    if (nut.usedGates.has(gate.id)) return
    nut.usedGates.add(gate.id)
    if (gate.hidden) {
      gate.hidden = false
      this.listener.gateChanged?.(gate)
    }
    if (gate.type === 'multiply') this.multiply(nut, gate.value)
    else if (gate.type === 'teleport') this.teleport(nut, gate)
    else this.subtract(nut, gate)
    this.listener.gateHit?.(gate)
    this.lastProgressAt = this.time
  }

  private multiply(nut: Nut, factor: number): void {
    // Make real copies while there is room on screen; past that, the nut
    // carries the extra as value.
    const room = Math.max(0, this.tuning.nut.maxOnScreen - this.nuts.length)
    const copies = Math.min(factor - 1, room)
    const at = nut.body.translation()
    const velocity = nut.body.linvel()
    const spread = this.tuning.nut.radius
    for (let i = 0; i < copies; i++) {
      this.addNut(
        at.x + (this.rng() - 0.5) * spread * 2,
        at.y + (this.rng() - 0.5) * spread,
        velocity.x * 0.5 + (this.rng() - 0.5) * 3,
        velocity.y * 0.5 + (this.rng() - 0.5),
        nut.value,
        nut,
      )
    }
    nut.value *= factor - copies
  }

  private teleport(nut: Nut, gate: Gate): void {
    if (gate.exitOnly) return
    const exit = this.gates.find((g) => g.pair === gate.pair && g !== gate)
    if (!exit) return
    nut.usedGates.add(exit.id)
    const at = nut.body.translation()
    const offset = Math.max(-exit.w / 2 + 0.2, Math.min(exit.w / 2 - 0.2, at.x - gate.x))
    const velocity = nut.body.linvel()
    nut.body.setTranslation({ x: exit.x + offset, y: exit.y - 0.3 }, true)
    nut.body.setLinvel({ x: velocity.x * 0.5, y: Math.min(velocity.y, -1.5) }, true)
    this.listener.gateHit?.(exit)
  }

  /** A nut landing on a lock uses up some of what it needs. */
  private touchLock(nut: Nut, handle: number): void {
    const lock = this.lockByCollider.get(handle)
    if (lock) this.loadLock(lock, nut)
  }

  /**
   * Nuts settling on the pile above a lock weigh on it as well, not only the
   * ones touching it, so it gives way once enough nuts sit on it.
   */
  private weighLocks(): void {
    for (const lock of this.locks) {
      const { gate } = lock
      if (!gate.active) continue
      if (lock.breakAt !== null) {
        if (this.time >= lock.breakAt) {
          this.breakLock(lock)
          this.listener.gateChanged?.(gate)
        }
        continue
      }
      const { pileHeight, settleSpeed } = this.tuning.lock
      const half = gate.w / 2
      const floor = gate.y + lockDip(0, gate.w, gate.sag ?? 0) - 0.2
      for (const nut of this.nuts) {
        if (lock.touched.has(nut.id) || this.rising.has(nut)) continue
        const at = nut.body.translation()
        if (Math.abs(at.x - gate.x) > half || at.y < floor || at.y > gate.y + pileHeight) continue
        const v = nut.body.linvel()
        if (v.x * v.x + v.y * v.y > settleSpeed * settleSpeed) continue
        this.loadLock(lock, nut)
        if (lock.breakAt !== null) break
      }
    }
  }

  /** Takes a nut's weight; at zero the lock creaks, then snaps. */
  private loadLock(lock: Lock, nut: Nut): void {
    const { gate } = lock
    if (!gate.active || lock.breakAt !== null || lock.touched.has(nut.id) || !this.isAlive(nut)) return
    lock.touched.add(nut.id)
    gate.value = Math.max(0, gate.value - nut.value)
    this.lastProgressAt = this.time
    if (gate.value === 0) lock.breakAt = this.time + this.tuning.lock.creakSeconds
    this.shapeLock(lock)
    this.listener.gateChanged?.(gate)
    this.listener.gateHit?.(gate)
  }

  private subtract(nut: Nut, gate: Gate): void {
    const taken = Math.min(nut.value, gate.value)
    gate.value -= taken
    nut.value -= taken
    if (gate.value === 0) gate.active = false
    this.listener.gateChanged?.(gate)
    if (nut.value === 0) this.removeNut(nut, 'eaten')
  }

  private bounce(nut: Nut, gate: Gate): void {
    // Aim at a point well above the pad, then knock the angle about a little.
    const at = nut.body.translation()
    const spreadRadians = (this.tuning.gate.bounceAngleDegrees * Math.PI) / 180
    const angle = Math.atan2(gate.x - at.x, 10) + (this.rng() * 2 - 1) * spreadRadians
    const speed = this.tuning.gate.bounceSpeed
    nut.body.setLinvel({ x: Math.sin(angle) * speed, y: Math.cos(angle) * speed }, true)
    nut.body.collider(0).setCollisionGroups(RISING_GROUPS)
    this.rising.add(nut)
    this.lastProgressAt = this.time
  }

  private bank(nut: Nut): void {
    if (!this.isAlive(nut)) return
    this.banked += nut.value
    this.lastProgressAt = this.time
    const added = nut.value
    this.removeNut(nut, 'banked')
    this.listener.banked?.(this.banked, added)
  }

  // ---- ending -----------------------------------------------------------

  private checkFinished(): void {
    if (this.nuts.length === 0) {
      this.setPhase('done')
      return
    }
    const p = this.tuning.pour
    const tooLong = this.time - this.pourStartedAt > p.maxSeconds
    const quiet = this.time - this.lastProgressAt > p.stuckSeconds
    if (!tooLong && !(quiet && this.allSlow())) return
    if (!tooLong && this.unstick()) return
    for (const nut of [...this.nuts]) {
      this.lost += nut.value
      this.removeNut(nut, 'lost')
    }
    this.setPhase('done')
  }

  /**
   * Everything left has stopped. Before calling those nuts lost: break any
   * lock still holding some, or give stuck nuts one small nudge.
   * Returns whether it did anything.
   */
  private unstick(): boolean {
    const locks = new Set(this.lockByCollider.values())
    if (locks.size > 0) {
      for (const lock of locks) {
        this.breakLock(lock)
        this.listener.gateChanged?.(lock.gate)
      }
      this.lastProgressAt = this.time
      return true
    }
    if (this.nudged) return false
    this.nudged = true
    for (const nut of this.nuts) {
      nut.body.applyImpulse({ x: (this.rng() - 0.5) * 1.2, y: 0.8 }, true)
    }
    this.lastProgressAt = this.time
    return true
  }

  private allSlow(): boolean {
    return this.nuts.every((nut) => {
      const v = nut.body.linvel()
      return v.x * v.x + v.y * v.y < 0.16
    })
  }

  private setPhase(phase: PourPhase): void {
    this.phase = phase
    this.listener.phaseChanged?.(phase)
  }
}
