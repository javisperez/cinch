import * as THREE from 'three'
import { cylinder, extrudeProfile, type ZRange } from './csg'
import { circleProfile, slotProfile, type Profile } from './profile'
import type { ClipParams } from './types'

/**
 * What the cable looks like in cross-section. A round cable is a circle; a flat cord is a
 * stadium (a rounded slot) that lies on its wide side, so its width runs along the surface
 * it sits on and its thickness stands away from it. Every holder is drawn with the mouth
 * toward local +Y, so the cord's long axis is local X.
 */
export interface CableSize {
  flat: boolean
  /** along the surface (the diameter, for round) */
  w: number
  /** away from the surface (the diameter, for round) */
  t: number
}

export function cableSize(p: ClipParams): CableSize {
  return p.cableShape === 'flat' ? { flat: true, w: p.cableWidth, t: p.cableThickness } : { flat: false, w: p.cableDiameter, t: p.cableDiameter }
}

/** Room each cable takes, with its clearance: `w` along the surface, `t` away from it. */
export function cableRoom(p: ClipParams): { flat: boolean; w: number; t: number } {
  const c = cableSize(p)
  return { flat: c.flat, w: c.w + 2 * p.cableClearance, t: c.t + 2 * p.cableClearance }
}

/** Short label: "6 mm" or "5 × 3.3 mm". */
export function cableLabel(p: ClipParams, fmt: (n: number) => string): string {
  return p.cableShape === 'flat' ? `${fmt(p.cableWidth)} × ${fmt(p.cableThickness)} mm` : `${fmt(p.cableDiameter)} mm`
}

/** Outline of the space a cable sits in: a circle, or a stadium with its long axis along X. */
export function cavityProfile(halfW: number, halfT: number): Profile {
  return Math.abs(halfW - halfT) < 1e-6 ? circleProfile(halfW) : slotProfile(halfW, halfT, 0, Math.min(halfW, halfT))
}

/** The see-through cable shown in the preview, lying along the clip's axis. */
export function ghostCable(p: ClipParams, x: number, y: number, rot: number, z: ZRange): THREE.BufferGeometry {
  const c = cableSize(p)
  if (!c.flat) return cylinder(c.w / 2, x, y, z)
  const g = extrudeProfile(slotProfile(c.w / 2, c.t / 2, 0, Math.min(c.w, c.t) / 2), z)
  g.rotateZ(rot)
  g.translate(x, y, 0)
  return g
}
