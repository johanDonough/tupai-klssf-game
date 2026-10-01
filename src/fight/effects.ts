import { Container, Graphics } from 'pixi.js'
import gsap from 'gsap'

// Little shapes drawn on the spot for fight effects: healing pluses, crit
// stars, lifesteal sparks and Junior's leafy armour shield. No art files.

export const HEAL_GREEN = 0x2fbf4a
const LEAF_LIGHT = 0x8fd45a
const LEAF_DARK = 0x2e9e44
const LEAF_EDGE = 0x1b6b2c

/** A chunky plus sign with a white rim, for healing. */
export function plusSign(size: number, fill: number = HEAL_GREEN): Graphics {
  const g = new Graphics()
  const cross = (s: number, colour: number) => {
    const t = s * 0.38
    g.roundRect(-s / 2, -t / 2, s, t, t / 3).roundRect(-t / 2, -s / 2, t, s, t / 3).fill(colour)
  }
  cross(size + 8, 0xffffff)
  cross(size, fill)
  return g
}

/** A five-point star with a white rim, for crits. */
export function star(radius: number, fill: number): Graphics {
  return new Graphics().star(0, 0, 5, radius, radius * 0.45).fill(fill).stroke({ width: 3, color: 0xffffff })
}

/** A round spark, for lifesteal. */
export function spark(radius: number, fill: number): Graphics {
  return new Graphics().circle(0, 0, radius + 3).fill({ color: 0xffffff, alpha: 0.7 }).circle(0, 0, radius).fill(fill)
}

/** Shapes flying out from a point, spinning and fading. */
export function burst(layer: Container, x: number, y: number, make: () => Container, count: number, reach = 110): void {
  for (let i = 0; i < count; i++) {
    const piece = make()
    piece.position.set(x, y)
    layer.addChild(piece)
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6
    const distance = reach * (0.6 + Math.random() * 0.5)
    gsap.fromTo(piece.scale, { x: 0.3, y: 0.3 }, { x: 1, y: 1, duration: 0.2, ease: 'back.out(3)' })
    gsap.to(piece, {
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      rotation: (Math.random() - 0.5) * 4,
      alpha: 0,
      duration: 0.55 + Math.random() * 0.2,
      ease: 'power2.out',
      onComplete: () => piece.destroy(),
    })
  }
}

/** One shape drifting up from somewhere around a point, then fading. */
export function rise(layer: Container, x: number, y: number, make: () => Container, spreadX = 70): void {
  const piece = make()
  piece.position.set(x + (Math.random() - 0.5) * spreadX * 2, y + Math.random() * 30)
  piece.scale.set(0.4 + Math.random() * 0.5)
  piece.alpha = 0
  layer.addChild(piece)
  gsap
    .timeline({ onComplete: () => piece.destroy() })
    .to(piece, { alpha: 1, duration: 0.15 })
    .to(piece, { y: piece.y - 90 - Math.random() * 50, duration: 1, ease: 'power1.out' }, 0)
    .to(piece, { alpha: 0, duration: 0.35 }, 0.65)
}

/** A shape flying from one point to another, then gone. */
export function fly(
  layer: Container,
  from: { x: number; y: number },
  to: { x: number; y: number },
  make: () => Container,
  delay = 0,
): gsap.core.Timeline {
  const piece = make()
  piece.position.set(from.x, from.y)
  piece.alpha = 0
  layer.addChild(piece)
  const lift = Math.min(from.y, to.y) - 60 - Math.random() * 40
  return gsap
    .timeline({ delay, onComplete: () => piece.destroy() })
    .set(piece, { alpha: 1 })
    .to(piece, { x: to.x, duration: 0.45, ease: 'power1.inOut' }, 0)
    .to(piece, { y: lift, duration: 0.22, ease: 'power2.out' }, 0)
    .to(piece, { y: to.y, duration: 0.23, ease: 'power2.in' }, 0.22)
}

