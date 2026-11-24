import * as THREE from 'three'
import { profilePoints, type Profile } from './profile'

/**
 * Spreads cable rings evenly around a mount instead of in a row.
 *
 * `path` is the locus of the ring centres: the mount's outer outline pushed out by
 * one cable radius, so a ring placed on it shares exactly one wall with the mount.
 * Rings sit along that path, mouths facing away from the mount, and the stretch
 * around the pole's own mouth is kept clear.
 */

export interface Placement {
  x: number
  y: number
  /** direction the ring's mouth should face (the outward normal), radians */
  normal: number
}

export interface AroundOptions {
  /** lateral centre of the pole's mouth (x) */
  xm: number
  /** half the distance between the pole's lip tips, centre line to centre line; 0 = closed ring */
  tipHalf: number
  /** extra clear space on each side of the mouth, along the path (mm) */
  keepOut: number
  /** smallest centre-to-centre distance two rings may have */
  minSpacing: number
}

interface Path {
  pts: THREE.Vector2[]
  cum: number[]
  length: number
}

function makePath(profile: Profile): Path {
  const pts = profilePoints(profile, 3)
  const cum = [0]
  for (let i = 0; i < pts.length; i++) cum.push(cum[i] + pts[i].distanceTo(pts[(i + 1) % pts.length]))
  return { pts, cum, length: cum[pts.length] }
}

/** Arc length of the highest point where the path crosses the vertical line at x. */
function arcAtX(path: Path, x: number): number {
  let best = 0
  let bestY = -Infinity
  const { pts, cum } = path
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue
    const t = (x - a.x) / (b.x - a.x)
    const y = a.y + (b.y - a.y) * t
    if (y > bestY) {
      bestY = y
      best = cum[i] + t * (cum[i + 1] - cum[i])
    }
  }
  return best
}

function pointAt(path: Path, s: number): Placement {
  const { pts, cum, length } = path
  const u = ((s % length) + length) % length
  let i = 0
  while (i < pts.length - 1 && cum[i + 1] < u) i++
  const a = pts[i]
  const b = pts[(i + 1) % pts.length]
  const seg = cum[i + 1] - cum[i]
  const t = seg > 0 ? (u - cum[i]) / seg : 0
  const dx = b.x - a.x
  const dy = b.y - a.y
  return { x: a.x + dx * t, y: a.y + dy * t, normal: Math.atan2(-dx, dy) } // CCW outline: outward normal is (dy, -dx)
}

/** The point on the path furthest toward +x (the middle of a flat face, if it is flat). */
function arcAtMaxX(path: Path): number {
  const xmax = Math.max(...path.pts.map((p) => p.x))
  const hits: number[] = []
  path.pts.forEach((p, i) => {
    if (p.x > xmax - 1e-6) hits.push(path.cum[i])
  })
  return (Math.min(...hits) + Math.max(...hits)) / 2
}

export function placeAround(profile: Profile, n: number, o: AroundOptions): { places: Placement[]; crowded: boolean } {
  const path = makePath(profile)

  // a single cable sits on the +x side, like the twin-C clips it is modelled on
  if (n === 1) return { places: [pointAt(path, arcAtMaxX(path))], crowded: false }

  const sTop = arcAtX(path, o.xm)
  let keep = o.keepOut
  if (o.tipHalf > 0) {
    // counter-clockwise from the right tip over the top to the left tip
    const sRight = arcAtX(path, o.xm + o.tipHalf)
    const sLeft = arcAtX(path, o.xm - o.tipHalf)
    const top = (((sLeft - sRight) % path.length) + path.length) % path.length
    keep += top / 2
  } else {
    keep = 0
  }

  const available = path.length - 2 * keep
  let spacing = available / n
  let crowded = false
  const positions: number[] = []

  if (spacing >= o.minSpacing) {
    for (let i = 0; i < n; i++) positions.push(sTop + keep + (i + 0.5) * spacing)
  } else {
    // too many for the free stretch: pack them at the minimum spacing, centred opposite the mouth
    spacing = o.minSpacing
    crowded = (n - 1) * spacing > available - 2
    const back = sTop + path.length / 2
    for (let i = 0; i < n; i++) positions.push(back + (i - (n - 1) / 2) * spacing)
  }
  return { places: positions.map((s) => pointAt(path, s)), crowded }
}

/** Shortest distance from (x, y) to a closed polygon outline. */
export function distToOutline(pts: THREE.Vector2[], x: number, y: number): number {
  let best = Infinity
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t)))
  }
  return best
}

/**
 * Cable rings for the strap saddle: a fan on an arc, mouths pointing outward, so
 * the cables splay out around the saddle instead of lining up. The middle of the arc
 * sits at `x0`; the whole fan is pushed outward only as far as needed to keep
 * every ring `clearance` away from the mount, so the strap still has room.
 */
