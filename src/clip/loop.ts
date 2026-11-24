import * as THREE from 'three'

/**
 * Closed clip: a rounded loop of thin plastic standing off the mount, closed at
 * the top, wider than it is tall and lying along the mount, with one side that curls outward into a small J-shaped lip at the bottom. The cable is
 * pushed in sideways under the lip; the long thin side springs outward to let it
 * past, then the hook holds it in.
 *
 *         ╭────────╮
 *         │        │
 *         │        │
 *         │ cable  ╭─╮    ← the right side comes down and curls outward
 *         │        ╰╮│
 *     ════╧════════╧═══     ← pad on the mount; the cable slides in along it
 *
 * One outline extruded along Z (the cable's direction), so it prints standing up with
 * no supports. Local frame: +Y away from the mount, centred on x = 0, hook on the +X
 * side, y = 0 is the seat on the mount.
 */

export interface LoopSpec {
  /** room each cable takes along the base (its width) */
  dcW: number
  /** and standing off it (its thickness): the same as the width for a round cable */
  dcT: number
  n: number
  wall: number
  /** Cable slot opening, % (bigger = wider entrance, easier in and out) */
  opening: number
}

export interface Loop {
  /** counter-clockwise outlines in the local frame: the thin loop, and the pad it sits on */
  parts: THREE.Vector2[][]
  /** where each cable sits */
  centres: { x: number; y: number }[]
  /** sideways extent from x = 0 */
  halfWidth: number
  /** rough peak strain in the springy side while a cable passes, % */
  strain: number
}

const v = (x: number, y: number) => new THREE.Vector2(x, y)

function arc(cx: number, cy: number, r: number, from: number, to: number, out: THREE.Vector2[]) {
  const steps = Math.max(4, Math.ceil((Math.abs(to - from) * r) / 0.35))
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps
    out.push(v(cx + r * Math.cos(a), cy + r * Math.sin(a)))
  }
}

/** Thicken a centre line into a closed outline of the given thickness, with a round end cap. */
function ribbon(line: THREE.Vector2[], t: number): THREE.Vector2[] {
  const h = t / 2
  const left: THREE.Vector2[] = []
  const right: THREE.Vector2[] = []
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)]
    const b = line[Math.min(line.length - 1, i + 1)]
    const d = b.clone().sub(a).normalize()
    const nx = -d.y
    const ny = d.x
    left.push(v(line[i].x + nx * h, line[i].y + ny * h))
    right.push(v(line[i].x - nx * h, line[i].y - ny * h))
  }
  // round cap at the free end
  const end = line[line.length - 1]
  const dEnd = end.clone().sub(line[line.length - 2]).normalize()
  const cap: THREE.Vector2[] = []
  const a0 = Math.atan2(dEnd.x, -dEnd.y) // angle of the left normal
  for (let i = 1; i < 6; i++) {
    const a = a0 - (Math.PI * i) / 6
    cap.push(v(end.x + h * Math.cos(a), end.y + h * Math.sin(a)))
  }
  const poly = [...left, ...cap, ...right.reverse()]
  let area = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    area += p.x * q.y - q.x * p.y
  }
  return area < 0 ? poly.reverse() : poly
}

/** `sink` is how far the pad reaches below y = 0 (the mount's bore cuts away the excess). */
export function loopHolder(s: LoopSpec, sink: number, flip: boolean): Loop {
  const { dcW, dcT, n, wall } = s
  const t = Math.max(0.8, Math.min(wall * 0.6, 1.4)) // thin on purpose, so it springs
  const h = t / 2
  const rc = Math.max(1.7, 0.28 * dcT) // the hook's radius
  const yF = 1.2 // the pad's top: the cable slides along it

  const open = Math.min(Math.max(s.opening, 0), 95) / 100
  const g = Math.max(0.3 * dcT, Math.min(0.85 * dcT, 0.8 * open * dcT)) // gap between the hook and the pad
  const delta = dcT - g + 0.3 // how far the hook has to lift to let the cable through
  const needL = Math.sqrt((1.5 * t * delta) / 0.04) // springy length that keeps the bend under about 4%

  // The loop is wider than it is tall, lying along the mount: a short wall on each side and a long thin top
  // that does the springing (the hook lifts as that beam bends). So the width is what the spring needs.
  const Hin = Math.max(dcT + 1.4, g + rc + 2.4) // inside height: hugs the cable, but the straight side has to be long enough to reach down to the hook
  const yTop = yF + Hin + h // centre line of the top
  const yc0 = yF + g + h + rc // centre of the hook's circle
  const R = Math.min(5, Math.max(1, yTop - yc0 - 0.3)) // top corner radius
  const a = Math.max((n * dcW + 2 * h + 0.4) / 2, (needL + R) / 2) // centre line of each side
  const L = 2 * a - R // the springy length: the top beam from the fixed side to the hook
  const strain = (100 * 1.5 * t * delta) / (L * L)

  const line: THREE.Vector2[] = [v(-a, yF - 0.8), v(-a, yTop - R)]
  arc(-a + R, yTop - R, R, Math.PI, Math.PI / 2, line)
  arc(a - R, yTop - R, R, Math.PI / 2, 0, line)
  line.push(v(a, yc0))
  // the hook curls outward (away from the cable): its lower curve is the lead-in the cable lifts as it slides under
  arc(a + rc, yc0, rc, Math.PI, Math.PI + (200 * Math.PI) / 180, line)
  // drop the duplicated joints so the normals stay clean
  const clean = line.filter((p, i) => i === 0 || p.distanceTo(line[i - 1]) > 1e-3)

  // centre the whole thing on x = 0 (the hook sticks out on one side)
  const left = -a - h - 0.5
  const right = a + 2 * rc + 2 * h
  const dx = -(left + right) / 2
  const loop = ribbon(clean, t).map((q) => v(q.x + dx, q.y))
  // the pad runs under the whole loop and out under the hook (a hair wider than the wall, so their faces never line up exactly)
  const pad = [v(left + dx, -sink), v(right + dx, -sink), v(right + dx, yF), v(left + dx, yF)]
  const x1 = (right - left) / 2
  const centres: { x: number; y: number }[] = []
  for (let i = 0; i < n; i++) centres.push({ x: -a + h + dcW / 2 + i * dcW + dx, y: yF + dcT / 2 })

  if (flip) {
    const mir = (p: THREE.Vector2[]) => p.map((q) => v(-q.x, q.y)).reverse()
    return { parts: [mir(loop), mir(pad)], centres: centres.map((c) => ({ x: -c.x, y: c.y })), halfWidth: x1, strain }
  }
  return { parts: [loop, pad], centres, halfWidth: x1, strain }
}
