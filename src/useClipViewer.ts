import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ClipResult } from './clip/buildClip'

/** Z-up scene, like a slicer: the grid is the print bed and the clip stands on it. Always viewed isometrically (orthographic). */
export function useClipViewer(canvasRef: Ref<HTMLCanvasElement | null>) {
  let renderer: THREE.WebGLRenderer | null = null
  let scene: THREE.Scene | null = null
  let ortho: THREE.OrthographicCamera | null = null
  /** half the visible height of the orthographic view (mm) */
  let orthoHalf = 40
  let controls: OrbitControls | null = null
  let observer: ResizeObserver | null = null
  let raf = 0

  const clipMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.5, metalness: 0.0 })
  const mountMat = new THREE.MeshStandardMaterial({
    color: 0x5b6b7d, roughness: 0.6, transparent: true, opacity: 0.3, depthWrite: false,
  })
  const cableMat = new THREE.MeshStandardMaterial({
    color: 0x1d1f22, roughness: 0.6, transparent: true, opacity: 0.4, depthWrite: false,
  })

  const clipGroup = new THREE.Group()
  const ghostGroup = new THREE.Group()
  let latest: ClipResult | null = null
  let fitted = false

  function init() {
    const canvas = canvasRef.value
    if (!canvas) return

    scene = new THREE.Scene()
    scene.background = new THREE.Color(0xece7dc)

    const grid = new THREE.GridHelper(240, 48, 0xc9c0ad, 0xdcd5c5)
    grid.rotation.x = Math.PI / 2 // GridHelper is XZ by default; we want XY
    scene.add(grid)

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9cfba, 1.5))
    const key = new THREE.DirectionalLight(0xffffff, 2.4)
    key.position.set(-40, -50, 80)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xfff1e0, 1.1)
    fill.position.set(60, 30, 25)
    scene.add(fill)

    scene.add(clipGroup, ghostGroup)

    ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 3000)
    ortho.up.set(0, 0, 1)

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    controls = new OrbitControls(ortho, canvas)
    controls.minZoom = 0.25
    controls.maxZoom = 8
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxPolarAngle = Math.PI * 0.62

    observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    if (latest) apply(latest)
    loop()
  }

  function loop() {
    raf = requestAnimationFrame(loop)
    controls?.update()
    if (renderer && scene) renderer.render(scene, ortho!)
  }

  function resize() {
    const canvas = canvasRef.value
    if (!canvas || !renderer || !ortho) return
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    sizeOrtho(w / h)
  }

  function sizeOrtho(aspect: number) {
    if (!ortho) return
    ortho.left = -orthoHalf * aspect
    ortho.right = orthoHalf * aspect
    ortho.top = orthoHalf
    ortho.bottom = -orthoHalf
    ortho.updateProjectionMatrix()
  }

  function clear(group: THREE.Group) {
    for (const child of [...group.children]) {
      group.remove(child)
      const obj = child as THREE.Mesh
      obj.geometry?.dispose()
    }
  }

  function apply(r: ClipResult) {
    clear(clipGroup)
    clear(ghostGroup)

    // the solid is shared-vertex triangles; give it normals that stay sharp at corners and smooth on curves
    clipGroup.add(new THREE.Mesh(toCreasedNormals(r.geometry, 0.6), clipMat))

    ghostGroup.add(new THREE.Mesh(r.ghostMount, mountMat))
    for (const g of r.ghostCables) ghostGroup.add(new THREE.Mesh(g, cableMat))

    if (!fitted) {
      fitted = true
      fit()
    }
  }

  function setResult(r: ClipResult) {
    latest = r
    if (scene) apply(r)
  }

  function setShowFit(v: boolean) {
    ghostGroup.visible = v
  }

  function fit() {
    if (!latest || !ortho || !controls) return
    latest.geometry.computeBoundingBox()
    const box = latest.geometry.boundingBox!
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    controls.target.copy(center)
    // true isometric: the camera looks along (-1, 1, -1), so all three axes foreshorten equally
    const d = 400
    ortho.position.set(center.x + d, center.y - d, center.z + d)
    ortho.zoom = 1
    orthoHalf = Math.max(size.length(), 24) * 0.62
    const el = canvasRef.value
    sizeOrtho(el && el.clientHeight ? el.clientWidth / el.clientHeight : 1)
    ortho.lookAt(center)
    ortho.updateProjectionMatrix()
    controls.update()
  }

  onMounted(init)

  onBeforeUnmount(() => {
    cancelAnimationFrame(raf)
    observer?.disconnect()
    controls?.dispose()
    clear(clipGroup)
    clear(ghostGroup)
    ;[clipMat, mountMat, cableMat].forEach((m) => m.dispose())
    renderer?.dispose()
  })

  return { setResult, setShowFit, fit }
}
