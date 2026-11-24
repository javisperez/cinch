import * as THREE from 'three'
import { addAll, box, brush, clampZ, extrudePoly, inter, sub, tweak, ZSource, type Brush, type ZRange } from './csg'
import { cableRoom, ghostCable } from './cable'
import type { ClipResult } from './result'
import type { ClipParams } from './types'

/**
 * Arch clip: a stick-on plate with a flexible arch over the cables, like the
 * adhesive cable clips sold in packs. The arch is hinged on one side and its free
 * leg snaps behind a catch post on the other. It is printed closed, with a small
 * gap in the latch, so it comes off the bed ready to use.
 *
 * The whole thing is a straight extrusion of one outline along Z (the cable's
 * direction), so it prints standing on its end with no supports and the layers run
 * around the arch, which is the strong way to bend it.
 *
 *   +X  along the plate        +Y  up from the plate (the cables sit above y = 0)
 */

/** Rectangle with square bottom corners and rounded top corners, counter-clockwise. */
function roundedTop(x0: number, x1: number, y0: number, y1: number, r: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [new THREE.Vector2(x0, y0), new THREE.Vector2(x1, y0)]
  const arc = (cx: number, cy: number, from: number, to: number) => {
    const steps = 14
    for (let i = 0; i <= steps; i++) {
      const a = from + ((to - from) * i) / steps
      pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)))
    }
  }
  arc(x1 - r, y1 - r, 0, Math.PI / 2)
  arc(x0 + r, y1 - r, Math.PI / 2, Math.PI)
  return pts
}

const v = (x: number, y: number) => new THREE.Vector2(x, y)

export interface Arch {
  /** the finished outline solid (not yet trimmed to the clip height) */
  body: Brush
  /** where the cables sit, in the arch's own frame (+Y is up from the plate) */
  cables: { x: number; y: number }[]
  /** extent of the plate along X */
  xL: number
  xR: number
  rows: number
  cols: number
}

export interface PlateSpec {
  /** extra plate beyond the arch and the catch post, each side */
  margin: number
  /** the plate is at least this long */
  minLength: number
  thickness: number
}

/**
 * The arch, catch post, barb, lip and lift tab on a plate, in one frame: the plate
 * is y ∈ [-thickness, 0] and the cables sit above it. The stick-on clip uses it as
 * it is; a pole clip turns it on its side and uses the plate as the spine joining
 * it to the mount.
 */
