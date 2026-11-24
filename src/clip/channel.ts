import * as THREE from 'three'
import { add, addAll, box, brush, clampZ, extrudePoly, inter, subAll, ZSource, type ZRange } from './csg'
import { hookLip, hookPolygon, hookStrain } from './around'
import { cableRoom, ghostCable } from './cable'
import { slotProfile } from './profile'
import { buildRing } from './rings'
import type { ClipResult } from './result'
import type { ClipParams } from './types'

/**
 * Snap channel: a stick-on plate with one sturdy rounded slot on it. The cables
 * press in past two short lips and stay there. Nothing is hinged and nothing is
 * thin, so there is no part that can snap off: the only thing that moves is the
 * stiff lip, and only by a fraction of a millimetre. Like the arch clip it is a
 * straight extrusion along the cable, printed standing on its end.
 */
export function buildChannel(p: ClipParams): ClipResult {
  const warnings: string[] = []
  const notes: string[] = []
  const W = p.width
  const wall = p.wall
  const t = p.baseThickness
  const z = new ZSource(0, W)
  const ghostZ: ZRange = [-7, W + 7]

  const n = Math.min(6, Math.max(1, Math.round(p.cableCount)))
  const room = cableRoom(p)
  const dcW = room.w
  const dcT = room.t
  // round cables: one row up to two, then a squarish block two wide; flat cords stack
  const rows = room.flat ? n : n >= 3 ? 2 : 1
  const cols = Math.ceil(n / rows)
  const hw = (cols * dcW) / 2
  const hh = (rows * dcT) / 2
  const gap = (Math.min(Math.max(p.cableOpening, 0), 95) / 100) * dcW
  const cy = hh + 0.05 // the slot's floor just clears the plate; its wall shares the plate's thickness

  const ring = buildRing({
    cavity: slotProfile(hw, hh, 0, Math.min(hw, hh, dcT * 0.6)),
    wall,
    gap,
    flare: p.lipFlare,
    z,
  })
  if (!ring.tips) warnings.push('The mouth could not be placed. Try a smaller opening.')

  const halfPlate = Math.max(hw + wall + 4, p.size / 2)
  const plate = brush(box(-halfPlate, halfPlate, -t, 0, z.next(3)))
  const place = (b: ReturnType<typeof brush>) => {
    const g = b.geometry.clone()
    g.translate(0, cy, 0)
    return brush(g)
  }
  let body = add(place(ring.body), plate)
  body = inter(body, brush(box(-500, 500, -500, 500, [0, W])))
  body = subAll(body, [place(ring.cavity), ...ring.extraCuts.map(place)])
  const geometry = clampZ(body.geometry, 0, W)

  if (wall < 1.2) warnings.push('Walls under 1.2 mm are only a couple of perimeters thick and break easily.')
  if (n === 3 && !room.flat) notes.push('Three cables sit in a 2 × 2 slot, so they have a little room to shift. Two or four fit snugly.')
  notes.push('Press the cables in past the lips until they drop into the slot. A smaller Cable slot opening holds them harder.')
  notes.push('Stick it down with double-sided tape or hot glue; rough up the surface first.')

  const ghostCables: THREE.BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    ghostCables.push(ghostCable(p, ((i % cols) - (cols - 1) / 2) * dcW, cy + (Math.floor(i / cols) - (rows - 1) / 2) * dcT, 0, ghostZ))
  }

  const ghostMount = box(-halfPlate - 8, halfPlate + 8, -t - 4, -t, [-8, W + 8])
  geometry.deleteAttribute('uv')
  geometry.computeBoundingBox()
  const s = geometry.boundingBox!.getSize(new THREE.Vector3())
  return { geometry, ghostMount, ghostCables, size: { x: s.x, y: s.y, z: s.z }, warnings, notes }
}

/**
 * Slide-in hook: a stick-on plate with a band standing clear of it, closed at one
 * end with a round cap and open at the other, where it finishes in a rounded lip.
 * The cable slides in through the open end along the plate and rests against the cap.
 * Nothing is hinged. Like the other flat clips it is a straight extrusion along the
 * cable, printed standing on its end.
 */
export function buildSlide(p: ClipParams): ClipResult {
  const warnings: string[] = []
  const notes: string[] = []
  const W = p.width
  const wall = p.wall
  const t = p.baseThickness
  const z = new ZSource(0, W)
  const ghostZ: ZRange = [-7, W + 7]

  const n = Math.min(6, Math.max(1, Math.round(p.cableCount)))
  const room = cableRoom(p)
  const cavR = room.t / 2 // standing off the plate
  const cavT = room.w / 2 // along it
  const outR = cavR + wall
  const cy = cavR + 0.05 // the track the cable centres run along, just above the plate

  const lip = hookLip(cavR, p.cableOpening)
  const hook = hookPolygon((d) => ({ x: d, y: cy, nx: 0, ny: 1, ux: 1, uy: 0 }), n, { pitch: 2 * cavT + 0.1, cavR, wall, lip, minLength: 18, halfLen: cavT })
  // centre it on the plate
  const shift = -(hook.length - outR) / 2
  const poly = hook.poly.map((q) => new THREE.Vector2(q.x + shift, q.y))
  const centres = hook.centres.map((q) => new THREE.Vector2(q.x + shift, q.y))

  const halfPlate = Math.max((hook.length + outR) / 2 + 6, p.size / 2)
  const plate = brush(box(-halfPlate, halfPlate, -t, 0, z.next(3)))
  let body = addAll([brush(extrudePoly(poly, z.next(3))), plate])
  body = inter(body, brush(box(-500, 500, -500, 500, [0, W])))
  const geometry = clampZ(body.geometry, 0, W)

  if (wall < 1.2) warnings.push('Walls under 1.2 mm are only a couple of perimeters thick and break easily.')
  const strain = hookStrain(wall, lip, hook.length)
  if (strain > 6) warnings.push(`The hook's lip has to bend about ${strain.toFixed(0)}% to let a cable past, which can crack it. Raise Cable slot opening or use a thinner wall.`)
  notes.push('Push the cable in past the lip and it stays: the lip narrows the entrance, so the cable squeezes through going in and is held coming back. A smaller Cable slot opening holds harder.')
  notes.push('Stick it down with double-sided tape or hot glue; rough up the surface first.')

  const ghostCables = centres.map((c) => ghostCable(p, c.x, c.y, 0, ghostZ))
  const ghostMount = box(-halfPlate - 8, halfPlate + 8, -t - 4, -t, [-8, W + 8])
  geometry.deleteAttribute('uv')
  geometry.computeBoundingBox()
  const s = geometry.boundingBox!.getSize(new THREE.Vector3())
  return { geometry, ghostMount, ghostCables, size: { x: s.x, y: s.y, z: s.z }, warnings, notes }
}