/** A single leaf, for the Second wind card. */
export function leaf(size: number, fill: number = 0x6cc04a): Graphics {
  const h = size / 2
  return new Graphics()
    .moveTo(0, -h)
    .quadraticCurveTo(h * 0.9, 0, 0, h)
    .quadraticCurveTo(-h * 0.9, 0, 0, -h)
    .fill(fill)
    .stroke({ width: 2, color: 0x2e7d32 })
    .moveTo(0, -h * 0.8)
    .lineTo(0, h * 0.8)
    .stroke({ width: 1.5, color: 0x2e7d32, alpha: 0.7 })
}

/** Curved speed lines that spin once around a point and fade, e.g. for "Again!". */
export function swirl(layer: Container, x: number, y: number, radius: number, colour: number): void {
  const ring = new Graphics()
  for (let i = 0; i < 3; i++) {
    const start = (i / 3) * Math.PI * 2
    ring.arc(0, 0, radius, start, start + 1.3).stroke({ width: 7, color: colour, cap: 'round' })
    ring.arc(0, 0, radius - 16, start + 0.4, start + 1.4).stroke({ width: 4, color: colour, alpha: 0.6, cap: 'round' })
  }
  ring.position.set(x, y)
  layer.addChild(ring)
  gsap.fromTo(ring.scale, { x: 0.6, y: 0.6 }, { x: 1.15, y: 1.15, duration: 0.6, ease: 'power2.out' })
  gsap.fromTo(ring, { rotation: 0, alpha: 1 }, { rotation: Math.PI * 2, alpha: 0, duration: 0.6, ease: 'power1.in', onComplete: () => ring.destroy() })
}

const CONFETTI = [0xff6300, 0xffb911, 0xe410af, 0x44bfd2, 0x4f5bfd, 0x1da130]

/** Paper confetti falling across an area, for a big win. */
export function confetti(layer: Container, width: number, height: number, count = 70): void {
  for (let i = 0; i < count; i++) {
    const w = 8 + Math.random() * 8
    const piece = new Graphics().rect(-w / 2, -w * 0.3, w, w * 0.6).fill(CONFETTI[i % CONFETTI.length])
    piece.position.set(Math.random() * width, -20 - Math.random() * height * 0.4)
    piece.rotation = Math.random() * Math.PI
    layer.addChild(piece)
    const fall = 1.4 + Math.random() * 1.2
    gsap.to(piece, {
      y: height + 40,
      x: piece.x + (Math.random() - 0.5) * 160,
      rotation: piece.rotation + (Math.random() - 0.5) * 12,
      duration: fall,
      delay: Math.random() * 0.5,
      ease: 'power1.in',
      onComplete: () => piece.destroy(),
    })
    gsap.to(piece.scale, { x: -1, duration: 0.2 + Math.random() * 0.2, yoyo: true, repeat: Math.ceil(fall / 0.3) })
  }
}

/** Junior's armour: a green shield with two leaves sprouting from the top. */
export function drawLeafShield(g: Graphics): Graphics {
  g.clear()
  for (const side of [-1, 1]) {
    g.moveTo(side * 3, -17)
      .quadraticCurveTo(side * 22, -36, side * 31, -16)
      .quadraticCurveTo(side * 16, -10, side * 3, -17)
      .fill(LEAF_LIGHT)
      .stroke({ width: 2, color: LEAF_EDGE })
    g.moveTo(side * 6, -18).lineTo(side * 24, -21).stroke({ width: 2, color: LEAF_EDGE, alpha: 0.6 })
  }
  g.moveTo(0, -21)
    .quadraticCurveTo(13, -15, 21, -16)
    .lineTo(21, 3)
    .quadraticCurveTo(19, 19, 0, 28)
    .quadraticCurveTo(-19, 19, -21, 3)
    .lineTo(-21, -16)
    .quadraticCurveTo(-13, -15, 0, -21)
    .closePath()
    .fill(LEAF_DARK)
    .stroke({ width: 3, color: LEAF_EDGE })
  return g
}
