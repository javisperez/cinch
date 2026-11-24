import * as THREE from 'three'
import { BOLTS, type BoltSize } from './types'
import { offsetProfile, profilePoints, type Profile } from './profile'
import { add, box, brush, cylinder, extrudePoly, extrudeProfile, sub, tweak, type Brush, type ZSource } from './csg'

/**
 * A "ring" is a wall of constant thickness around an outline, open toward +Y.
 * Everything here is built in that canonical frame (centre at the origin);
 * callers rotate / move finished rings into place with `placed()`.
 *
 * The mouth is not a straight slot. It is cut square to the wall at each tip,
 * the tips get a round end cap, and optionally a short tail that leans outward:
 * a funnel that guides the mount in and spreads the bending over the whole ring
 * instead of a sharp corner.
 */

export interface Ring {
  /** the wall, with finished lips. The cavity is NOT cut yet: subtract `cavity` after unions. */
  body: Brush
  cavity: Brush
  /** extra holes to cut after unions (bolt holes, nut traps) */
  extraCuts: Brush[]
  /** lip tip centres, if the ring is open */
  tips: { a: THREE.Vector2; b: THREE.Vector2 } | null
}

export interface RingOptions {
  /** the inner outline (clearance already included) */
  cavity: Profile
  wall: number
  /** mm between the lip tips. 0 or less leaves a closed ring */
  gap: number
  /** length of the outward lip tail in mm (0 = plain rounded lips) */
  flare: number
  z: ZSource
  /** clamp: replace the rounded lips by flat ears that take a bolt */
  ears?: { bolt: BoltSize; width: number }
}

const FLARE_ANGLE = (25 * Math.PI) / 180

interface Tip {
  p: THREE.Vector2
  /** outward normal of the wall at the tip */
  n: THREE.Vector2
}

/** Where the wall's centre line crosses the vertical line x = `x`, on the +Y side. */
function findTip(mid: THREE.Vector2[], x: number): Tip | null {
  let best: Tip | null = null
  for (let i = 0; i < mid.length; i++) {
    const a = mid[i]
    const b = mid[(i + 1) % mid.length]
    if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue
    const s = (x - a.x) / (b.x - a.x)
    const p = new THREE.Vector2(a.x + (b.x - a.x) * s, a.y + (b.y - a.y) * s)
    if (p.y <= 0 || (best && p.y <= best.p.y)) continue
    const d = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize()
    best = { p, n: new THREE.Vector2(d.y, -d.x) } // outline runs CCW, so this points outward
  }
  return best
}

/** A stadium (rectangle with half-circle ends) from a to b, as one polygon, so no edge of it is ever tangent to another piece of itself. */
function capsule(a: THREE.Vector2, b: THREE.Vector2, r: number, segs = 10): THREE.Vector2[] {
  const th = Math.atan2(b.y - a.y, b.x - a.x)
  const pts: THREE.Vector2[] = []
  for (let k = 0; k <= segs; k++) {
    const ang = th + Math.PI / 2 - (Math.PI * k) / segs
    pts.push(new THREE.Vector2(b.x + r * Math.cos(ang), b.y + r * Math.sin(ang)))
  }
  for (let k = 0; k <= segs; k++) {
    const ang = th - Math.PI / 2 - (Math.PI * k) / segs
    pts.push(new THREE.Vector2(a.x + r * Math.cos(ang), a.y + r * Math.sin(ang)))
  }
  return pts
}

/** Round end caps on both lips, with an optional tail leaning outward. */
function finishLips(body: Brush, tips: [THREE.Vector2, THREE.Vector2], wall: number, flare: number, z: ZSource): Brush {
  const r = wall / 2 - 0.1 // keep clear of the cavity and outer surfaces: near-tangent faces make booleans flaky
  let out = body
  tips.forEach((c, i) => {
    if (flare > 0) {
      const side = i === 0 ? 1 : -1
      const dir = new THREE.Vector2(side * Math.sin(FLARE_ANGLE), Math.cos(FLARE_ANGLE))
      const end = c.clone().addScaledVector(dir, flare)
      out = add(out, brush(extrudePoly(capsule(c, end, r), z.next())))
    } else {
      out = add(out, brush(cylinder(r, c.x, c.y, z.next(), 36)))
    }
  })
  return out
}