export function placeFan(n: number, o: { x0: number; pitch: number; clearance: number; outline: THREE.Vector2[] }): Placement[] {
  if (n === 1) return [{ x: o.x0, y: 0, normal: 0 }]
  const maxArc = (160 * Math.PI) / 180
  const step = Math.min((50 * Math.PI) / 180, maxArc / (n - 1))
  const R = o.pitch / (2 * Math.sin(step / 2))
  let places: Placement[] = []
  for (let shift = 0; shift < 60; shift += 0.5) {
    places = Array.from({ length: n }, (_, i) => {
      const th = (i - (n - 1) / 2) * step
      return { x: o.x0 + shift - R + R * Math.cos(th), y: R * Math.sin(th), normal: th }
    })
    if (places.every((q) => distToOutline(o.outline, q.x, q.y) >= o.clearance)) break
  }
  return places
}

/** Arc length of the point where a ray from the origin, `deg` degrees clockwise from +Y, crosses the path. */
function arcAtAngle(path: Path, deg: number): number {
  const a = (deg * Math.PI) / 180
  const dx = Math.sin(a)
  const dy = Math.cos(a)
  const { pts, cum } = path
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const ex = q.x - p.x
    const ey = q.y - p.y
    const den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-9) continue
    const t = (p.x * ey - p.y * ex) / den
    const u = (p.x * dy - p.y * dx) / den
    if (t > 0 && u >= 0 && u <= 1) return cum[i] + u * (cum[i + 1] - cum[i])
  }
  return 0
}

/**
 * Cable holders gathered in a cluster centred on a chosen direction, measured
 * clockwise from the mouth (0° = at the mouth, 90° = the right-hand side,
 * 180° = straight across from it). Cables sit shoulder to shoulder.
 */
export function placeCluster(profile: Profile, n: number, deg: number, o: AroundOptions): { places: Placement[]; crowded: boolean } {
  const path = makePath(profile)
  const s0 = arcAtAngle(path, deg)
  const sTop = arcAtX(path, o.xm)
  let keep = o.keepOut
  if (o.tipHalf > 0) {
    const sRight = arcAtX(path, o.xm + o.tipHalf)
    const sLeft = arcAtX(path, o.xm - o.tipHalf)
    keep += ((((sLeft - sRight) % path.length) + path.length) % path.length) / 2
  } else {
    keep = 0
  }
  const positions = Array.from({ length: n }, (_, i) => s0 + (i - (n - 1) / 2) * o.minSpacing)
  const crowded = positions.some((s) => {
    const d = ((((s - sTop) % path.length) + path.length + path.length / 2) % path.length) - path.length / 2
    return Math.abs(d) < keep
  })
  return { places: positions.map((s) => pointAt(path, s)), crowded }
}

// ── slide-in hook: a channel hugging the mount with one closed end and one open, hooked end ──

interface Frame {
  x: number
  y: number
  /** outward normal, unit */
  nx: number
  ny: number
  /** direction the channel runs, unit */
  ux: number
  uy: number
}

/**
 * The outline of a "slide-in hook": a thick band that follows a track (the line the
 * cable centres run along), standing `cavR` clear of it so a cable fits between the
 * band and the mount. One end is closed with a round cap that cups the first cable;
 * the other end is left open and finishes in a rounded lip that narrows the entrance a little.
 * The cable slides in through the open end along the track and rests against the cap.
 *
 * `at(d)` gives the track `d` mm from the closed end: its position, outward normal and
 * running direction.
 */
