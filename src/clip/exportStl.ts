import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { geometryOf, triangulationForExport } from './meshRepair'

/** Binary STL download, repaired first (see meshRepair.ts). */
export function downloadStl(source: THREE.BufferGeometry, filename: string): void {
  // The booleans leave T-junctions and slivers that slicers report as open edges: mend them before writing
  const { tris, before, after, repaired } = triangulationForExport(source)
  if (import.meta.env?.DEV) console.info(`STL mesh ${repaired ? 'repaired' : 'left as is'}: open edges ${before.openEdges} → ${after.openEdges}, non-manifold ${before.nonManifoldEdges} → ${after.nonManifoldEdges}`)
  const out = geometryOf(tris)

  const data = new STLExporter().parse(new THREE.Mesh(out), { binary: true }) as DataView
  const blob = new Blob([data as unknown as BlobPart], { type: 'model/stl' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  out.dispose()
}
