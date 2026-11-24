import type * as THREE from 'three'
import { openness, tweak } from './csg'

export interface ClipResult {
  geometry: THREE.BufferGeometry
  /** translucent stand-ins for the real mount and cables, to judge the fit */
  ghostMount: THREE.BufferGeometry
  ghostCables: THREE.BufferGeometry[]
  size: { x: number; y: number; z: number }
  warnings: string[]
  /** neutral tips: what to buy, how to print */
  notes: string[]
}

/**
 * Boolean ops occasionally trip over exact coincidences. A build that is not a
 * closed surface is retried with tiny nudges (see `tweak`); the best attempt wins.
 */
/** counts builds and extra attempts; handy when tuning the geometry */
export const retryStats = { builds: 0, retries: 0 }

export function withRetries(build: () => ClipResult): ClipResult {
  retryStats.builds++
  let best: ClipResult | null = null
  let bestScore = Infinity
  let lastError: unknown = null
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      tweak.n = attempt
      if (attempt > 0) retryStats.retries++
      try {
        const r = build()
        const score = openness(r.geometry)
        if (score < bestScore) {
          best = r
          bestScore = score
        }
        if (score < 1e-5) break
      } catch (e) {
        lastError = e
      }
    }
  } finally {
    tweak.n = 0
  }
  if (!best) throw lastError ?? new Error('Could not build the clip')
  if (bestScore >= 1e-5) {
    best.warnings.push('The model may have a tiny gap that the slicer will need to repair. Nudging any value by 0.1 mm usually clears it.')
  }
  return best
}
