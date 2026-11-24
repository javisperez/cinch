import * as THREE from 'three'
import { add, addAll, box, brush, clampZ, extrudePoly, extrudeProfile, inter, placed, subAll, ZSource, type Brush, type ZRange } from './csg'
import { cableRoom, cavityProfile, ghostCable } from './cable'
import { hookLip, hookOnPath, hookStrain, placeAround, placeCluster, placeFan, type Placement } from './around'
import { buildBridge } from './bridge'
import { loopHolder } from './loop'
import { buildChannel, buildSlide } from './channel'
import { buildJaws, buildRing } from './rings'
import { mountProfile, offsetProfile, profilePoints, slotProfile, support, type Profile } from './profile'
import { withRetries, type ClipResult } from './result'
import { BOLTS, type ClipParams } from './types'

/**
 * Coordinate system (matches what a slicer shows):
 *   Z   the mount's axis: the clip stands on the bed with its rings flat in XY
 *   +X  the side the cables sit on
 *   +Y  the way the mouths open
 * Z = 0 is the bed. A flat base is turned onto its back at the end so the plate lies on the bed.
 */

export type { ClipResult }

export function buildClip(p: ClipParams): ClipResult {
  return withRetries(() => buildOnce(p))
}

function buildOnce(p: ClipParams): ClipResult {
  if (p.shape === 'flat') return p.mechanism === 'bridge' ? buildBridge(p) : p.mechanism === 'channel' ? buildChannel(p) : p.mechanism === 'slide' ? buildSlide(p) : buildBase(p)
  if (p.shape !== 'panel' && p.mechanism === 'strap') return buildSaddle(p)
  return buildWrap(p)
}

// ── shared pieces ────────────────────────────────────────────────────────────

function cableSpec(p: ClipParams) {
  const n = Math.min(6, Math.max(1, Math.round(p.cableCount)))
  const room = cableRoom(p)
  // a flat cord lies on its wide side: `cavT` is half its width (along the surface), `cavR` half its thickness (away from it)
  const cavR = room.t / 2
  const cavT = room.w / 2
  return {
    n,
    flat: room.flat,
    room,
    cavR,
    cavT,
    /** half the ring's width along the surface, wall included */
    outR: cavT + p.wall,
    /** half the ring's height away from the surface, wall included */
    outRad: cavR + p.wall,
    /** neighbouring rings share one wall (+0.05 so one ring's outer face never sits exactly on its neighbour's cavity) */
    pitch: 2 * cavT + p.wall + 0.05,
    gap: (Math.min(Math.max(p.cableOpening, 0), 95) / 100) * 2 * cavT,
  }
}

function finish(
  geometry: THREE.BufferGeometry,
  ghostMount: THREE.BufferGeometry,
  ghostCables: THREE.BufferGeometry[],
  warnings: string[],
  notes: string[],
): ClipResult {
  geometry.deleteAttribute('uv')
  geometry.computeBoundingBox()
  const s = geometry.boundingBox!.getSize(new THREE.Vector3())
  return { geometry, ghostMount, ghostCables, size: { x: s.x, y: s.y, z: s.z }, warnings, notes }
}

function widthOf(points: THREE.Vector2[]): number {
  return support(points, 1, 0) + support(points, -1, 0)
}

/**
 * Rough peak strain (%) while the mount is pushed through the mouth. Each arm is
 * treated as a curved cantilever with a 2x allowance for the stress peaking near
 * its root. It is an estimate for sanity-checking, not a simulation.
 */
function snapStrain(cavity: Profile, wall: number, gap: number, mountWidth: number): number {
  const mid = profilePoints(offsetProfile(cavity, wall / 2), 3)
  const xs = mid.map((q) => q.x)
  const xm = (Math.max(...xs) + Math.min(...xs)) / 2
  const yc = gap / 2 + wall / 2
  let body = 0
  for (let i = 0; i < mid.length; i++) {
    const a = mid[i]
    const b = mid[(i + 1) % mid.length]
    const top = (a.y + b.y) / 2 > 0 && Math.abs((a.x + b.x) / 2 - xm) < yc
    if (!top) body += a.distanceTo(b)
  }
  const arm = body / 2
  const deflection = Math.max(0, mountWidth - gap) / 2
  return arm > 0 ? (100 * 2 * wall * deflection) / (arm * arm) : 0
}