export function buildRing(o: RingOptions): Ring {
  const t = o.wall
  let body = brush(extrudeProfile(offsetProfile(o.cavity, t), o.z.next()))
  const cavity = brush(extrudeProfile(o.cavity, o.z.next(4)))
  const extraCuts: Brush[] = []
  let tips: Ring['tips'] = null

  if (o.gap > 0) {
    const yc = o.gap / 2 + t / 2
    const mid = profilePoints(offsetProfile(o.cavity, t / 2), 3)
    const xs = mid.map((q) => q.x)
    const xm = (Math.max(...xs) + Math.min(...xs)) / 2 // the shape's lateral centre
    const A = findTip(mid, xm + yc)
    const B = findTip(mid, xm - yc)

    if (A && B) {
      // Remove everything between the two tips, cutting square to the wall at each one.
      const inset = t / 2 + 0.8
      const K = 80
      const wedge = [
        A.p.clone().addScaledVector(A.n, -inset),
        A.p.clone().addScaledVector(A.n, K),
        B.p.clone().addScaledVector(B.n, K),
        B.p.clone().addScaledVector(B.n, -inset),
      ]
      body = sub(body, brush(extrudePoly(wedge, o.z.next())))
      tips = { a: A.p, b: B.p }

      if (o.ears) {
        const bolt = BOLTS[o.ears.bolt]
        const te = bolt.ear
        const y0 = Math.min(A.p.y, B.p.y) - t
        const len = bolt.nutAcrossCorners + 7
        const y1 = Math.max(A.p.y, B.p.y) + len
        const g2 = o.gap / 2
        for (const side of [1, -1]) {
          const quad = [
            new THREE.Vector2(xm + side * g2, y0),
            new THREE.Vector2(xm + side * (g2 + te), y0),
            new THREE.Vector2(xm + side * (g2 + te), y1),
            new THREE.Vector2(xm + side * g2, y1),
          ]
          body = add(body, brush(extrudePoly(quad, o.z.next())))
        }
        const yHole = Math.max(A.p.y, B.p.y) + len / 2
        extraCuts.push(boltCuts(o, bolt, xm, g2, te, yHole))
        extraCuts.push(nutTrap(o, bolt, xm, g2, te, yHole))
      } else {
        body = finishLips(body, [A.p, B.p], t, o.flare, o.z)
      }
    }
  }
  return { body, cavity, extraCuts, tips }
}

// The bolt runs along X through both ears; the nut sits in a hex pocket on the -X ear.
function xAxisCylinder(r: number, x0: number, x1: number, y: number, zMid: number, seg: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, x1 - x0, seg)
  g.rotateZ(Math.PI / 2)
  g.rotateX(tweak.n * 0.37) // spin the polygon phase on retries
  g.translate((x0 + x1) / 2, y + tweak.n * 0.011, zMid)
  return g
}

function boltCuts(o: RingOptions, bolt: (typeof BOLTS)[BoltSize], xm: number, g2: number, te: number, y: number): Brush {
  return brush(xAxisCylinder(bolt.hole / 2, xm - (g2 + te) - 2, xm + g2 + te + 2, y, o.z.mid, 32))
}

function nutTrap(o: RingOptions, bolt: (typeof BOLTS)[BoltSize], xm: number, g2: number, te: number, y: number): Brush {
  const outer = xm - (g2 + te)
  return brush(xAxisCylinder(bolt.nutAcrossCorners / 2, outer - 1, outer + bolt.nutDepth, y, o.z.mid, 6))
}

export interface JawsOptions {
  /** open-ended slot: closed at the bottom, long enough to run past the jaw tips */
  cavity: Profile
  wall: number
  /** y of the very top of the rounded jaw tips */
  tipY: number
  flare: number
  z: ZSource
}

/** Two parallel jaws, closed at the back, for gripping the edge of a panel. */
export function buildJaws(o: JawsOptions): Ring {
  const t = o.wall
  let body = brush(extrudeProfile(offsetProfile(o.cavity, t), o.z.next()))
  const cavity = brush(extrudeProfile(o.cavity, o.z.next(4)))

  const trimY = o.tipY - t / 2
  body = sub(body, brush(box(-300, 300, trimY, 300, o.z.next())))

  const xc = o.cavity.edges[0].d + t / 2
  const a = new THREE.Vector2(xc, trimY)
  const b = new THREE.Vector2(-xc, trimY)
  body = finishLips(body, [a, b], t, o.flare, o.z)
  return { body, cavity, extraCuts: [], tips: { a, b } }
}
