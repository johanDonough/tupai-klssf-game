import { Container, Graphics, Sprite, Text, TilingSprite, type Application } from 'pixi.js'
import gsap from 'gsap'
import { sound } from '../audio/sound'
import type { Art } from '../content/art'
import { colour, font } from '../theme'
import { burst, confetti, drawLeafShield, fly, HEAL_GREEN, leaf, plusSign, rise, spark, star, swirl } from './effects'
import type { FightEvent, FightSim, Foe, Hit } from './FightSim'

// Draws the fight lane and plays a FightSim's events one by one. Below the
// lane sits the cup, which fills with the nuts beaten Muddles drop.
// Everything is in design pixels, 640 wide; the whole thing is scaled to fit.

const W = 640
const LANE_H = 470
const GROUND = 420
const JUNIOR_X = 135
const FIRST_SLOT = 345
const SLOT_GAP = 70

const FRAME = { junior: 255, small: 255, large: 255, boss: 375 }
// How tall the body is inside its 512 frame, for placing health bars.
const BODY_SHARE = { junior: 0.7, small: 0.47, large: 0.66, boss: 0.86 }

type Size = keyof typeof FRAME

interface Actor {
  root: Container
  body: Container
  sprite: Sprite
  bar: Graphics
  barFill: { value: number }
  maxHealth: number
  poses: string
  size: Size
  blink: gsap.core.Tween | null
}

const wait = (seconds: number) => gsap.timeline().to({}, { duration: seconds })

export class FightView {
  readonly root = new Container()
  private readonly lane = new Container()
  private readonly far: TilingSprite
  private readonly mid: TilingSprite
  private readonly ground: TilingSprite
  private readonly actors = new Container()
  /** Effects drawn behind the fighters, like the pluses rising during the wave quiz. */
  private readonly backFx = new Container()
  private readonly fx = new Container()
  private readonly collect = new Container()
  private readonly collectPanel = new Graphics()
  private readonly cup = new Container()
  private readonly cupCount: Text
  private readonly cupLabel: Text
  private readonly junior: Actor
  private readonly foes = new Map<number, Actor>()
  /** Junior's health as last shown, in points. */
  /** Junior's health as last shown. */
  heroHealth = 0
  private readonly heroHealthText: Text
  /** Armour, drawn as a leafy shield left of Junior's health bar. */
  private readonly shield = new Container()
  private readonly shieldText: Text
  private armour = 0
  private readonly laneMask = new Graphics()
  /** While the wave quiz is on: the pluses (or nuts) drifting up, and the banner. */
  private focusLoop: gsap.core.Tween | null = null
  private focusBanner: Container | null = null
  /** Junior's health bar beats like a heart while he is low. */
  private heartbeat: gsap.core.Timeline | null = null
  private readonly groups = new Graphics()
  /** The sim's own Muddle records, which it keeps up to date. */
  private readonly foeData = new Map<number, Foe>()
  private cupNuts = 0
  private collectHeight = 400
  private shift = { y: 0 }

  constructor(
    private readonly app: Application,
    private readonly art: Art,
  ) {
    const strip = (name: string, height: number) => {
      const texture = art.texture(name)
      const scale = W / texture.width
      const tile = new TilingSprite({ texture, width: W, height: texture.height * scale })
      tile.tileScale.set(scale)
      tile.y = height - tile.height
      return tile
    }
    this.far = strip('lane-far', GROUND - 24)
    this.mid = strip('lane-mid', GROUND + 4)
    this.ground = strip('lane-ground', GROUND + 48)
    this.lane.addChild(this.far, this.mid, this.ground, this.backFx, this.actors, this.fx)

    this.junior = this.makeActor('junior', 'junior', JUNIOR_X)
    this.actors.addChild(this.junior.root)
    // Junior's health in numbers, beside his bar.
    this.heroHealthText = this.text('', 26, colour.content)
    this.heroHealthText.anchor.set(0, 0.5)
    this.heroHealthText.position.set(68, this.junior.bar.y + 7)
    this.junior.root.addChild(this.heroHealthText)
    // Armour shows as a leafy shield with the amount it blocks inside.
    const shieldArt = drawLeafShield(new Graphics())
    this.shieldText = this.text('0', 22, colour.white)
    this.shieldText.style.stroke = { color: 0x1b6b2c, width: 5 }
    this.shieldText.y = 4
    this.shield.addChild(shieldArt, this.shieldText)
    this.shield.position.set(-94, this.junior.bar.y + 7)
    this.shield.visible = false
    this.junior.root.addChild(this.shield)
    this.groups.position.set(W - 24, 28)
    this.lane.addChild(this.groups)

    this.cupCount = this.text('0', 60, colour.white)
    this.cupLabel = this.text('Nuts for the pour', 26, colour.muted, font.body)
    const cupSprite = new Sprite(art.texture('cup'))
    cupSprite.anchor.set(0.5)
    cupSprite.height = 170
    cupSprite.width = cupSprite.height * art.aspect('cup')
    this.cupCount.y = 18
    this.cup.addChild(cupSprite, this.cupCount)
    this.collect.addChild(this.collectPanel, this.cup, this.cupLabel)

    this.root.addChild(this.lane, this.collect)
    // The lane is clipped to its own box, so zooming in on Junior stays inside it.
    this.laneMask.rect(0, 0, W, LANE_H).fill(0xffffff)
    this.root.addChild(this.laneMask)
    this.lane.mask = this.laneMask
    app.stage.addChild(this.root)
    app.ticker.add(() => this.layout())
  }