export function makeArch(p: ClipParams, z: ZSource, plate: PlateSpec): Arch {
  const s = p.wall
  const t = plate.thickness

  // ── how big the opening has to be ──
  const n = Math.min(6, Math.max(1, Math.round(p.cableCount)))
  const room = cableRoom(p)
  const dcW = room.w
  const dcT = room.t
  // round cables: up to two rows; flat cords just stack
  const rows = room.flat ? n : n > 3 ? 2 : 1
  const cols = Math.ceil(n / rows)
  const Wi = cols * dcW + 1
  let Hi = rows * dcT + 0.8

  // ── latch geometry (see the numbers in the comments) ──
  const g = 1.2 // gap between the leg and the catch post
  const bd = 1.0 // how far the barb sticks out of the leg
  const lb = 0.8 // how far the lip sticks out of the post
  const yT = 0.8 // free end of the leg floats this high above the plate
  const yB = yT + 0.6 // bottom of the barb
  const yU = yB + 2.4 + 0.3 - g // lowest point of the lip: 0.3 mm above the barb, faces are parallel
  const yPost = yU + 2 * lb + 1.5 // top of the catch post
  Hi = Math.max(Hi, yPost + 1.2) // the lift tab passes over the post

  const ri = Math.min(Hi * 0.45, Wi * 0.3)
  const xo = Wi / 2 + s // outer face of the right leg
  const xp = xo + g // inner face of the post
  const pt = Math.max(2, s) // post thickness

  // ── the arch: a ring, minus the right leg's lower end ──
  const sink = Math.min(0.6, t / 2) // the ring's base hides inside the plate
  const outer = brush(extrudePoly(roundedTop(-Wi / 2 - s, xo, -sink, Hi + s, ri + s), z.next(3)))
  const inner = brush(extrudePoly(roundedTop(-Wi / 2, Wi / 2, -0.15, Hi, ri), z.next(5)))
  let arch = sub(outer, inner)
  arch = sub(arch, brush(box(Wi / 2 - 1, xo + 1, -10, yT, z.next(5))))

  // ── plate ──
  const baseL = -Wi / 2 - s - plate.margin
  const baseR = xp + pt + plate.margin
  const mid = (baseL + baseR) / 2
  const half = Math.max((baseR - baseL) / 2, plate.minLength / 2)
  // (retries nudge these by hundredths of a mm; the slicer will never notice, but it dodges rare coincident-face failures in the boolean ops)
  const nudge = tweak.n * 0.017
  const xL = mid - half - nudge
  const xR = mid + half + nudge * 1.3
  const base = brush(box(xL, xR, -t, 0, z.next(3)))

  // ── catch post with its lip ──
  const post = brush(box(xp, xp + pt, -0.3, yPost, z.next(3)))
  const lip = brush(
    extrudePoly(
      [
        v(xp - lb, yU + lb),
        v(xp + 0.1, yU - 0.1),
        v(xp + 0.6, yU - 0.1),
        v(xp + 0.6, yU + 2 * lb + 0.5),
        v(xp + 0.1, yU + 2 * lb + 0.5),
        v(xp - lb, yU + lb + 0.4),
      ],
      z.next(3),
    ),
  )

  // ── barb on the leg ──
  const barb = brush(
    extrudePoly(
      [v(xo - 0.4, yB - 0.1), v(xo - 0.1, yB - 0.1), v(xo + bd, yB + bd), v(xo + bd, yB + bd + 0.4), v(xo - 0.1, yB + 2.5), v(xo - 0.4, yB + 2.5)],
      z.next(3),
    ),
  )

  // ── lift tab: the arch's top continues outward past the post ──
  const tabR = xo + 7 + nudge * 1.7
  const tab = brush(extrudePoly([v(Wi / 2 - ri - 1, Hi + 0.1), v(tabR, Hi + 0.1), v(tabR, Hi + s + 0.1), v(Wi / 2 - ri - 1, Hi + s + 0.1)], z.next(3)))

  const cables: { x: number; y: number }[] = []
  for (let r = 0; r < rows; r++) {
    const inRow = r < rows - 1 ? cols : n - cols * (rows - 1)
    for (let c = 0; c < inRow; c++) cables.push({ x: (c - (inRow - 1) / 2) * dcW, y: 0.2 + dcT / 2 + r * dcT })
  }
  return { body: addAll([arch, base, post, lip, barb, tab]), cables, xL, xR, rows, cols }
}

export function buildBridge(p: ClipParams): ClipResult {
  const warnings: string[] = []
  const notes: string[] = []
  const W = p.width
  const s = p.wall
  const t = p.baseThickness
  const z = new ZSource(0, W)
  const ghostZ: ZRange = [-7, W + 7]
  const n = Math.min(6, Math.max(1, Math.round(p.cableCount)))

  const arch = makeArch(p, z, { margin: 4, minLength: p.size, thickness: t })
  const body = inter(arch.body, brush(box(-500, 500, -500, 500, [0, W])))
  const geometry = clampZ(body.geometry, 0, W)

  if (s < 1.2) warnings.push('Walls under 1.2 mm are only a couple of perimeters thick and break easily.')
  if (s > 2.4) warnings.push('A wall this thick makes the arch stiff, and the latch may not flex. Use 1.6–2.2 mm.')
  if (W < 8) warnings.push('A clip under 8 mm tall has very little grip. Raise Clip height.')
  notes.push(
    n > 3
      ? `Holds ${n} cables in ${arch.rows} row${arch.rows > 1 ? 's' : ''} of up to ${arch.cols}. The arch is hinged on the left: pull the tab up to unlatch it, lay the cables in, press it down until it clicks.`
      : `Pull the tab up to unlatch the arch, lay the cable${n > 1 ? 's' : ''} in, press it down until it clicks.`,
  )
  notes.push('Stick it down with double-sided tape or hot glue; rough up the surface first. PETG flexes best.')

  const ghostCables = arch.cables.map((c) => ghostCable(p, c.x, c.y, 0, ghostZ))
  const ghostMount = box(arch.xL - 8, arch.xR + 8, -t - 4, -t, [-8, W + 8])
  geometry.deleteAttribute('uv')
  geometry.computeBoundingBox()
  const size = geometry.boundingBox!.getSize(new THREE.Vector3())
  return { geometry, ghostMount, ghostCables, size: { x: size.x, y: size.y, z: size.z }, warnings, notes }
}
