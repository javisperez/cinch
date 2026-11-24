import * as THREE from 'three'
import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import { profileShape, type Profile } from './profile'

/**
 * Booleans run on manifold-3d (WASM), which builds every result as a watertight solid, so
 * the STL has no open edges to repair. The wasm file is fetched once at startup.
 */
async function load(): Promise<ManifoldToplevel> {
  const { default: Module } = await import('manifold-3d')
  let wasm: ManifoldToplevel
  if (typeof window !== 'undefined') {
    const url = (await import('manifold-3d/manifold.wasm?url')).default
    wasm = await Module({ locateFile: () => url })
  } else {
    wasm = await Module() // node (scripts): finds the file next to the module
  }
  wasm.setup()
  return wasm
}
const wasm = await load()

/** A solid: just its triangles. Each boolean op turns two of them into a manifold, combines them and reads the result back. */
export class Brush {
  geometry: THREE.BufferGeometry
  constructor(geometry: THREE.BufferGeometry) {
    this.geometry = geometry
  }
}

/** Welds the corners that coincide (three.js primitives repeat them per face) and hands the triangles to manifold. */
function toManifold(g: THREE.BufferGeometry): Manifold {
  const pos = g.attributes.position
  const index = g.index
  const count = index ? index.count : pos.count
  const ids = new Map<string, number>()
  const verts: number[] = []
  const at = (i: number): number => {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const k = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`
    let id = ids.get(k)
    if (id === undefined) {
      id = verts.length / 3
      ids.set(k, id)
      verts.push(x, y, z)
    }
    return id
  }
  const tris: number[] = []
  for (let t = 0; t < count; t += 3) {
    const a = at(index ? index.getX(t) : t)
    const b = at(index ? index.getX(t + 1) : t + 1)
    const c = at(index ? index.getX(t + 2) : t + 2)
    if (a !== b && b !== c && a !== c) tris.push(a, b, c)
  }
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris) })
  try {
    return new wasm.Manifold(mesh)
  } catch {
    mesh.merge() // best effort: stitch corners that are close but not identical
    return new wasm.Manifold(mesh)
  }
}

function fromManifold(m: Manifold): THREE.BufferGeometry {
  const mesh = m.getMesh()
  const g = new THREE.BufferGeometry()
  const n = mesh.numProp
  const src = mesh.vertProperties
  const out = new Float32Array((src.length / n) * 3)
  for (let i = 0, j = 0; i < src.length; i += n, j += 3) {
    out[j] = src[i]
    out[j + 1] = src[i + 1]
    out[j + 2] = src[i + 2]
  }
  g.setAttribute('position', new THREE.BufferAttribute(out, 3))
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.triVerts), 1))
  return g
}

function combine(a: Brush, b: Brush, f: (x: Manifold, y: Manifold) => Manifold): Brush {
  const live: Manifold[] = []
  try {
    const x = toManifold(a.geometry)
    live.push(x)
    const y = toManifold(b.geometry)
    live.push(y)
    const r = f(x, y)
    live.push(r)
    const status = r.status()
    if (status !== 'NoError') throw new Error(`Boolean failed: ${status}`)
    return new Brush(fromManifold(r))
  } finally {
    for (const m of live) m.delete()
  }
}

export type ZRange = [number, number]

/**
 * Boolean ops occasionally trip over exact coincidences between two shapes. When
 * a build fails its closed-mesh check, buildClip retries with this counter raised,
 * which nudges cutters and z-ranges by well under 0.1 mm.
 */
export const tweak = { n: 0 }

/**
 * Hands out z-ranges that are slightly different every time. Every solid is
 * built taller than the final part, so no two faces ever sit in the same plane
 * during a boolean op (which is where CSG gets flaky). A final intersection
 * trims the part to exactly its real height.
 */
export class ZSource {
  private lo: number
  private hi: number
  private n = 0
  constructor(lo: number, hi: number) {
    this.lo = lo
    this.hi = hi
  }
  /** the middle of the real part's height */
  get mid(): number {
    return (this.lo + this.hi) / 2
  }
  next(extra = 2): ZRange {
    this.n++
    const k = this.n * 0.0137 + tweak.n * 0.0311
    return [this.lo - extra - k, this.hi + extra + k * 1.27]
  }
}

export function brush(g: THREE.BufferGeometry): Brush {
  g.clearGroups()
  return new Brush(g)
}

export const add = (a: Brush, b: Brush): Brush => combine(a, b, (x, y) => x.add(y))
export const sub = (a: Brush, b: Brush): Brush => combine(a, b, (x, y) => x.subtract(y))
export const inter = (a: Brush, b: Brush): Brush => combine(a, b, (x, y) => x.intersect(y))
export const addAll = (list: Brush[]): Brush => list.slice(1).reduce((acc, b) => add(acc, b), list[0])
export const subAll = (base: Brush, cuts: Brush[]): Brush => cuts.reduce((acc, c) => sub(acc, c), base)

export function extrudeProfile(pr: Profile, z: ZRange): THREE.BufferGeometry {
  return extrudeShape(profileShape(pr), z)
}

export function extrudePoly(pts: THREE.Vector2[], z: ZRange): THREE.BufferGeometry {
  return extrudeShape(new THREE.Shape(pts), z)
}

function extrudeShape(shape: THREE.Shape, z: ZRange): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: z[1] - z[0], bevelEnabled: false, curveSegments: 1, steps: 1 })
  g.translate(0, 0, z[0])
  return g
}

export function box(x0: number, x1: number, y0: number, y1: number, z: ZRange): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z[1] - z[0])
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z[0] + z[1]) / 2)
  return g
}

/** Cylinder whose axis runs along Z. */
export function cylinder(r: number, x: number, y: number, z: ZRange, seg = 64): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, z[1] - z[0], seg)
  g.rotateX(Math.PI / 2)
  g.translate(x, y, (z[0] + z[1]) / 2)
  return g
}

/** A copy of a finished brush, rotated about Z then moved. Fresh geometry, so no stale BVH. */
export function placed(b: Brush, x: number, y: number, rotZ = 0): Brush {
  const g = b.geometry.clone()
  g.rotateZ(rotZ)
  g.translate(x, y, 0)
  return brush(g)
}

/**
 * The boolean trim is exact almost always; on rare slivers it can drift by a
 * fraction of a millimetre. Snap those vertices back so the part is exactly as tall as asked.
 */
export function clampZ(g: THREE.BufferGeometry, lo: number, hi: number): THREE.BufferGeometry {
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i)
    if (z < lo) pos.setZ(i, lo)
    else if (z > hi) pos.setZ(i, hi)
  }
  pos.needsUpdate = true
  return g
}

/**
 * 0 for a perfectly closed surface: the summed area vectors of a closed mesh cancel.
 * A hole or a missing patch leaves a remainder, as a fraction of the total area.
 */
export function openness(g: THREE.BufferGeometry): number {
  const geo = g.index ? g.toNonIndexed() : g
  const pos = geo.attributes.position.array as Float32Array
  let nx = 0, ny = 0, nz = 0, area = 0
  for (let t = 0; t < pos.length; t += 9) {
    const ax = pos[t + 3] - pos[t], ay = pos[t + 4] - pos[t + 1], az = pos[t + 5] - pos[t + 2]
    const bx = pos[t + 6] - pos[t], by = pos[t + 7] - pos[t + 1], bz = pos[t + 8] - pos[t + 2]
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx
    nx += cx; ny += cy; nz += cz
    area += Math.hypot(cx, cy, cz) / 2
  }
  return area > 0 ? Math.hypot(nx, ny, nz) / 2 / area : 1
}