  // ---- showing and hiding ------------------------------------------------

  /** Slides the lane back in from above after a pour. */
  async show(): Promise<void> {
    this.root.visible = true
    await gsap.fromTo(this.shift, { y: -1 }, { y: 0, duration: 0.45, ease: 'power3.out' })
  }

  /** Slides the lane away upwards so the board can come in. */
  async hide(): Promise<void> {
    await gsap.to(this.shift, { y: -1, duration: 0.4, ease: 'power2.in' })
    this.root.visible = false
  }

  /** Starts a fresh run: full health, empty lane. */
  reset(maxHealth: number, health: number): void {
    for (const actor of this.foes.values()) this.removeActor(actor)
    this.foes.clear()
    this.foeData.clear()
    this.junior.maxHealth = maxHealth
    this.setPose(this.junior, 'idle')
    this.junior.body.rotation = 0
    this.junior.body.y = 0
    this.setHeroHealth(health, false)
    this.showGroups(0, 0)
    this.root.visible = true
    this.shift.y = 0
  }

  /** Junior jumps back up after a revive. */
  async revive(maxHealth: number): Promise<void> {
    this.junior.maxHealth = maxHealth
    this.focusLoop?.kill()
    this.setPose(this.junior, 'cheer')
    sound.play('revive')
    this.setHeroHealth(maxHealth, true)
    const at = { x: JUNIOR_X, y: GROUND - 120 }
    burst(this.fx, at.x, at.y, () => star(18, Math.random() < 0.5 ? colour.amber : colour.pink), 12, 170)
    burst(this.fx, at.x, at.y, () => plusSign(24), 8, 120)
    swirl(this.fx, at.x, at.y, 110, colour.amber)
    this.glow(this.junior, 0xfff0b0, 0.5)
    this.floatText(JUNIOR_X + 150, GROUND - 110, 'Back up!', colour.green, 52)
    await gsap.timeline().to(this.junior.body, { y: -50, duration: 0.25, yoyo: true, repeat: 1, ease: 'power2.out' })
    this.setPose(this.junior, 'idle')
  }

  /** Junior's bar after healing between waves or a new max from a card. */
  heal(maxHealth: number, health: number, healed: number): void {
    this.junior.maxHealth = maxHealth
    this.setHeroHealth(health, true)
    if (healed > 0) this.floatText(JUNIOR_X, this.headY(this.junior) - 20, `+${healed}`, colour.green, 40)
  }

  /** A line rising from Junior's head, e.g. "+6 nuts". */
  cheer(text: string): void {
    this.floatText(JUNIOR_X, this.headY(this.junior) - 20, text, colour.orange, 40)
  }

  /** Shows Junior's armour, if any, as a leafy shield with the amount it blocks. */
  setArmour(armour: number): void {
    const gained = armour > this.armour
    this.armour = armour
    this.shield.visible = armour > 0
    this.shieldText.text = String(armour)
    if (gained && armour > 0) {
      gsap.fromTo(this.shield.scale, { x: 0.2, y: 0.2 }, { x: 1, y: 1, duration: 0.6, ease: 'elastic.out(1, 0.45)' })
      const at = this.shieldPoint()
      burst(this.fx, at.x, at.y, () => spark(6, 0x8fd45a), 8, 70)
    }
  }

  private shieldPoint(): { x: number; y: number } {
    return { x: JUNIOR_X + this.shield.x, y: GROUND + this.shield.y }
  }

  // ---- the wave quiz -------------------------------------------------------