/**
 * Smooths where a pocket meets the clip: the convex hull of the pocket's outer circle
 * and the nearby stretch of the clip's outline. Its edges are the common tangent
 * lines, so the bulge flows into the wall instead of meeting it at a corner.
 */
function blend(outline: THREE.Vector2[], pl: Placement, outT: number, outRad: number, z: ZRange): Brush {
  const pts: THREE.Vector2[] = []
  const nx = Math.cos(pl.normal)
  const ny = Math.sin(pl.normal)
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2
    // an ellipse: outRad away from the mount, outT along it (the same for a round cable)
    const u = outRad * Math.cos(a)
    const w = outT * Math.sin(a)
    pts.push(new THREE.Vector2(pl.x + u * nx - w * ny, pl.y + u * ny + w * nx))
  }
  for (const q of outline) if (Math.hypot(q.x - pl.x, q.y - pl.y) < Math.max(outT, outRad) * 2.4) pts.push(q)
  return brush(extrudePoly(convexHull(pts), z))
}

function convexHull(points: THREE.Vector2[]): THREE.Vector2[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const build = (list: THREE.Vector2[]) => {
    const out: THREE.Vector2[] = []
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop()
      out.push(q)
    }
    out.pop()
    return out
  }
  return [...build(p), ...build([...p].reverse())]
}

// ── snap-on / bolt clamp / panel jaws: rings side by side in a row ───────────

