// Builds every mount × mechanism × holder × cable shape and reports open / non-manifold / flipped edges before and after the
// export repair. Run with: npx tsx scripts/check-mesh.ts

import { buildClip } from '../src/clip/buildClip'
import { DEFAULTS, SHAPE_START, mechanismsFor, type ClipParams } from '../src/clip/types'
import { checkTriangles, repairedTriangles, trianglesOf } from '../src/clip/meshRepair'
const shapes = ['round', 'square', 'rect', 'triangle', 'panel', 'flat'] as const
let bad = 0, tot = 0
for (const shape of shapes) for (const m of mechanismsFor(shape)) for (const holder of (shape === 'panel' || shape === 'flat' ? ['rings'] : ['rings', 'pocket', 'slide', 'square', 'latch'])) for (const flat of [false, true]) {
  const p = { ...DEFAULTS, ...SHAPE_START[shape], shape, mechanism: m.value, holder, cableShape: flat ? 'flat' : 'round', cableCount: 2 } as ClipParams
  const r = buildClip(p)
  const before = checkTriangles(trianglesOf(r.geometry))
  const t0 = Date.now()
  const after = checkTriangles(repairedTriangles(r.geometry))
  tot++
  if (!before.ok) bad++ // the export only repairs a mesh that is not already closed
  console.log(`${shape}/${m.value}/${holder}/${flat ? 'flat' : 'round'}: open ${before.openEdges} nm ${before.nonManifoldEdges} fl ${before.flippedEdges} -> open ${after.openEdges} nm ${after.nonManifoldEdges} fl ${after.flippedEdges} vol ${after.volume.toFixed(0)} ${Date.now() - t0}ms ${before.ok ? "" : "BAD"}`)
}
console.log(tot, 'cases', bad, 'bad')
