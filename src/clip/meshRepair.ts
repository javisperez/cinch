import * as THREE from 'three'

/**
 * Export-time mesh repair. The boolean ops that build the clips leave T-junctions along
 * their split lines (a vertex sits in the middle of a neighbouring triangle's edge), which
 * slicers report as open edges. Three steps, on the triangle soup that actually gets written:
 *   1. weld vertices that differ only by floating-point noise,
 *   2. split edges at the vertices that lie on them (T-junctions),
 *   3. cap any small closed gap that is left.
 * Pure data in and out, so the same code runs in the browser and in a Node check.
 */

type Vec3 = [number, number, number]
export interface Tri {
  a: Vec3
  b: Vec3
  c: Vec3
}

/** Vertices closer than this (mm) are the same vertex: far below anything printable, far above float32 noise. */
const WELD = 3e-3
/** How far (mm) a vertex may sit from an edge line and still count as lying on it. */
const ON_EDGE = 4e-3

export function trianglesOf(geo: THREE.BufferGeometry): Tri[] {
  const g = geo.index ? geo.toNonIndexed() : geo
  const p = g.attributes.position.array as ArrayLike<number>
  const out: Tri[] = []
  for (let t = 0; t + 8 < p.length; t += 9) {
    out.push({ a: [p[t], p[t + 1], p[t + 2]], b: [p[t + 3], p[t + 4], p[t + 5]], c: [p[t + 6], p[t + 7], p[t + 8]] })
  }
  if (g !== geo) g.dispose()
  return out
}

export function geometryOf(tris: Tri[]): THREE.BufferGeometry {
  const arr = new Float32Array(tris.length * 9)
  tris.forEach((t, i) => arr.set([...t.a, ...t.b, ...t.c], i * 9))
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
  return g
}

// ── 1. weld ──

