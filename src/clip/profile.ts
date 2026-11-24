import * as THREE from 'three'
import type { ClipParams } from './types'

/**
 * Every supported mount (round, square, rectangle, triangle) is a convex polygon
 * with rounded corners, described by its edges: each edge has an outward normal
 * angle and a distance from the origin. A round pole is just a polygon whose
 * corner radius equals its edge distance.
 *
 * Offsetting such a shape by t is exact and cheap: push every edge out by t and
 * grow the corner radius by t. That's how walls and clearances are built.
 */
export interface Edge {
  /** outward normal angle, radians */
  angle: number
  /** distance from origin to the edge line */
  d: number
}

export interface Profile {
  edges: Edge[] // sorted by angle, CCW
  r: number // corner radius
}

const DEG = Math.PI / 180

export function mountProfile(p: ClipParams): Profile {
  switch (p.shape) {
    case 'round': {
      const d = p.size / 2
      return { edges: ring4(d, d), r: d }
    }
    case 'square': {
      const d = p.size / 2
      return { edges: ring4(d, d), r: Math.min(p.cornerRadius, d) }
    }
    case 'rect': {
      const long = Math.max(p.size, p.size2) / 2
      const short = Math.min(p.size, p.size2) / 2
      // The cable always sits on the +x face, so "long face" means the face
      // that is long runs along y, and the clip is shallow in x.
      const xh = p.rectFace === 'long' ? short : long
      const yh = p.rectFace === 'long' ? long : short
      return { edges: ring4(xh, yh), r: Math.min(p.cornerRadius, short) }
    }
    case 'triangle': {
      // equilateral, flat face toward +x, vertex toward -x
      const a = p.size / (2 * Math.sqrt(3))
      return {
        edges: [0, 120, 240].map((deg) => ({ angle: deg * DEG, d: a })),
        r: Math.min(p.cornerRadius, a),
      }
    }
    case 'panel':
      return slotProfile(p.size / 2, p.size2 / 2, 0, 0)
    case 'flat':
      throw new Error('A flat surface has no outline')
  }
}

export function circleProfile(radius: number): Profile {
  return { edges: ring4(radius, radius), r: radius }
}

/**
 * A rectangular slot, `halfW` either side of the centre in x. It runs from
 * -halfDepth to +halfDepth + topExt in y, so a large topExt makes it open-ended
 * toward +y (used for panel jaws).
 */
export function slotProfile(halfW: number, halfDepth: number, topExt: number, r: number): Profile {
  return {
    edges: [
      { angle: 0, d: halfW },
      { angle: 90 * DEG, d: halfDepth + topExt },
      { angle: 180 * DEG, d: halfW },
      { angle: 270 * DEG, d: halfDepth },
    ],
    r: Math.max(0, Math.min(r, halfW)),
  }
}

function ring4(xh: number, yh: number): Edge[] {
  return [
    { angle: 0, d: xh },
    { angle: 90 * DEG, d: yh },
    { angle: 180 * DEG, d: xh },
    { angle: 270 * DEG, d: yh },
  ]
}

export function offsetProfile(pr: Profile, t: number): Profile {
  const minD = Math.min(...pr.edges.map((e) => e.d)) + t
  return {
    edges: pr.edges.map((e) => ({ angle: e.angle, d: e.d + t })),
    // a radius can't exceed the smallest edge distance, and can't go negative
    r: Math.max(0, Math.min(pr.r + t, minD)),
  }
}

export function profilePoints(pr: Profile, stepDeg = 4): THREE.Vector2[] {
  const { edges, r } = pr
  const out: THREE.Vector2[] = []
  const n = edges.length

  for (let i = 0; i < n; i++) {
    const a = edges[i]
    const b = edges[(i + 1) % n]
    let a1 = b.angle
    if (a1 <= a.angle) a1 += Math.PI * 2

    // corner centre: intersection of both edge lines pulled inward by r
    const det = Math.sin(b.angle - a.angle)
    const da = a.d - r
    const db = b.d - r
    const cx = (da * Math.sin(b.angle) - db * Math.sin(a.angle)) / det
    const cy = (Math.cos(a.angle) * db - Math.cos(b.angle) * da) / det

    const steps = Math.max(1, Math.ceil((a1 - a.angle) / (stepDeg * DEG)))
    for (let s = 0; s <= steps; s++) {
      const t = a.angle + ((a1 - a.angle) * s) / steps
      out.push(new THREE.Vector2(cx + r * Math.cos(t), cy + r * Math.sin(t)))
    }
  }

  // drop (near-)duplicates so zero-radius corners don't create degenerate faces
  const clean: THREE.Vector2[] = []
  for (const p of out) {
    const last = clean[clean.length - 1]
    if (!last || last.distanceToSquared(p) > 1e-8) clean.push(p)
  }
  const first = clean[0]
  const end = clean[clean.length - 1]
  if (clean.length > 1 && first.distanceToSquared(end) <= 1e-8) clean.pop()
  return clean
}

export function profileShape(pr: Profile): THREE.Shape {
  return new THREE.Shape(profilePoints(pr))
}

/** How far the outline reaches along direction (dx, dy). */
export function support(points: THREE.Vector2[], dx: number, dy: number): number {
  let m = -Infinity
  for (const p of points) m = Math.max(m, p.x * dx + p.y * dy)
  return m
}