function buildWrap(p: ClipParams): ClipResult {
  const warnings: string[] = []
  const notes: string[] = []
  const W = p.width
  const wall = p.wall
  const z = new ZSource(0, W)
  // a pocket needs no snug fit: the mount itself keeps the cable in, so give it plenty of room
  const cab = cableSpec(p.holder === 'pocket' && p.shape !== 'panel' ? { ...p, cableClearance: Math.max(p.cableClearance, 0.5) } : p)
  const panel = p.shape === 'panel'
  const clamp = p.mechanism === 'clamp' && !panel
  const ghostZ: ZRange = [-7, W + 7]

  let pole
  let baseX: number
  let ghostMount: THREE.BufferGeometry
  let strain = 0
  /** pole mounts: where the cable rings may go around the outside */
  let around: { path: Profile; outline: THREE.Vector2[]; xm: number; tipHalf: number; keepOut: number } | null = null

  if (panel) {
    const slotW = Math.max(0.6, p.size + 2 * p.mountClearance)
    const halfDepth = p.size2 / 2
    const slot = slotProfile(slotW / 2, halfDepth, wall + 12, Math.min(p.cornerRadius, slotW / 2))
    pole = buildJaws({ cavity: slot, wall, tipY: halfDepth, flare: p.lipFlare, z })
    baseX = slotW / 2 + wall
    ghostMount = extrudeProfile(slotProfile(p.size / 2, halfDepth, 12, 0), ghostZ)

    // each jaw is a straight cantilever, pushed apart by the panel
    const squeeze = Math.max(0, -p.mountClearance)
    strain = (100 * 1.5 * wall * squeeze) / (p.size2 * p.size2)
    if (p.mountClearance > 0.1) warnings.push('A positive Mount fit leaves the jaws loose. Use a small negative value so they pinch the panel.')
  } else {
    const mount = mountProfile(p)
    const cavity = offsetProfile(mount, p.mountClearance)
    const cavityPts = profilePoints(cavity)
    const across = widthOf(cavityPts)
    const mountWidth = widthOf(profilePoints(mount))
    const gap = clamp ? p.clampGap : (Math.min(Math.max(p.mountOpening, 0), 95) / 100) * across

    pole = buildRing({
      cavity,
      wall,
      gap,
      flare: p.lipFlare,
      z,
      ears: clamp ? { bolt: p.bolt, width: W } : undefined,
    })
    baseX = support(profilePoints(offsetProfile(cavity, wall)), 1, 0)
    ghostMount = extrudeProfile(mount, ghostZ)

    const tips = pole.tips
    const earThickness = clamp ? BOLTS[p.bolt].ear : p.lipFlare * Math.sin((25 * Math.PI) / 180)
    around = {
      // free-standing rings sit just outside the clip's wall; a pocket sinks into it, its cavity overlapping the mount's bore a little
      outline: profilePoints(offsetProfile(cavity, wall), 3),
      path: p.holder === 'pocket' ? offsetProfile(cavity, cab.cavR - 0.15) : offsetProfile(offsetProfile(cavity, wall), cab.cavR + 0.05),
      xm: tips ? (tips.a.x + tips.b.x) / 2 : 0,
      tipHalf: tips ? (tips.a.x - tips.b.x) / 2 : 0,
      keepOut: cab.outR + 1 + earThickness,
    }

    if (gap > 0 && !pole.tips) warnings.push('The mouth could not be placed on this shape. Try a smaller opening.')
    if (!clamp && gap <= 0) notes.push('Closed ring: it has to slide on from the end of the mount.')
    if (!clamp && gap > 0) strain = snapStrain(cavity, wall, gap, mountWidth)

    if (clamp) {
      const b = BOLTS[p.bolt]
      const need = b.nutAcrossCorners + 3
      if (W < need) warnings.push(`The nut pocket needs a clip at least ${need.toFixed(0)} mm tall. Raise Clip height.`)
      const len = Math.ceil((2 * b.ear + p.clampGap + 1) / 2) * 2
      notes.push(`Needs one ${p.bolt} bolt (${len}–${len + 4} mm long) and a ${p.bolt} nut. Tighten until the ears nearly touch.`)
    }
  }

  if (strain >= 3) {
    warnings.push(
      `Snapping on stretches the plastic by roughly ${strain.toFixed(1)}%, enough to crack it or leave it bent. Open the mouth wider, thin the wall, or print in PETG.`,
    )
  } else if (strain >= 1.8) {
    notes.push(`Snap stress is moderate (about ${strain.toFixed(1)}%). Fine in PETG; PLA can crack after repeated use.`)
  }
  if (wall < 1.2) warnings.push('Walls under 1.2 mm are only a couple of perimeters thick and break easily.')

  // ── cable holders ──
  const cableBodies: Brush[] = []
  const cableCavities: Brush[] = []
  const centres: { x: number; y: number; rot?: number }[] = []

  // where on the clip the cables go: degrees clockwise from the mouth (0° = at the mouth, 90° = the right-hand side)
  const angle = ((p.holderAngle % 360) + 360) % 360
  const dir = new THREE.Vector2(Math.sin((angle * Math.PI) / 180), Math.cos((angle * Math.PI) / 180))
  const dirAngle = Math.atan2(dir.y, dir.x)
  const rotate = (rot: number, u: number, v: number) => ({ x: Math.cos(rot) * u - Math.sin(rot) * v, y: Math.sin(rot) * u + Math.cos(rot) * v })

  if (around && p.holder === 'latch') {
    // a tall thin loop with a curled hook at the bottom: slide the cable in under the hook
    const spec = { dcW: cab.room.w, dcT: cab.room.t, n: cab.n, wall, opening: p.cableOpening }
    const rot = dirAngle - Math.PI / 2 // local +Y points away from the mount along the chosen direction
    const lat = { x: dir.y, y: -dir.x } // local +X in the world
    const seat = support(around.outline, dir.x, dir.y) - 0.35
    // the hook goes on the lower side, away from the mouth
    const flip = lat.y > 0.01
    const half = loopHolder(spec, 0, flip).halfWidth + 0.5
    // how far the base has to reach down to meet a curved wall at the box's far corners (the mount's bore trims the excess)
    let low = seat
    for (let i = 0; i < around.outline.length; i++) {
      const a = around.outline[i]
      const b = around.outline[(i + 1) % around.outline.length]
      const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 0.25))
      for (let k = 0; k <= steps; k++) {
        const x = a.x + ((b.x - a.x) * k) / steps
        const y = a.y + ((b.y - a.y) * k) / steps
        if (Math.abs(x * lat.x + y * lat.y) <= half && x * dir.x + y * dir.y > 0) low = Math.min(low, x * dir.x + y * dir.y)
      }
    }
    const loop = loopHolder(spec, seat - low + 1.2, flip)
    const world = (q: { x: number; y: number }) => {
      const r = rotate(rot, q.x, q.y)
      return { x: r.x + dir.x * seat, y: r.y + dir.y * seat }
    }
    const worldPoly = (poly: THREE.Vector2[]) => poly.map((q) => { const w = world(q); return new THREE.Vector2(w.x, w.y) })
    for (const part of loop.parts) cableBodies.push(brush(extrudePoly(worldPoly(part), z.next(3))))
    for (const c of loop.centres) centres.push({ ...world(c), rot })
    // the footprint must clear the mouth
    const nearMouth = loop.parts[1].some((q) => {
      const w = world(q)
      return Math.abs(w.x - around.xm) < around.tipHalf + 1.5 && w.y > support(around.outline, 0, 1) - 4
    })
    if (nearMouth) warnings.push('The holder sits too close to the mount\'s mouth. Move it further round.')
    if (loop.strain > 6) warnings.push(`The loop's hooked side has to bend about ${loop.strain.toFixed(0)}% to let a cable past, which can crack it. Raise Cable slot opening or use a thinner wall.`)
    notes.push('Slide the cable in sideways under the hook: the thin side of the loop springs out to let it past, then the hook keeps it in. Pull it back out the same way. A smaller Cable slot opening holds harder. PETG flexes best.')
  } else if (around && p.holder === 'slide') {
    // a channel hugging the mount: slide the cable in through the open, hooked end and it rests against the closed end
    const lip = hookLip(cab.cavR, p.cableOpening)
    const h = hookOnPath(around.path, cab.n, angle, {
      xm: around.xm,
      tipHalf: around.tipHalf,
      keepOut: around.keepOut,
      minSpacing: 2 * cab.cavT + 0.1,
      cavR: cab.cavR,
      halfLen: cab.cavT,
      wall,
      lip,
      minLength: 18,
    })
    const strain = hookStrain(wall, lip, h.length)
    if (strain > 6) warnings.push(`The hook's lip has to bend about ${strain.toFixed(0)}% to let a cable past, which can crack it. Raise Cable slot opening or use a thinner wall.`)
    cableBodies.push(brush(extrudePoly(h.poly, z.next(3))))
    h.centres.forEach((c, i) => centres.push({ x: c.x, y: c.y, rot: h.rots[i] }))
    if (h.crowded) warnings.push('The hook sits too close to the mount\'s mouth. Move it further round, or use fewer cables.')
    notes.push('Push the cable in past the lip and it stays: the lip narrows the entrance, so the cable squeezes through going in and is held coming back. A smaller Cable slot opening holds harder.')
  } else if (around && p.holder === 'square') {
    // one big rounded slot on the mount that all the cables sit in together
    const dcW = cab.room.w
    const dcT = cab.room.t
    // round cables: one row, or a block two wide; flat cords simply stack on top of each other
    const rows = cab.flat ? cab.n : cab.n >= 3 ? 2 : 1
    const cols = Math.ceil(cab.n / rows)
    const hw = (cols * dcW) / 2 // across the mouth
    const hh = (rows * dcT) / 2 // depth, away from the mouth
    const outward = p.cableFacing === 'outward'
    const normal = outward ? dirAngle : p.cableFacing === 'same' ? Math.PI / 2 : -Math.PI / 2
    const rot = normal - Math.PI / 2
    const reach = outward ? hh : Math.abs(dir.x) * hw + Math.abs(dir.y) * hh // how far the slot extends along the chosen direction
    const dist = support(around.outline, dir.x, dir.y) + reach + 0.05
    const cx = dir.x * dist
    const cy = dir.y * dist
    const gap = (Math.min(Math.max(p.cableOpening, 0), 95) / 100) * dcW
    const rg = buildRing({ cavity: slotProfile(hw, hh, 0, Math.min(hw, hh, dcT * 0.6)), wall, gap, flare: 0, z })
    cableBodies.push(placed(rg.body, cx, cy, rot))
    cableCavities.push(placed(rg.cavity, cx, cy, rot))
    for (let i = 0; i < cab.n; i++) {
      const g = rotate(rot, ((i % cols) - (cols - 1) / 2) * dcW, (Math.floor(i / cols) - (rows - 1) / 2) * dcT)
      centres.push({ x: cx + g.x, y: cy + g.y, rot })
    }
    if (cab.n === 3 && !cab.flat) notes.push('Three cables sit in a 2 × 2 slot, so they have a little room to shift. Two or four fit snugly.')
  } else {
    // rings, pockets or slide-in hooks around a pole; in a row beside a panel
    let places: Placement[]
    const pocket = around !== null && p.holder === 'pocket'
    if (around) {
      const opts = { xm: around.xm, tipHalf: around.tipHalf, keepOut: around.keepOut, minSpacing: cab.pitch }
      // several plain rings spread out evenly; everything else gathers where you put it
      const r = p.holder === 'rings' && cab.n >= 2 ? placeAround(around.path, cab.n, opts) : placeCluster(around.path, cab.n, angle, opts)
      places = r.places
      // one cable can open the same way as the mount (or the opposite way) instead of outward, so a single push seats both
      if (cab.n === 1 && p.holder === 'rings' && p.cableFacing !== 'outward') places = places.map((q) => ({ ...q, normal: p.cableFacing === 'opposite' ? -Math.PI / 2 : Math.PI / 2 }))
      if (r.crowded) warnings.push('The cables sit too close to the mount\'s mouth, or do not all fit. Move them further round, or use a bigger mount or fewer cables.')
    } else {
      const flip = p.cableFacing === 'opposite' ? Math.PI : 0
      places = Array.from({ length: cab.n }, (_, i) => ({ x: baseX + cab.cavT + 0.05 + i * cab.pitch, y: 0, normal: Math.PI / 2 + flip }))
    }
    for (const pl of places) {
      // a pocket is a closed round pocket whose pole-side wall is then cut away, so its far wall flows on from the clip's own wall
      const rg = buildRing({ cavity: cavityProfile(cab.cavT, cab.cavR), wall, gap: pocket ? 0 : cab.gap, flare: 0, z })
      // pocket: the mouth faces the mount, so the mount itself closes it once the clip is on
      const rot = pl.normal - Math.PI / 2 + (pocket ? Math.PI : 0) // rings are built with the mouth toward +Y
      cableBodies.push(placed(rg.body, pl.x, pl.y, rot))
      cableCavities.push(placed(rg.cavity, pl.x, pl.y, rot))
      // pocket: open the passage from the pocket to the mount's bore, through whatever is left of the wall
      // (as wide as the pocket itself, so the cut continues the pocket's sides smoothly)
      if (pocket) {
        const half = cab.cavT + 0.15
        cableCavities.push(placed(brush(box(-half, half, 0, cab.cavR + wall + 2, z.next(5))), pl.x, pl.y, rot))
        cableBodies.push(blend(around!.outline, pl, cab.outR, cab.outRad, z.next(3)))
      }
      centres.push({ x: pl.x, y: pl.y, rot: pl.normal - Math.PI / 2 })
    }
  }

  // Order matters for robustness: union, trim to the exact height, and only then
  // cut the cavities (their cutters overshoot, so they never share a plane with the ends).
  let body = addAll([pole.body, ...cableBodies])
  body = inter(body, brush(box(-500, 500, -500, 500, [0, W])))
  body = subAll(body, [pole.cavity, ...cableCavities, ...pole.extraCuts])

  const ghostCables = centres.map((c) => ghostCable(p, c.x, c.y, c.rot ?? 0, ghostZ))
  return finish(clampZ(body.geometry, 0, W), ghostMount, ghostCables, warnings, notes)
}