export function weld(tris: Tri[]): Tri[] {
  const cell = WELD
  const grid = new Map<string, Vec3[]>()
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`
  const snap = (v: Vec3): Vec3 => {
    const cx = Math.floor(v[0] / cell)
    const cy = Math.floor(v[1] / cell)
    const cz = Math.floor(v[2] / cell)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const list = grid.get(key(cx + dx, cy + dy, cz + dz))
          if (!list) continue
          for (const q of list) if (Math.hypot(q[0] - v[0], q[1] - v[1], q[2] - v[2]) <= WELD) return q
        }
    const k = key(cx, cy, cz)
    const list = grid.get(k)
    if (list) list.push(v)
    else grid.set(k, [v])
    return v
  }
  const out: Tri[] = []
  for (const t of tris) {
    const a = snap(t.a)
    const b = snap(t.b)
    const c = snap(t.c)
    // a triangle collapsed by welding takes its edges with it
    if (a === b || b === c || c === a) continue
    out.push({ a, b, c })
  }
  return out
}

// ── 2. T-junctions ──

const vk = (v: Vec3) => `${v[0]},${v[1]},${v[2]}`
const ek = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function edgeCounts(tris: Tri[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of tris) {
    const k = [vk(t.a), vk(t.b), vk(t.c)]
    for (let i = 0; i < 3; i++) {
      const e = ek(k[i], k[(i + 1) % 3])
      m.set(e, (m.get(e) || 0) + 1)
    }
  }
  return m
}

export function fixTJunctions(input: Tri[]): Tri[] {
  let tris = input
  for (let pass = 0; pass < 8; pass++) {
    const counts = edgeCounts(tris)
    // vertices on unpaired edges are the only ones that can sit in the middle of a neighbour's edge
    const cand: Vec3[] = []
    const seen = new Set<string>()
    for (const t of tris) {
      const vs = [t.a, t.b, t.c]
      for (let i = 0; i < 3; i++) {
        const p = vs[i]
        const q = vs[(i + 1) % 3]
        if (counts.get(ek(vk(p), vk(q))) !== 1) continue
        for (const v of [p, q]) {
          const k = vk(v)
          if (!seen.has(k)) {
            seen.add(k)
            cand.push(v)
          }
        }
      }
    }
    if (!cand.length) break

    // a coarse grid over the candidates, so each edge only looks at the few near it
    const CELL = 2
    const grid = new Map<string, Vec3[]>()
    for (const v of cand) {
      const k = `${Math.floor(v[0] / CELL)},${Math.floor(v[1] / CELL)},${Math.floor(v[2] / CELL)}`
      const l = grid.get(k)
      if (l) l.push(v)
      else grid.set(k, [v])
    }
    const near = (p: Vec3, q: Vec3): Vec3[] => {
      const lo = [0, 1, 2].map((i) => Math.floor((Math.min(p[i], q[i]) - ON_EDGE) / CELL))
      const hi = [0, 1, 2].map((i) => Math.floor((Math.max(p[i], q[i]) + ON_EDGE) / CELL))
      const out: Vec3[] = []
      for (let x = lo[0]; x <= hi[0]; x++)
        for (let y = lo[1]; y <= hi[1]; y++)
          for (let z = lo[2]; z <= hi[2]; z++) {
            const l = grid.get(`${x},${y},${z}`)
            if (l) out.push(...l)
          }
      return out
    }

    let changed = false
    const next: Tri[] = []
    for (const t of tris) {
      const vs = [t.a, t.b, t.c]
      let replaced = false
      for (let i = 0; i < 3 && !replaced; i++) {
        const p = vs[i]
        const q = vs[(i + 1) % 3]
        const opp = vs[(i + 2) % 3]
        if (counts.get(ek(vk(p), vk(q))) !== 1) continue
        const d: Vec3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
        const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]
        const splits: { s: number; v: Vec3 }[] = []
        for (const c of near(p, q)) {
          if (c === p || c === q || c === opp) continue
          const pc: Vec3 = [c[0] - p[0], c[1] - p[1], c[2] - p[2]]
          const s = (pc[0] * d[0] + pc[1] * d[1] + pc[2] * d[2]) / len2
          if (s <= 0 || s >= 1) continue
          const ex = pc[0] - s * d[0]
          const ey = pc[1] - s * d[1]
          const ez = pc[2] - s * d[2]
          if (ex * ex + ey * ey + ez * ez > ON_EDGE * ON_EDGE) continue
          splits.push({ s, v: c })
        }
        if (!splits.length) continue
        splits.sort((x, y) => x.s - y.s)
        const chain = [p, ...splits.map((x) => x.v), q]
        for (let j = 0; j < chain.length - 1; j++) next.push({ a: chain[j], b: chain[j + 1], c: opp })
        replaced = true
        changed = true
      }
      if (!replaced) next.push(t)
    }
    tris = next
    if (!changed) break
  }
  return tris
}

// ── 2b. flat end faces ──
// The two end faces of a clip are big flat shapes that the booleans chop into long slivers, and the slivers are where the
// open edges live. The walls between them are clean, so throw the end faces away and triangulate them again from the
// outline the walls leave behind.

function bounds(tris: Tri[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const t of tris) for (const v of [t.a, t.b, t.c]) for (let i = 0; i < 3; i++) {
    if (v[i] < min[i]) min[i] = v[i]
    if (v[i] > max[i]) max[i] = v[i]
  }
  return { min, max }
}

function polyArea(p: THREE.Vector2[]): number {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length]
    a += p[i].x * q.y - q.x * p[i].y
  }
  return a / 2
}

function inside(pt: THREE.Vector2, poly: THREE.Vector2[]): boolean {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

const DEBUG = false
/** the widest hairline gap (mm) in a wall that the outline reader will step across */
const HOP = 0.06
/** Rebuild the flat face lying on one bounding-box plane. Returns null if its outline can't be read cleanly. */
function rebuildPlane(walls: Tri[], axis: number, at: number, outward: number): Tri[] | null {
  const on = (v: Vec3) => Math.abs(v[axis] - at) < 1e-6
  const u = (axis + 1) % 3
  const w = (axis + 2) % 3
  const counts = edgeCounts(walls)
  // edges of the walls that lie in the plane and have nothing on their other side
  const edges: [Vec3, Vec3][] = []
  for (const t of walls) {
    const vs = [t.a, t.b, t.c]
    for (let i = 0; i < 3; i++) {
      const p = vs[i]
      const q = vs[(i + 1) % 3]
      if (on(p) && on(q) && counts.get(ek(vk(p), vk(q))) === 1) edges.push([p, q])
    }
  }
  if (!edges.length) return null
  const adj = new Map<string, number[]>()
  edges.forEach((e, i) => {
    for (const v of e) (adj.get(vk(v)) ?? adj.set(vk(v), []).get(vk(v))!).push(i)
  })
  const used = new Set<number>()
  const loops: Vec3[][] = []
  for (let s = 0; s < edges.length; s++) {
    if (used.has(s)) continue
    used.add(s)
    const loop: Vec3[] = [edges[s][0]]
    let cur = edges[s][1]
    let guard = 0
    while (vk(cur) !== vk(edges[s][0]) && guard++ < 100000) {
      loop.push(cur)
      let nx = (adj.get(vk(cur)) || []).find((i) => !used.has(i))
      if (nx === undefined) {
        // a hairline gap in the walls: hop to the nearest loose end within a fraction of a millimetre and carry on
        const start = edges[s][0]
        let bestD = HOP
        let bestEnd: Vec3 | null = null
        const toStart = Math.hypot(start[0] - cur[0], start[1] - cur[1], start[2] - cur[2])
        if (toStart < HOP) {
          bestD = toStart
          cur = start // the gap is where the loop closes
          break
        }
        for (let i = 0; i < edges.length; i++) {
          if (used.has(i)) continue
          for (const v of edges[i]) {
            const d = Math.hypot(v[0] - cur[0], v[1] - cur[1], v[2] - cur[2])
            if (d < bestD) {
              bestD = d
              bestEnd = v
              nx = i
            }
          }
        }
        if (nx === undefined || !bestEnd) {
          if (DEBUG) console.log('   open chain at', cur, 'after', loop.length, 'pts; edges in plane', edges.length)
          return null
        }
        used.add(nx)
        loop.push(bestEnd)
        cur = bestEnd === edges[nx][0] ? edges[nx][1] : edges[nx][0]
        continue
      }
      used.add(nx)
      cur = vk(edges[nx][0]) === vk(cur) ? edges[nx][1] : edges[nx][0]
    }
    if (vk(cur) !== vk(edges[s][0]) || loop.length < 3) { if (DEBUG) console.log('   not closed'); return null }
    loops.push(loop)
  }

  const flat = loops.map((l) => l.map((v) => new THREE.Vector2(v[u], v[w])))
  const depth = flat.map((l, i) => flat.reduce((n, m, j) => (j !== i && Math.abs(polyArea(m)) > Math.abs(polyArea(l)) && inside(l[0], m) ? n + 1 : n), 0))
  const out: Tri[] = []
  flat.forEach((_, i) => {
    if (depth[i] % 2 === 1) return // holes are handled with their outer loop
    const holes: number[] = []
    flat.forEach((m, j) => {
      if (depth[j] !== depth[i] + 1) return
      if (inside(m[0], flat[i])) holes.push(j)
    })
    const contour = flat[i].slice()
    if (polyArea(contour) < 0) contour.reverse()
    const hs = holes.map((j) => {
      const h = flat[j].slice()
      if (polyArea(h) > 0) h.reverse()
      return h
    })
    const pts: THREE.Vector2[] = [...contour, ...hs.flat()]
    const lookup = new Map<string, Vec3>()
    loops.forEach((l) => l.forEach((v) => lookup.set(`${v[u]},${v[w]}`, v)))
    const idx = THREE.ShapeUtils.triangulateShape(contour, hs)
    const v3 = (p: THREE.Vector2) => lookup.get(`${p.x},${p.y}`)!
    for (const [x, y, z] of idx) {
      const A = v3(pts[x])
      const B = v3(pts[y])
      const C = v3(pts[z])
      if (!A || !B || !C) continue
      // triangulateShape winds counter-clockwise in (u, w); flip when that points the wrong way for this face
      const flipIt = outward * (cyc(axis)) < 0
      out.push(flipIt ? { a: A, b: C, c: B } : { a: A, b: B, c: C })
    }
  })
  return out
}

// (u, w) = (axis + 1, axis + 2) mod 3 is a right-handed pair, so counter-clockwise in (u, w) points along +axis
const cyc = (_axis: number) => 1

export function rebuildEnds(tris: Tri[], log?: (m: string) => void): Tri[] | null {
  const { min, max } = bounds(tris)
  const planes: { axis: number; at: number; outward: number }[] = []
  for (let axis = 0; axis < 3; axis++) {
    planes.push({ axis, at: min[axis], outward: -1 }, { axis, at: max[axis], outward: 1 })
  }
  const inPlane = (t: Tri, p: { axis: number; at: number }) => [t.a, t.b, t.c].every((v) => Math.abs(v[p.axis] - p.at) < 1e-6)
  // the clip is a straight extrusion: its two end faces are the pair of planes (one axis) that carry the most flat area
  const areaOn = (p: { axis: number; at: number }) =>
    tris.filter((t) => inPlane(t, p)).reduce((sum, { a, b, c }) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
      return sum + Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
    }, 0)
  let best = -1
  let bestArea = 0
  for (let axis = 0; axis < 3; axis++) {
    const a = Math.min(areaOn(planes[axis * 2]), areaOn(planes[axis * 2 + 1]))
    if (a > bestArea) {
      bestArea = a
      best = axis
    }
  }
  const real = best < 0 ? [] : [planes[best * 2], planes[best * 2 + 1]]
  let walls = tris.filter((t) => !real.some((p) => inPlane(t, p)))
  walls = fixTJunctions(walls)
  const faces: Tri[] = []
  for (const p of real) {
    const rebuilt = rebuildPlane(walls, p.axis, p.at, p.outward)
    if (!rebuilt) {
      log?.(`plane axis ${p.axis} at ${p.at}: outline not readable`)
      return null
    }
    faces.push(...rebuilt)
  }
  return [...walls, ...faces]
}

// ── 3. cap leftover gaps ──

export function capGaps(tris: Tri[]): Tri[] {
  interface E {
    a: Vec3
    b: Vec3
    n: number
  }
  const edges = new Map<string, E>()
  const add = (a: Vec3, b: Vec3) => {
    const k = ek(vk(a), vk(b))
    const e = edges.get(k)
    if (e) e.n++
    else edges.set(k, { a, b, n: 1 })
  }
  for (const t of tris) {
    add(t.a, t.b)
    add(t.b, t.c)
    add(t.c, t.a)
  }
  const open = [...edges.values()].filter((e) => e.n === 1)
  if (!open.length) return tris
  const adj = new Map<string, E[]>()
  for (const e of open) for (const k of [vk(e.a), vk(e.b)]) (adj.get(k) ?? adj.set(k, []).get(k)!).push(e)

  const out = [...tris]
  const used = new Set<E>()
  for (const start of open) {
    if (used.has(start)) continue
    used.add(start)
    const loop: Vec3[] = [start.a, start.b]
    const startKey = vk(start.a)
    let cur = vk(start.b)
    let guard = 0
    while (cur !== startKey && guard++ < 20000) {
      const next = (adj.get(cur) || []).find((e) => !used.has(e))
      if (!next) break
      used.add(next)
      const v = vk(next.a) === cur ? next.b : next.a
      cur = vk(v)
      if (cur !== startKey) loop.push(v)
    }
    if (cur !== startKey || loop.length < 3) continue
    // wind the cap the way the surrounding faces need it: the loop was walked against the wall's own
    // direction, so the fan has to run the same way as that wall's edge (b → a)
    for (let i = 1; i < loop.length - 1; i++) out.push({ a: loop[0], b: loop[i + 1], c: loop[i] })
  }
  return out
}

// ── check ──

export interface MeshReport {
  triangles: number
  openEdges: number
  nonManifoldEdges: number
  flippedEdges: number
  volume: number
  ok: boolean
}

export function checkTriangles(tris: Tri[]): MeshReport {
  const und = new Map<string, number>()
  const dir = new Map<string, number>()
  let six = 0
  for (const { a, b, c } of tris) {
    const k = [vk(a), vk(b), vk(c)]
    for (let i = 0; i < 3; i++) {
      const p = k[i]
      const q = k[(i + 1) % 3]
      und.set(ek(p, q), (und.get(ek(p, q)) || 0) + 1)
      dir.set(`${p}>${q}`, (dir.get(`${p}>${q}`) || 0) + 1)
    }
    six += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])
  }
  let openEdges = 0
  let nonManifoldEdges = 0
  for (const n of und.values()) {
    if (n === 1) openEdges++
    else if (n > 2) nonManifoldEdges++
  }
  let flippedEdges = 0
  for (const n of dir.values()) if (n > 1) flippedEdges++
  const volume = six / 6
  return { triangles: tris.length, openEdges, nonManifoldEdges, flippedEdges, volume, ok: openEdges === 0 && nonManifoldEdges === 0 && flippedEdges === 0 && volume > 0 }
}

/**
 * The booleans sometimes leave the same triangle twice. Two copies wound the same way are one too many; two wound
 * opposite ways are a zero-thickness fold. Either way they only confuse a slicer, so they go.
 */
export function dedupe(tris: Tri[]): Tri[] {
  const groups = new Map<string, { t: Tri; sign: number }[]>()
  for (const t of tris) {
    const ks = [vk(t.a), vk(t.b), vk(t.c)]
    const sorted = [...ks].sort()
    // sign of the permutation that sorts the corners tells which way the triangle faces
    const perm = ks.map((k) => sorted.indexOf(k))
    const flips = (perm[0] > perm[1] ? 1 : 0) + (perm[0] > perm[2] ? 1 : 0) + (perm[1] > perm[2] ? 1 : 0)
    const g = sorted.join('#')
    const list = groups.get(g)
    const entry = { t, sign: flips % 2 === 0 ? 1 : -1 }
    if (list) list.push(entry)
    else groups.set(g, [entry])
  }
  const out: Tri[] = []
  for (const list of groups.values()) {
    const pos = list.filter((e) => e.sign > 0)
    const neg = list.filter((e) => e.sign < 0)
    const net = pos.length - neg.length
    if (net > 0) out.push(pos[0].t)
    else if (net < 0) out.push(neg[0].t)
  }
  return out
}

/**
 * Needles: triangles squashed flat (their third corner lies on the line through the other two), left behind by the
 * booleans and by splitting edges. They have no area to print, but their edges confuse slicers. Dropping one leaves its
 * neighbours with an edge split in two, which the T-junction pass then mends.
 */
export function dropDegenerate(tris: Tri[]): Tri[] {
  return tris.filter(({ a, b, c }) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    const wx = c[0] - b[0], wy = c[1] - b[1], wz = c[2] - b[2]
    const cross = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
    const longest = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz), Math.hypot(wx, wy, wz))
    return longest > 0 && cross / longest > WELD // its height, the width of the needle
  })
}

/** The same repair, with the result checked against what went in. */
export function triangulationForExport(geo: THREE.BufferGeometry): { tris: Tri[]; before: MeshReport; after: MeshReport; repaired: boolean } {
  const original = weld(trianglesOf(geo))
  const before = checkTriangles(original)
  let tris = original
  let after = before
  try {
    const fixed = repairedTriangles(geo)
    const rep = checkTriangles(fixed)
    const issues = (r: MeshReport) => r.openEdges + r.nonManifoldEdges + r.flippedEdges
    // only take the repair if it really is better and has not changed the part (volume within half a percent)
    if (issues(rep) < issues(before) && Math.abs(rep.volume - before.volume) <= 0.005 * Math.abs(before.volume)) {
      tris = fixed
      after = rep
    }
  } catch {
    // keep the original
  }
  return { tris, before, after, repaired: tris !== original }
}

/** The triangles an STL export writes: welded, T-junctions split, small gaps capped. */
export function repairedTriangles(geo: THREE.BufferGeometry): Tri[] {
  const clean = dedupe(dropDegenerate(weld(trianglesOf(geo))))
  // best: rebuild the end faces from the walls' outline; if that outline can't be read, split T-junctions everywhere instead
  const ends = rebuildEnds(clean)
  if (ends) return capGaps(dedupe(ends))
  // splitting edges can leave new needles, and dropping those can leave new T-junctions: go round until it settles
  let t = clean
  for (let i = 0; i < 4; i++) {
    const before = t.length
    t = dedupe(dropDegenerate(fixTJunctions(t)))
    if (t.length === before) break
  }
  return capGaps(t)
}