  /**
   * Zooms the lane in on Junior and his health bar for the quiz before a
   * wave, with a banner saying what it's for and green pluses (or nuts)
   * drifting up around him.
   */
  async focusJunior(mode: 'heal' | 'nuts' | 'revive', line: string): Promise<void> {
    // Zoom about a point near the lane's left edge, so the shield, Junior,
    // his health bar and its number all stay in view.
    const px = 10
    const py = GROUND - 190
    gsap.killTweensOf([this.lane.scale, this.lane.pivot])
    this.lane.pivot.set(px, py)
    this.lane.position.set(px, py)

    const banner = new Container()
    const titles = { heal: 'Heal Junior!', nuts: 'Bonus nuts!', revive: 'Revive Junior!' }
    const colours = { heal: HEAL_GREEN, nuts: colour.orange, revive: colour.pink }
    const title = this.text(titles[mode], 60, colours[mode])
    title.style.stroke = { color: 0xffffff, width: 10 }
    const sub = this.text(line, 26, colour.content, font.body)
    sub.style.fontWeight = '700'
    sub.style.stroke = { color: 0xffffff, width: 7 }
    sub.style.wordWrap = true
    sub.style.wordWrapWidth = 420
    sub.style.align = 'center'
    sub.anchor.set(0.5, 0)
    sub.y = 34
    banner.addChild(title, sub)
    banner.position.set(W / 2 + 80, 64)
    this.root.addChild(banner)
    this.focusBanner = banner
    gsap.fromTo(banner.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(2.5)' })

    const make =
      mode === 'heal' ? () => plusSign(22) : mode === 'nuts' ? () => this.nutSprite(26) : () => star(12, Math.random() < 0.5 ? colour.amber : colour.pink)
    this.focusLoop = gsap.to(
      {},
      { duration: 0.16, repeat: -1, onRepeat: () => rise(this.backFx, JUNIOR_X, GROUND - 90, make, 95) },
    )
    sound.play(mode === 'revive' ? 'lose' : 'wave-start')
    if (mode === 'revive') gsap.fromTo(banner, { rotation: -0.04 }, { rotation: 0.04, duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut' })
    await gsap.to(this.lane.scale, { x: 1.5, y: 1.5, duration: 0.5, ease: 'power2.out' })
  }

  /** The quiz's healing lands: a burst of pluses, a green ring, the bar fills. */
  async healReward(maxHealth: number, health: number, healed: number, secondWind = false): Promise<void> {
    this.focusLoop?.kill()
    this.junior.maxHealth = maxHealth
    const at = { x: JUNIOR_X, y: GROUND - 120 }
    burst(this.fx, at.x, at.y, () => plusSign(26), 12, 150)
    if (secondWind) {
      // Second wind: a gust of leaves whirls round Junior.
      swirl(this.fx, at.x, at.y, 120, 0x6cc04a)
      burst(this.fx, at.x, at.y, () => leaf(26, Math.random() < 0.5 ? 0x6cc04a : 0x9ad65a), 14, 190)
    }
    const ring = new Graphics().circle(0, 0, 90).stroke({ width: 12, color: HEAL_GREEN })
    ring.position.set(at.x, at.y)
    this.fx.addChild(ring)
    gsap.fromTo(ring.scale, { x: 0.3, y: 0.3 }, { x: 1.5, y: 1.5, duration: 0.6, ease: 'power2.out' })
    gsap.to(ring, { alpha: 0, duration: 0.6, onComplete: () => ring.destroy() })
    this.glow(this.junior, 0xb5ffc2, 0.5)
    sound.play('revive')
    this.setHeroHealth(health, true)
    this.floatText(JUNIOR_X + 150, GROUND - 110, `+${healed} health`, HEAL_GREEN, 48)
    await wait(1)
  }

  /** The quiz's bonus nuts land on Junior, or a gentle "maybe next time". */
  async nutsReward(nuts: number): Promise<void> {
    this.focusLoop?.kill()
    if (nuts > 0) {
      burst(this.fx, JUNIOR_X, GROUND - 120, () => this.nutSprite(40), 10, 150)
      this.floatText(JUNIOR_X + 150, GROUND - 110, `+${nuts} nuts`, colour.orange, 48)
    } else {
      this.floatText(JUNIOR_X + 150, GROUND - 110, 'Next time!', colour.muted, 36)
    }
    await wait(0.9)
  }

  /** Back to the whole lane after the quiz. */
  async unfocus(): Promise<void> {
    this.focusLoop?.kill()
    this.focusLoop = null
    const banner = this.focusBanner
    this.focusBanner = null
    if (banner) {
      gsap.killTweensOf(banner)
      gsap.to(banner, { alpha: 0, duration: 0.25, onComplete: () => banner.destroy({ children: true }) })
    }
    await gsap.to(this.lane.scale, { x: 1, y: 1, duration: 0.4, ease: 'power2.inOut' })
  }

  private nutSprite(size: number): Sprite {
    const nut = new Sprite(this.art.texture('nut'))
    nut.anchor.set(0.5)
    nut.height = size
    nut.width = size * this.art.aspect('nut')
    return nut
  }

  /** A big title across the lane, e.g. at the start of a wave. */
  async announce(title: string, subtitle = ''): Promise<void> {
    const group = new Container()
    group.position.set(W / 2, LANE_H * 0.28)
    const label = this.text(title, 64, colour.orange)
    sound.play('wave-start')
    group.addChild(label)
    if (subtitle) {
      const small = this.text(subtitle, 28, colour.content, font.body)
      small.style.fontWeight = '700'
      small.y = 52
      group.addChild(small)
    }
    this.fx.addChild(group)
    await gsap
      .timeline()
      .fromTo(group.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2.5)' })
      .to(group, { alpha: 0, y: group.y - 30, duration: 0.3, delay: subtitle ? 0.9 : 0.5 })
    group.destroy({ children: true })
  }

  setCup(nuts: number): void {
    this.cupNuts = nuts
    this.cupCount.text = String(nuts)
  }

  // ---- playing a fight ---------------------------------------------------

  /** Plays the fight to its end and says who won. */
  async play(sim: FightSim): Promise<'won' | 'lost'> {
    let event: FightEvent | null
    while ((event = sim.next())) {
      if (event.type === 'enter') await this.enter(event.foes, event.subwave, event.subwaves)
      else if (event.type === 'throw') await this.heroThrow(event)
      else if (event.type === 'foesAttack') await this.foesAttack(event)
      else if (event.type === 'won') await this.won()
      else await this.lost()
    }
    return sim.outcome!
  }

  private async enter(foes: Foe[], group: number, groups: number): Promise<void> {
    this.showGroups(group, groups)
    if (group > 1) void this.announce('More Muddles!', `Group ${group} of ${groups}`)
    const timeline = gsap.timeline()
    // Junior jogs on the spot while the scenery rolls by.
    timeline.to(this.junior.body, { y: -10, duration: 0.11, yoyo: true, repeat: 7, ease: 'sine.inOut' }, 0)
    timeline.to(this.ground.tilePosition, { x: `-=${320}`, duration: 0.9, ease: 'power1.out' }, 0)
    timeline.to(this.mid.tilePosition, { x: `-=${200}`, duration: 0.9, ease: 'power1.out' }, 0)
    timeline.to(this.far.tilePosition, { x: `-=${80}`, duration: 0.9, ease: 'power1.out' }, 0)
    foes.forEach((foe, i) => {
      const size: Size = foe.type === 'boss' ? 'boss' : foe.type.endsWith('large') ? 'large' : 'small'
      const actor = this.makeActor(size, `muddle-${foe.type}`, W + 120 + i * 90)
      actor.maxHealth = foe.maxHealth
      this.setBar(actor, foe.health, false)
      this.foes.set(foe.id, actor)
      this.foeData.set(foe.id, foe)
      this.actors.addChildAt(actor.root, 0)
      timeline.add(this.walk(actor, this.slotX(foe)), 0.05 * i)
    })
    await timeline
  }

  private async heroThrow(event: Extract<FightEvent, { type: 'throw' }>): Promise<void> {
    const timeline = gsap.timeline()
    const volley = event.shots.length
    event.shots.forEach((hits, i) => {
      // Extra nuts fly together as a fan, each on its own arc.
      const at = volley > 1 ? i * 0.07 : 0
      const arcScale = volley > 1 ? 0.55 + (i / (volley - 1)) * 0.9 : 1
      timeline.add(() => {
        this.setPose(this.junior, 'throw-windup')
        sound.play('throw')
      }, at)
      timeline.add(() => this.setPose(this.junior, 'throw'), at + 0.09)
      const [first, ...bounces] = hits
      const from = { x: JUNIOR_X + 60, y: GROUND - 200 }
      const target = this.foes.get(first.foe.id)!
      timeline.add(this.projectile('nut', from, this.hitPoint(target), 0.28, { arcScale }), at + 0.1)
      timeline.add(() => this.impact(first), at + 0.38)
      let previous = target
      bounces.forEach((hit, b) => {
        const next = this.foes.get(hit.foe.id)!
        timeline.add(this.projectile('nut', this.hitPoint(previous), this.hitPoint(next), 0.2, { trail: colour.blue }), at + 0.38 + b * 0.2)
        timeline.add(() => this.impact(hit), at + 0.58 + b * 0.2)
        previous = next
      })
    })
    timeline.add(() => this.setPose(this.junior, 'idle'), '+=0.08')
    if (event.heal > 0) {
      // Lifesteal: green sparks fly from the Muddles hit back into Junior.
      timeline.add(() => {
        const to = { x: JUNIOR_X, y: GROUND - 140 }
        event.shots.flat().slice(0, 5).forEach((hit, i) => {
          const actor = this.foes.get(hit.foe.id)
          const from = actor && !actor.root.destroyed ? this.hitPoint(actor) : { x: FIRST_SLOT, y: GROUND - 110 }
          fly(this.fx, from, to, () => spark(9, HEAL_GREEN), i * 0.06)
        })
      })
      timeline.add(() => {
        this.floatText(JUNIOR_X, this.headY(this.junior) - 20, `+${event.heal}`, colour.green, 36)
        this.glow(this.junior, 0xb5ffc2, 0.25)
        this.setHeroHealth(event.heroHealth, true)
      }, '+=0.45')
    }
    if (event.again) {
      timeline.add(() => {
        swirl(this.fx, JUNIOR_X, GROUND - 130, 100, 0x7b61ff)
        this.floatText(JUNIOR_X, this.headY(this.junior) - 60, 'Again!', 0x7b61ff, 44)
      })
    }
    await timeline
    await this.settle()
  }

  private async foesAttack(event: Extract<FightEvent, { type: 'foesAttack' }>): Promise<void> {
    const timeline = gsap.timeline()
    let health = this.heroHealth
    event.attacks.forEach(({ foe, damage }, i) => {
      const actor = this.foes.get(foe.id)!
      const at = i * 0.16
      const home = this.slotX(foe)
      const blocked = Math.max(0, Math.round(foe.attack) - damage)
      const land = () => {
        health = Math.max(0, health - damage)
        sound.play('foe-attack')
        this.hurtJunior(damage, health)
        if (blocked > 0 && this.armour > 0) this.block(blocked)
      }
      if (foe.def.range === 'melee') {
        timeline.add(() => this.setPose(actor, foe.type === 'boss' ? 'attack' : 'windup'), at)
        timeline.add(() => this.setPose(actor, 'attack'), at + 0.12)
        timeline.to(actor.root, { x: JUNIOR_X + 120, duration: 0.16, ease: 'power2.in' }, at + 0.12)
        timeline.add(land, at + 0.28)
        timeline.to(actor.root, { x: home, duration: 0.24, ease: 'power2.out' }, at + 0.32)
        timeline.add(() => this.setPose(actor, 'idle'), at + 0.56)
      } else {
        timeline.add(() => this.setPose(actor, 'attack'), at)
        timeline.add(this.projectile('muddle-shot', this.hitPoint(actor), { x: JUNIOR_X + 20, y: GROUND - 150 }, 0.3), at + 0.08)
        timeline.add(land, at + 0.38)
        timeline.add(() => this.setPose(actor, 'idle'), at + 0.45)
      }
    })
    await timeline
    this.setHeroHealth(event.heroHealth, true)
    if (event.heroHealth > 0) this.setPose(this.junior, 'idle')
  }

  private async won(): Promise<void> {
    this.setPose(this.junior, 'cheer')
    await gsap.timeline().to(this.junior.body, { y: -40, duration: 0.2, yoyo: true, repeat: 1, ease: 'power2.out' })
    await wait(0.25)
    this.setPose(this.junior, 'idle')
  }

  private async lost(): Promise<void> {
    this.setPose(this.junior, 'down')
    await gsap.timeline().to(this.junior.body, { y: 10, duration: 0.3, ease: 'bounce.out' })
    await wait(0.6)
  }

  // ---- pieces of animation -----------------------------------------------

  private impact(hit: Hit): void {
    const actor = this.foes.get(hit.foe.id)
    if (!actor) return
    const point = this.hitPoint(actor)
    const flash = new Sprite(this.art.texture('fx-hit'))
    flash.anchor.set(0.5)
    flash.position.set(point.x, point.y)
    this.fx.addChild(flash)
    const big = hit.crit ? 220 : 150
    gsap.fromTo(
      flash,
      { width: 40, height: 40, alpha: 1 },
      { width: big, height: big, alpha: 0, duration: hit.crit ? 0.36 : 0.28, onComplete: () => flash.destroy() },
    )
    this.flicker(actor)
    if (hit.crit) {
      this.shake(14)
      burst(this.fx, point.x, point.y, () => star(16, Math.random() < 0.5 ? colour.amber : colour.orange), 8, 130)
    }
    gsap.fromTo(actor.body.scale, { x: 1.14, y: 0.86 }, { x: 1, y: 1, duration: 0.3, ease: 'elastic.out(1, 0.4)' })
    gsap.fromTo(actor.body, { x: 22 }, { x: 0, duration: 0.25, ease: 'power2.out' })
    sound.play(hit.crit ? 'crit' : 'hit', { rate: hit.ricochet ? 1.2 : 1 })
    const size = hit.crit ? 56 : hit.ricochet ? 30 : 38
    this.floatText(point.x, this.headY(actor) - 10, hit.crit ? `Crit ${hit.damage}!` : String(hit.damage), hit.crit ? colour.orange : colour.content, size)
    this.setBar(actor, hit.foe.health, true)
    if (hit.foe.health === 0) void this.beaten(actor, hit)
  }

  private async beaten(actor: Actor, hit: Hit): Promise<void> {
    actor.blink?.kill()
    this.setPose(actor, 'beaten')
    actor.bar.visible = false
    const dizzy = new Sprite(this.art.texture('fx-dizzy'))
    dizzy.anchor.set(0.5)
    dizzy.width = 110
    dizzy.height = 110 / this.art.aspect('fx-dizzy')
    dizzy.position.set(0, -FRAME[actor.size] * BODY_SHARE[actor.size] - 10)
    actor.root.addChild(dizzy)
    gsap.to(dizzy, { rotation: 0.3, yoyo: true, repeat: 3, duration: 0.1 })
    await wait(0.45)
    // The lane may have been cleared for a new run meanwhile.
    if (actor.root.destroyed) return
    const poof = new Sprite(this.art.texture('fx-poof'))
    poof.anchor.set(0.5)
    poof.position.set(actor.root.x, GROUND - FRAME[actor.size] * 0.3)
    sound.play('beaten')
    this.fx.addChild(poof)
    gsap.fromTo(poof, { width: 60, height: 44, alpha: 1 }, { width: 220, height: 160, alpha: 0, duration: 0.4, onComplete: () => poof.destroy() })
    this.dropNuts(hit.nuts, actor.root.x, GROUND - 60)
    await gsap.to(actor.root, { alpha: 0, duration: 0.2 })
    this.foes.delete(hit.foe.id)
    this.foeData.delete(hit.foe.id)
    this.removeActor(actor)
  }

  /** Muddles still standing step forward into the gaps. */
  private async settle(): Promise<void> {
    const moves: Promise<unknown>[] = []
    for (const [id, actor] of this.foes) {
      const foe = this.foeData.get(id)
      if (!foe || !foe.alive) continue
      const target = this.slotX(foe)
      if (Math.abs(actor.root.x - target) > 2) moves.push(this.walk(actor, target, 0.35).then())
    }
    await Promise.all(moves)
  }

  private walk(actor: Actor, toX: number, duration = 0.85): gsap.core.Timeline {
    const timeline = gsap.timeline()
    const steps = Math.max(2, Math.round(duration / 0.13))
    for (let i = 0; i < steps; i++) timeline.add(() => this.setPose(actor, i % 2 ? 'walk-2' : 'walk-1'), i * 0.13)
    timeline.to(actor.root, { x: toX, duration, ease: 'power1.out' }, 0)
    timeline.add(() => this.setPose(actor, 'idle'), duration)
    return timeline
  }

  private hurtJunior(damage: number, health: number): void {
    this.setPose(this.junior, 'hurt')
    this.flicker(this.junior)
    gsap.fromTo(this.junior.body, { x: -18 }, { x: 0, duration: 0.3, ease: 'power2.out' })
    this.floatText(JUNIOR_X + 20, this.headY(this.junior) - 10, `-${damage}`, colour.error, 36)
    this.setHeroHealth(health, true)
  }

  private setHeroHealth(health: number, animate: boolean): void {
    this.heroHealth = health
    this.heroHealthText.text = `${Math.round(health)}/${this.junior.maxHealth}`
    this.setBar(this.junior, health, animate)
    this.setHeartbeat(health > 0 && health / this.junior.maxHealth < 0.25)
  }

  /** Below a quarter health, Junior's bar goes red and beats like a heart. */
  private setHeartbeat(on: boolean): void {
    if (on === (this.heartbeat !== null)) return
    const bar = this.junior.bar
    if (!on) {
      this.heartbeat?.kill()
      this.heartbeat = null
      bar.scale.set(1)
      this.heroHealthText.style.fill = colour.content
      return
    }
    this.heroHealthText.style.fill = colour.error
    this.heartbeat = gsap
      .timeline({ repeat: -1, repeatDelay: 0.5 })
      .to(bar.scale, { x: 1.08, y: 1.5, duration: 0.09, ease: 'power2.out' })
      .to(bar.scale, { x: 1, y: 1, duration: 0.12 })
      .to(bar.scale, { x: 1.06, y: 1.35, duration: 0.09, ease: 'power2.out' })
      .to(bar.scale, { x: 1, y: 1, duration: 0.16 })
  }

  /** King Muddle is beaten: confetti across the lane and a big cheer. */
  async celebrate(): Promise<void> {
    confetti(this.fx, W, LANE_H, 90)
    burst(this.fx, JUNIOR_X, GROUND - 130, () => star(18, Math.random() < 0.5 ? colour.amber : colour.orange), 12, 200)
    this.setPose(this.junior, 'cheer')
    const label = this.text('King Muddle beaten!', 54, colour.orange)
    label.style.stroke = { color: 0xffffff, width: 10 }
    label.position.set(W / 2, LANE_H * 0.3)
    this.fx.addChild(label)
    gsap.fromTo(label.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.5, ease: 'back.out(2.5)' })
    await gsap.timeline().to(this.junior.body, { y: -50, duration: 0.22, yoyo: true, repeat: 3, ease: 'power2.out' })
    await wait(1.2)
    gsap.to(label, { alpha: 0, duration: 0.3, onComplete: () => label.destroy() })
  }

  /** A quick red flash and flicker as a hit lands. */
  private flicker(actor: Actor): void {
    const sprite = actor.sprite
    const timeline = gsap.timeline()
    for (let i = 0; i < 3; i++) {
      timeline.add(() => {
        if (sprite.destroyed) return
        sprite.tint = 0xff4040
        sprite.alpha = 0.65
      }, i * 0.09)
      timeline.add(() => {
        if (sprite.destroyed) return
        sprite.tint = 0xffffff
        sprite.alpha = 1
      }, i * 0.09 + 0.05)
    }
  }

  /** A soft coloured glow over an actor, e.g. green while healing. */
  private glow(actor: Actor, tint: number, seconds: number): void {
    const sprite = actor.sprite
    sprite.tint = tint
    gsap.delayedCall(seconds, () => {
      if (!sprite.destroyed) sprite.tint = 0xffffff
    })
  }

  /** The whole lane jolts sideways, for a big hit. */
  private shake(strength: number): void {
    const rest = this.lane.position.x
    gsap.killTweensOf(this.lane.pivot, 'x')
    gsap.fromTo(this.lane.pivot, { x: rest + strength }, { x: rest, duration: 0.4, ease: 'elastic.out(1.2, 0.2)' })
  }

  /** Armour soaks part of a blow: the shield bumps and says how much. */
  private block(amount: number): void {
    gsap.fromTo(this.shield.scale, { x: 1.35, y: 1.35 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' })
    const at = this.shieldPoint()
    // Set to the right of the shield, so it never runs off the screen's left edge.
    this.floatText(at.x + 62, at.y - 40, `Blocked ${amount}`, 0x2e9e44, 24)
  }

  /** Dots in the lane's corner: one per group of Muddles, filled as they come. */
  private showGroups(current: number, total: number): void {
    this.groups.clear()
    if (total < 2) return
    for (let i = 0; i < total; i++) {
      const x = -(total - 1 - i) * 30
      this.groups.circle(x, 0, 10).fill(i < current ? colour.orange : colour.border)
    }
  }

  private projectile(
    name: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
    duration: number,
    options: { arcScale?: number; trail?: number } = {},
  ): gsap.core.Tween {
    const sprite = new Sprite(this.art.texture(name))
    sprite.anchor.set(0.5)
    sprite.height = name === 'nut' ? 46 : 52
    sprite.width = sprite.height * this.art.aspect(name)
    sprite.visible = false
    this.fx.addChild(sprite)
    const flight = { t: 0 }
    const arc = Math.min(140, Math.abs(to.x - from.x) * 0.35) * (options.arcScale ?? 1)
    let frame = 0
    return gsap.to(flight, {
      t: 1,
      duration,
      ease: 'none',
      onStart: () => {
        sprite.visible = true
      },
      onUpdate: () => {
        sprite.x = from.x + (to.x - from.x) * flight.t
        sprite.y = from.y + (to.y - from.y) * flight.t - Math.sin(Math.PI * flight.t) * arc
        sprite.rotation = flight.t * 10
        // A glowing trail behind, e.g. for a ricochet.
        if (options.trail !== undefined && frame++ % 2 === 0) {
          const dot = spark(7, options.trail)
          dot.position.set(sprite.x, sprite.y)
          this.fx.addChildAt(dot, 0)
          gsap.to(dot, { alpha: 0, duration: 0.35, onComplete: () => dot.destroy() })
          gsap.to(dot.scale, { x: 0.3, y: 0.3, duration: 0.35 })
        }
      },
      onComplete: () => sprite.destroy(),
    })
  }

  private dropNuts(count: number, x: number, y: number): void {
    const cupAt = { x: this.cup.x, y: this.collect.y + this.cup.y - 60 }
    for (let i = 0; i < count; i++) {
      const nut = new Sprite(this.art.texture('nut'))
      nut.anchor.set(0.5)
      nut.height = 40
      nut.width = 40 * this.art.aspect('nut')
      nut.position.set(x, y)
      this.root.addChild(nut)
      const pop = { x: x + (Math.random() - 0.5) * 120, y: y - 60 - Math.random() * 60 }
      gsap
        .timeline({ delay: i * 0.06 })
        .to(nut, { x: pop.x, y: pop.y, rotation: 3, duration: 0.22, ease: 'power2.out' })
        .to(nut, { x: cupAt.x, y: cupAt.y, rotation: 8, duration: 0.45, ease: 'power2.in' })
        .add(() => {
          nut.destroy()
          this.setCup(this.cupNuts + 1)
          sound.play('nut-drop', { rate: 1 + i * 0.03 })
          gsap.fromTo(this.cup.scale, { x: 1.08, y: 1.08 }, { x: 1, y: 1, duration: 0.15 })
        })
    }
  }

  // ---- actors ------------------------------------------------------------

  private makeActor(size: Size, poses: string, x: number): Actor {
    const root = new Container()
    root.position.set(x, GROUND)
    const body = new Container()
    const sprite = new Sprite(this.art.texture(`${poses}-idle`))
    // Every pose is drawn on the same 512 frame with the feet 64 up.
    sprite.anchor.set(0.5, 0.875)
    sprite.width = FRAME[size]
    sprite.height = FRAME[size]
    body.addChild(sprite)
    const bar = new Graphics()
    bar.y = -FRAME[size] * BODY_SHARE[size] - 26
    root.addChild(body, bar)
    const actor: Actor = { root, body, sprite, bar, barFill: { value: 1 }, maxHealth: 1, poses, size, blink: null }
    this.scheduleBlink(actor)
    return actor
  }

  private removeActor(actor: Actor): void {
    actor.blink?.kill()
    gsap.killTweensOf([actor.root, actor.body, actor.body.scale, actor.barFill])
    actor.root.destroy({ children: true })
  }

  private setPose(actor: Actor, pose: string): void {
    const name = `${actor.poses}-${pose}`
    // Ranged Muddles and the boss have no wind-up; their attack pose stands in.
    const fallback = `${actor.poses}-${pose === 'windup' ? 'attack' : 'idle'}`
    actor.sprite.texture = this.art.texture(this.art.has(name) ? name : fallback)
  }

  private scheduleBlink(actor: Actor): void {
    actor.blink = gsap.delayedCall(2 + Math.random() * 3, () => {
      if (actor.sprite.destroyed) return
      const idle = this.art.texture(`${actor.poses}-idle`)
      if (actor.sprite.texture === idle) {
        this.setPose(actor, 'blink')
        gsap.delayedCall(0.13, () => {
          if (!actor.sprite.destroyed && actor.sprite.texture === this.art.texture(`${actor.poses}-blink`)) {
            this.setPose(actor, 'idle')
          }
        })
      }
      this.scheduleBlink(actor)
    })
  }

  private setBar(actor: Actor, health: number, animate: boolean): void {
    const share = actor.maxHealth > 0 ? health / actor.maxHealth : 0
    const draw = () => {
      const isJunior = actor === this.junior
      const width = isJunior ? 120 : 84
      const height = isJunior ? 14 : 10
      actor.bar
        .clear()
        .roundRect(-width / 2, 0, width, height, height / 2)
        .fill(colour.border)
      if (actor.barFill.value > 0) {
        actor.bar
          .roundRect(-width / 2, 0, Math.max(height, width * actor.barFill.value), height, height / 2)
          .fill(isJunior ? (actor.barFill.value < 0.25 ? colour.error : colour.green) : colour.orange)
      }
    }
    gsap.killTweensOf(actor.barFill)
    if (animate) gsap.to(actor.barFill, { value: share, duration: 0.3, onUpdate: draw })
    else {
      actor.barFill.value = share
      draw()
    }
  }

  // ---- layout and helpers -------------------------------------------------

  private slotX(foe: Foe): number {
    return foe.type === 'boss' ? FIRST_SLOT + 150 : FIRST_SLOT + foe.slot * SLOT_GAP
  }

  private headY(actor: Actor): number {
    return GROUND - FRAME[actor.size] * BODY_SHARE[actor.size] - 30
  }

  private hitPoint(actor: Actor): { x: number; y: number } {
    return { x: actor.root.x, y: GROUND - FRAME[actor.size] * BODY_SHARE[actor.size] * 0.5 }
  }

  private text(value: string, size: number, fill: number, family: string = font.heading): Text {
    const label = new Text({ text: value, style: { fontFamily: family, fontSize: size, fill } })
    label.anchor.set(0.5)
    return label
  }

  private floatText(x: number, y: number, value: string, fill: number, size: number): void {
    const label = this.text(value, size, fill)
    label.position.set(x, y)
    this.fx.addChild(label)
    gsap.fromTo(label.scale, { x: 0.5, y: 0.5 }, { x: 1, y: 1, duration: 0.2, ease: 'back.out(3)' })
    gsap.to(label, { y: y - 70, alpha: 0, duration: 0.8, delay: 0.25, ease: 'power1.in', onComplete: () => label.destroy() })
  }

  private layout(): void {
    const screenW = this.app.screen.width
    const screenH = this.app.screen.height
    const scale = Math.min(screenW / W, (screenH * 0.55) / LANE_H)
    this.root.scale.set(scale)
    this.root.x = (screenW - W * scale) / 2
    this.root.y = this.shift.y * screenH
    // The cup panel fills what is left under the lane.
    const height = Math.max(260, screenH / scale - LANE_H - 32)
    if (Math.abs(height - this.collectHeight) > 1) {
      this.collectHeight = height
      this.collectPanel.clear().roundRect(16, 0, W - 32, height, 36).fill(colour.cream).stroke({ width: 2, color: colour.border })
    }
    this.collect.y = LANE_H + 16
    this.cup.position.set(W / 2, height / 2 - 10)
    this.cupLabel.position.set(W / 2, height / 2 + 110)
  }
}
