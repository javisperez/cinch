import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { add, box, brush, clampZ, cylinder, extrudeProfile, inter, sub, tweak, ZSource, type Brush } from './csg'
import { buildJaws, buildRing, type Ring } from './rings'
import { mountProfile, offsetProfile, profilePoints, slotProfile, support, type Profile } from './profile'
import { withRetries, type ClipResult } from './result'
import { fmt, type ClipParams } from './types'

/**
 * A row of short rings in the user's actual mount shape, each with a different
 * Mount fit. Print it first, try each ring on the real mount, and copy the value
 * of the one that grips the way you want. Rings are told apart by 1–5 dots.
 */

const HEIGHT = 6
const STEPS = [-0.2, -0.1, 0, 0.1, 0.2]
const GAP = 5
/** rings wrap onto a new row beyond this width, so the strip fits ordinary print beds */
const ROW_MAX = 170

export function canFitTest(p: ClipParams): boolean {
  return p.shape !== 'flat'
}

export function buildFitTest(p: ClipParams): ClipResult {
  return withRetries(() => buildOnce(p))
}

function buildOnce(p: ClipParams): ClipResult {
  const wall = p.wall
  const panel = p.shape === 'panel'
  const z = new ZSource(0, HEIGHT)
  const clearances = STEPS.map((s) => Math.round((p.mountClearance + s) * 100) / 100)

  const pieces: THREE.BufferGeometry[] = []
  const ghosts: THREE.BufferGeometry[] = []
  const labels: string[] = []
  let cursor = 0
  let rowY = 0
  let rowDepth = 0
  let widest = 0

  clearances.forEach((c, i) => {
    let ring: Ring
    let mid: Profile
    let ghost: THREE.BufferGeometry

    if (panel) {
      const slotW = Math.max(0.6, p.size + 2 * c)
      const halfDepth = p.size2 / 2
      const slot = slotProfile(slotW / 2, halfDepth, wall + 12, Math.min(p.cornerRadius, slotW / 2))
      ring = buildJaws({ cavity: slot, wall, tipY: halfDepth, flare: p.lipFlare, z })
      mid = offsetProfile(slot, wall / 2)
      ghost = extrudeProfile(slotProfile(p.size / 2, halfDepth, 3, 0), [-4, HEIGHT + 4])
    } else {
      const outline = mountProfile(p)
      const cavity = offsetProfile(outline, c)
      const pts = profilePoints(cavity)
      const across = support(pts, 1, 0) + support(pts, -1, 0)
      const gap = (Math.min(Math.max(p.mountOpening, 0), 95) / 100) * across
      ring = buildRing({ cavity, wall, gap, flare: p.lipFlare, z })
      mid = offsetProfile(cavity, wall / 2)
      ghost = extrudeProfile(outline, [-4, HEIGHT + 4])
    }

    let body: Brush = inter(ring.body, brush(box(-500, 500, -500, 500, [0, HEIGHT])))
    body = sub(body, ring.cavity)
    clampZ(body.geometry, 0, HEIGHT)

    // 1–5 little dots along the back wall say which ring this is
    const backWall = profilePoints(mid, 3)
    const r = Math.min(0.7, wall / 2 - 0.25)
    for (let k = 0; k <= i; k++) {
      const x = (k - i / 2) * 2.3 + tweak.n * 0.013
      const y = lowestCrossing(backWall, x)
      if (y !== null) body = add(body, brush(cylinder(r, x, y, [HEIGHT - 0.5, HEIGHT + 0.7], 20)))
    }

    const g = body.geometry
    g.computeBoundingBox()
    const bb = g.boundingBox!
    const w = bb.max.x - bb.min.x
    if (cursor > 0 && cursor + w > ROW_MAX) {
      rowY -= rowDepth + GAP
      cursor = 0
      rowDepth = 0
    }
    const shiftX = cursor - bb.min.x
    // rows hang below the first one, so the back wall of every ring stays at the same place in its row
    const shiftY = rowY
    g.translate(shiftX, shiftY, 0)
    ghost.translate(shiftX, shiftY, 0)
    cursor += w + GAP
    widest = Math.max(widest, cursor - GAP)
    rowDepth = Math.max(rowDepth, bb.max.y - bb.min.y)
    pieces.push(g)
    ghosts.push(ghost)
    labels.push(`${i + 1} dot${i ? 's' : ''}: ${fmt(c)}`)
  })

  const geometry = mergeAll(pieces, -widest / 2)
  const ghostMount = mergeAll(ghosts, -widest / 2)

  geometry.computeBoundingBox()
  const s = geometry.boundingBox!.getSize(new THREE.Vector3())
  return {
    geometry,
    ghostMount,
    ghostCables: [],
    size: { x: s.x, y: s.y, z: s.z },
    warnings: [],
    notes: [
      'Fit-test strip: print this first. Try each ring on your real mount and pick the one that grips the way you want.',
      `Then set Mount fit to that ring's value (mm): ${labels.join(' · ')}.`,
    ],
  }
}

/** y of the lowest point where the outline crosses the vertical line at x. */
function lowestCrossing(outline: THREE.Vector2[], x: number): number | null {
  let best: number | null = null
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue
    const y = a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x)
    if (best === null || y < best) best = y
  }
  return best
}

function mergeAll(list: THREE.BufferGeometry[], shiftX: number): THREE.BufferGeometry {
  const prepared = list.map((g) => {
    const out = g.index ? g.toNonIndexed() : g.clone()
    for (const name of Object.keys(out.attributes)) if (name !== 'position' && name !== 'normal') out.deleteAttribute(name)
    out.translate(shiftX, 0, 0)
    return out
  })
  return mergeGeometries(prepared, false)
}