export function hookPolygon(
  at: (d: number) => Frame,
  n: number,
  o: { pitch: number; cavR: number; wall: number; lip: number; minLength: number; halfLen?: number },
): { poly: THREE.Vector2[]; centres: THREE.Vector2[]; rots: number[]; length: number } {
  const { cavR, wall, lip } = o
  const outR = cavR + wall
  // a flat cord is longer than the round cap that cups its end, so the first cord sits `off` further along, its rounded end snug in the cap
  const off = Math.max(0, (o.halfLen ?? cavR) - cavR)
  const last = (n - 1) * o.pitch + off
  // The tip carries a barb that narrows the entrance by `lip`. Its back face (toward the cable) is steep,
  // so a cable pushed against it is held; its front is the rounded tip, so a cable pushed in squeezes past.
  // The band is kept long enough to flex (18 mm).
  const ramp = Math.max(0.8, 0.9 * lip)
  const nose = 1.6
  // (a flat cord is longer along the track than it is thick, so the last one needs `halfLen` of room, not just its half-thickness)
  const end = Math.max(last + 0.9 * Math.max(cavR, o.halfLen ?? 0) + ramp + nose, o.minLength)
  const ds = 0.4
  const steps = Math.max(2, Math.ceil(end / ds))
  const V = (x: number, y: number) => new THREE.Vector2(x, y)
  const inner = (d: number) => {
    const t = Math.min(1, Math.max(0, (d - (end - nose - ramp)) / ramp))
    return cavR - lip * t
  }

  const pts: THREE.Vector2[] = []
  // outer edge, from the closed end to the tip
  for (let i = 0; i <= steps; i++) {
    const f = at((end * i) / steps)
    pts.push(V(f.x + f.nx * outR, f.y + f.ny * outR))
  }
  // rounded tip
  const e = at(end)
  const tipIn = inner(end)
  const mid = (outR + tipIn) / 2
  const rt = (outR - tipIn) / 2
  for (let k = 1; k < 10; k++) {
    const a = (k / 10) * Math.PI
    pts.push(V(e.x + e.nx * mid + rt * (Math.cos(a) * e.nx + Math.sin(a) * e.ux), e.y + e.ny * mid + rt * (Math.cos(a) * e.ny + Math.sin(a) * e.uy)))
  }
  // inner edge, back from the tip to the closed end
  for (let i = steps; i >= 0; i--) {
    const d = (end * i) / steps
    const f = at(d)
    pts.push(V(f.x + f.nx * inner(d), f.y + f.ny * inner(d)))
  }
  // the closed end: a round cap that cups the first cable, then down into the mount's wall and round the outside
  const c = at(0)
  for (let k = 1; k <= 12; k++) {
    const a = (k / 12) * Math.PI
    pts.push(V(c.x + cavR * (Math.cos(a) * c.nx - Math.sin(a) * c.ux), c.y + cavR * (Math.cos(a) * c.ny - Math.sin(a) * c.uy)))
  }
  for (let k = 1; k < 18; k++) {
    const a = Math.PI - (k / 18) * Math.PI
    pts.push(V(c.x + outR * (Math.cos(a) * c.nx - Math.sin(a) * c.ux), c.y + outR * (Math.cos(a) * c.ny - Math.sin(a) * c.uy)))
  }

  const frames = Array.from({ length: n }, (_, i) => at(i * o.pitch + off))
  const centres = frames.map((f) => V(f.x, f.y))
  const rots = frames.map((f) => Math.atan2(f.uy, f.ux)) // the cable's long axis runs along the track
  return { poly: pts, centres, rots, length: end }
}

/** A slide-in hook following the mount's outline, centred `deg` degrees clockwise from the mouth. */
export function hookOnPath(
  profile: Profile,
  n: number,
  deg: number,
  o: AroundOptions & { cavR: number; wall: number; lip: number; minLength: number; halfLen?: number },
): { poly: THREE.Vector2[]; centres: THREE.Vector2[]; rots: number[]; crowded: boolean; length: number } {
  const path = makePath(profile)
  const pitch = o.minSpacing
  // the closed end is the one nearer the mouth, so the open end faces away from it
  const k = deg < 180 ? -1 : 1
  const sC = arcAtAngle(path, deg)
  const s0 = sC - (k * (n - 1) * pitch) / 2
  const at = (d: number): Frame => {
    const p = pointAt(path, s0 + k * d)
    const nx = Math.cos(p.normal)
    const ny = Math.sin(p.normal)
    return { x: p.x, y: p.y, nx, ny, ux: -k * ny, uy: k * nx }
  }
  const h = hookPolygon(at, n, { pitch, cavR: o.cavR, wall: o.wall, lip: o.lip, minLength: o.minLength, halfLen: o.halfLen })

  const sTop = arcAtX(path, o.xm)
  let keep = o.keepOut
  if (o.tipHalf > 0) {
    const sRight = arcAtX(path, o.xm + o.tipHalf)
    const sLeft = arcAtX(path, o.xm - o.tipHalf)
    keep += ((((sLeft - sRight) % path.length) + path.length) % path.length) / 2
  } else keep = 0
  const wrap = (s: number) => ((((s - sTop) % path.length) + path.length + path.length / 2) % path.length) - path.length / 2
  const crowded = [s0, s0 + k * h.length].some((s) => Math.abs(wrap(s)) < keep) || Math.abs(wrap(s0 + (k * h.length) / 2)) < keep
  return { poly: h.poly, centres: h.centres, rots: h.rots, crowded, length: h.length }
}

/** How far a slide-in hook's tip narrows the entrance, from the Cable slot opening (smaller opening = bigger barb). */
export function hookLip(cavR: number, opening: number): number {
  // (twice the original barb: the entrance narrows to about 40% of the cable at the default opening)
  return Math.min(1.2 * cavR, Math.max(0.3 * cavR, 2 * (1 - Math.min(Math.max(opening, 0), 95) / 100) * 2 * cavR))
}

/** Rough peak strain (%) when the tip is pushed aside by `lip` mm: a cantilever of the band's length. */
export function hookStrain(wall: number, lip: number, length: number): number {
  return (100 * 1.5 * wall * lip) / (length * length)
}