// ── strap-on saddle ──────────────────────────────────────────────────────────

function buildSaddle(p: ClipParams): ClipResult {
  const warnings: string[] = []
  const notes: string[] = []
  const W = p.width
  const wall = p.wall
  const z = new ZSource(0, W)
  const cab = cableSpec(p)
  const ghostZ: ZRange = [-7, W + 7]

  const mount = mountProfile(p)
  const cavity = offsetProfile(mount, p.mountClearance)
  const cavityPts = profilePoints(cavity)
  const cavityX = support(cavityPts, 1, 0)

  const strapT = p.strapThickness
  const padT = 0.3 + strapT + 0.4 + wall
  const baseX = cavityX + padT

  // Cable rings fan out from the pad, mouths facing outward; the fan keeps clear of the strap
  const xc = baseX + cab.outRad
  const places = placeFan(cab.n, { x0: xc, pitch: cab.pitch, clearance: padT + cab.outRad, outline: cavityPts })
  // the rings nearest the axis are tied to the pad; the rest are fused to their neighbours
  const minAng = Math.min(...places.map((q) => Math.abs(q.normal)))
  const anchors = places.filter((q) => Math.abs(q.normal) < minAng + 1e-6)

  // How wide the saddle can get before it stops hugging the mount: only the
  // part of the outline that is roughly flat against +x counts.
  let flat = 4
  for (const pt of cavityPts) if (pt.x >= cavityX - 1.5) flat = Math.max(flat, Math.abs(pt.y))
  const half = Math.min(Math.max(Math.max(...anchors.map((q) => Math.abs(q.y))) + cab.outR, 6), flat)

  const solids: Brush[] = [brush(box(0, baseX, -half, half, z.next(3.5)))]
  const cuts: Brush[] = [brush(extrudeProfile(cavity, z.next(5)))]

  // tunnels the strap threads through, running along Y just above the mount surface
  const tunnelH = p.strapWidth + 0.8
  const rib = 1.2
  let count = p.strapCount
  if (count === 2 && W < 2 * tunnelH + 3 * rib) {
    count = 1
    warnings.push('Two straps do not fit at this clip height, so only one tunnel was made. Make the clip taller for two.')
  }
  if (tunnelH + 2 * rib > W) {
    warnings.push(`A ${p.strapWidth} mm strap needs a taller clip. Raise the height to at least ${(tunnelH + 2 * rib).toFixed(1)} mm.`)
  }
  const centres = count === 1 ? [W / 2] : [rib + tunnelH / 2, W - rib - tunnelH / 2]
  for (const zc of centres) {
    cuts.push(brush(box(cavityX + 0.3, cavityX + 0.3 + strapT + 0.4, -(half + 1), half + 1, [zc - tunnelH / 2, zc + tunnelH / 2])))
  }

  // bars tie the anchor rings to the pad
  // (they start 0.2 wall above the tunnel ceiling so the two faces are never coplanar)
  for (const q of anchors) {
    const bh = cab.outR * 0.5
    solids.push(brush(box(baseX - wall * 0.8, q.x, q.y - bh, q.y + bh, z.next(3))))
  }
  for (const q of places) {
    const ring = buildRing({ cavity: cavityProfile(cab.cavT, cab.cavR), wall, gap: cab.gap, flare: 0, z })
    const rot = q.normal - Math.PI / 2 // rings are built with the mouth toward +Y
    solids.push(placed(ring.body, q.x, q.y, rot))
    cuts.push(placed(ring.cavity, q.x, q.y, rot))
  }
  if (wall < 1.2) warnings.push('Walls under 1.2 mm are only a couple of perimeters thick and break easily.')
  notes.push(`Use a zip tie or velcro strap up to ${p.strapWidth} mm wide. Thread it through the tunnel and around the mount.`)

  let body = addAll(solids)
  body = inter(body, brush(box(-500, 500, -500, 500, [0, W])))
  body = subAll(body, cuts)

  const ghostCables = places.map((q) => ghostCable(p, q.x, q.y, q.normal - Math.PI / 2, ghostZ))
  return finish(clampZ(body.geometry, 0, W), extrudeProfile(mount, ghostZ), ghostCables, warnings, notes)
}

// ── flat base ────────────────────────────────────────────────────────────────

function buildBase(p: ClipParams): ClipResult {
  const warnings: string[] = []
  const notes: string[] = []
  const W = p.width
  const wall = p.wall
  const z = new ZSource(0, W)
  const cab = cableSpec(p)
  const ghostZ: ZRange = [-7, W + 7]

  // rings in a row along X, all mouths up (+Y)
  const bodies: Brush[] = []
  const cavities: Brush[] = []
  const xs: number[] = []
  for (let i = 0; i < cab.n; i++) {
    const ring = buildRing({ cavity: cavityProfile(cab.cavT, cab.cavR), wall, gap: cab.gap, flare: 0, z })
    const x = (i - (cab.n - 1) / 2) * cab.pitch
    xs.push(x)
    bodies.push(placed(ring.body, x, 0))
    cavities.push(placed(ring.cavity, x, 0))
  }
  let rings = inter(addAll(bodies), brush(box(-500, 500, -500, 500, [0, W])))
  rings = subAll(rings, cavities)
  clampZ(rings.geometry, 0, W)

  // the plate sits under the rings and overlaps their lowest wall
  const rowHalf = ((cab.n - 1) * cab.pitch) / 2 + cab.outR
  const plateW = Math.max(p.size, 2 * rowHalf + 10)
  const plateL = Math.max(p.size, W + 6)
  const t = p.baseThickness
  const yTop = -cab.outRad + wall * 0.43
  const yBot = yTop - t

  const outline = slotProfile(plateW / 2, plateL / 2, 0, Math.min(4, plateW / 2, plateL / 2))
  const plateGeo = extrudeProfile(outline, [0, t]) // shape x,y in the plate plane, thickness along z
  plateGeo.rotateX(-Math.PI / 2) // → thickness along y
  plateGeo.translate(0, yBot, W / 2)
  let body = add(rings, brush(plateGeo))

  if (p.fixing === 'screws') {
    if (t < 2.2) warnings.push('Countersunk screw holes need a plate at least 2.2 mm thick.')
    const holes: Brush[] = []
    for (const sx of [plateW / 2 - 5, -(plateW / 2 - 5)]) {
      const shaft = new THREE.CylinderGeometry(1.8, 1.8, t + 4, 28)
      shaft.translate(sx, (yBot + yTop) / 2, W / 2)
      const sink = new THREE.CylinderGeometry(3.8, 1.8, 2, 28) // wide end faces +Y
      sink.translate(sx, yTop - 0.8, W / 2)
      holes.push(brush(shaft), brush(sink))
    }
    body = subAll(body, holes)
    notes.push('Two countersunk holes for M3 / #6 screws (3.6 mm).')
  } else {
    notes.push('Stick it down with double-sided tape or hot glue. Rough up the surface first for the best grip.')
  }
  if (wall < 1.2) warnings.push('Walls under 1.2 mm are only a couple of perimeters thick and break easily.')

  // lay the part on its back so the plate is flat on the bed: (x, y, z) → (x, -z, y)
  const toBed = (g: THREE.BufferGeometry) => {
    g.rotateX(Math.PI / 2)
    g.translate(0, 0, -yBot)
    return g
  }

  const slab = box(-(plateW / 2 + 8), plateW / 2 + 8, yBot - 4, yBot, [W / 2 - plateL / 2 - 8, W / 2 + plateL / 2 + 8])
  return finish(
    toBed(body.geometry),
    toBed(slab),
    xs.map((x) => toBed(ghostCable(p, x, 0, 0, ghostZ))),
    warnings,
    notes,
  )
}
