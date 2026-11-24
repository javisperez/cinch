// Shared types, defaults and presets for the clip generator.

export type MountShape = 'round' | 'square' | 'rect' | 'triangle' | 'panel' | 'flat'
export type Mechanism = 'snap' | 'clamp' | 'strap' | 'base' | 'bridge' | 'channel' | 'slide'
export type CableShape = 'round' | 'flat'
export type RectFace = 'long' | 'short'
/** outward: ring mouth faces away from the mount (poles) · same / opposite: same or opposite way as the mount's mouth */
export type CableFacing = 'outward' | 'same' | 'opposite'
/** how the cables are held on a pole clip: a ring each around the mount, a pocket in the clip's own wall, one big square slot for the group, or a closed loop with a curled hook */
export type CableHolder = 'rings' | 'pocket' | 'slide' | 'square' | 'latch'
export type BoltSize = 'M3' | 'M4'
export type Fixing = 'adhesive' | 'screws'

export interface ClipParams {
  // ── Step 1: what the clip attaches to ──────────────────────────────────────
  shape: MountShape
  /** round: diameter · square/triangle: side · rect: first side · panel: panel thickness · flat: plate size */
  size: number
  /** rect: second side · panel: how deep the jaws grip */
  size2: number
  /** rect only: which face of the rail the cable sits on */
  rectFace: RectFace
  /** corner radius of the real mount (square / rect / triangle / panel) */
  cornerRadius: number

  // ── Step 2: what it holds ──────────────────────────────────────────────────
  /** round: a plain round cable · flat: a flat cord (like a TV power cord) that lies on its wide side */
  cableShape: CableShape
  cableDiameter: number
  /** flat cord: how wide it is, and how thick */
  cableWidth: number
  cableThickness: number
  cableCount: number

  // ── Step 3: how it holds ───────────────────────────────────────────────────
  mechanism: Mechanism
  /** height of the clip along the mount axis (= length along the cable for a flat base) */
  width: number
  wall: number
  /** extra room around the mount; negative = squeeze it (a tight grip) */
  mountClearance: number
  /** extra room around each cable */
  cableClearance: number
  /** snap: how wide the mouth is, % of the mount's width. 0 = closed ring */
  mountOpening: number
  /** snap / panel: length of the outward flare on the lips (mm). 0 = none */
  lipFlare: number
  /** do the cable slots open the same way as the mount, or the opposite way */
  cableFacing: CableFacing
  /** pole mounts: how the cables are held */
  holder: CableHolder
  /** pole mounts: where the cables go, degrees clockwise from the clip's mouth (90 = the right-hand side) */
  holderAngle: number
  /** how wide each cable slot is, % of the cable diameter */
  cableOpening: number

  // clamp
  bolt: BoltSize
  /** space left between the clamp's ears before tightening (mm) */
  clampGap: number

  // strap
  strapWidth: number
  strapThickness: number
  strapCount: 1 | 2

  // flat base
  baseThickness: number
  fixing: Fixing
}

export const DEFAULTS: ClipParams = {
  shape: 'round',
  size: 25,
  size2: 40,
  rectFace: 'long',
  cornerRadius: 1.5,

  cableShape: 'round',
  cableDiameter: 6,
  cableWidth: 5,
  cableThickness: 3.3,
  cableCount: 1,

  mechanism: 'snap',
  width: 12,
  wall: 2,
  mountClearance: -0.1,
  cableClearance: 0.15,
  mountOpening: 75,
  lipFlare: 3,
  cableFacing: 'outward',
  holder: 'rings',
  holderAngle: 90,
  cableOpening: 70,

  bolt: 'M3',
  clampGap: 2.5,

  strapWidth: 4.8,
  strapThickness: 1.4,
  strapCount: 1,

  baseThickness: 2.4,
  fixing: 'adhesive',
}

export interface Preset {
  label: string
  /** Partial patch applied to ClipParams */
  patch: Partial<ClipParams>
}

export const MOUNT_PRESETS: Record<MountShape, Preset[]> = {
  round: [16, 20, 25, 32, 40, 50].map((s) => ({ label: `${s}`, patch: { size: s } })),
  square: [
    { label: '2020 extrusion', patch: { size: 20, cornerRadius: 1.5 } },
    { label: '25', patch: { size: 25 } },
    { label: '30', patch: { size: 30 } },
    { label: '40', patch: { size: 40 } },
  ],
  rect: [
    { label: '2040 extrusion', patch: { size: 20, size2: 40, cornerRadius: 1.5 } },
    { label: '20 × 30', patch: { size: 20, size2: 30 } },
    { label: '25 × 50', patch: { size: 25, size2: 50 } },
    { label: '30 × 60', patch: { size: 30, size2: 60 } },
  ],
  triangle: [20, 30, 40].map((s) => ({ label: `${s}`, patch: { size: s } })),
  panel: [
    { label: '1.5 sheet metal', patch: { size: 1.5 } },
    { label: '2', patch: { size: 2 } },
    { label: '3', patch: { size: 3 } },
    { label: '4', patch: { size: 4 } },
    { label: '6', patch: { size: 6 } },
  ],
  flat: [18, 24, 30, 40].map((s) => ({ label: `${s}`, patch: { size: s } })),
}

/** What a freshly picked shape starts with. */
export const SHAPE_START: Record<MountShape, Partial<ClipParams>> = {
  round: { size: 25, cableFacing: 'outward' },
  square: { size: 20, cornerRadius: 1.5, cableFacing: 'outward' },
  rect: { size: 20, size2: 40, cornerRadius: 1.5, cableFacing: 'outward' },
  triangle: { size: 30, cornerRadius: 1.5, cableFacing: 'outward' },
  panel: { size: 3, size2: 15, cornerRadius: 0.5, mountClearance: -0.15, cableFacing: 'same' },
  flat: { size: 24, cableFacing: 'same' },
}

export const CABLE_PRESETS: { label: string; value: number }[] = [
  { label: 'Earbuds', value: 3 },
  { label: 'USB', value: 4.5 },
  { label: 'Ethernet', value: 6 },
  { label: 'HDMI', value: 7 },
  { label: 'Power cord', value: 10 },
]

/** Flat cords, which lie on their wide side. Sizes are typical, not exact: measure yours. */
export const FLAT_CABLE_PRESETS: { label: string; width: number; thickness: number }[] = [
  { label: 'Samsung TV flat cord', width: 5, thickness: 3.3 },
]

export const SHAPES: { value: MountShape; label: string; hint: string }[] = [
  { value: 'round', label: 'Round', hint: 'Pipes, poles, conduit' },
  { value: 'square', label: 'Square', hint: 'Tubes, 2020 extrusion' },
  { value: 'rect', label: 'Rectangle', hint: 'Rails, flat bar, 2040' },
  { value: 'triangle', label: 'Triangle', hint: 'Truss, wedge rails' },
  { value: 'panel', label: 'Panel edge', hint: 'Sheet, shelf, desk lip' },
  { value: 'flat', label: 'Flat surface', hint: 'Wall, desk, stick-on' },
]

export interface MechanismInfo {
  value: Mechanism
  label: string
  hint: string
}

export function mechanismsFor(shape: MountShape): MechanismInfo[] {
  if (shape === 'flat') {
    return [
      { value: 'base', label: 'Ring holders', hint: 'A flat plate with a snap-in ring for each cable. Use double-sided tape, glue or two screws.' },
      { value: 'slide', label: 'Slide-in hooks', hint: 'A curved band standing off the plate with a lip at its tip: push the cable in past the lip and it stays. Nothing hinged.' },
      { value: 'channel', label: 'Snap channel', hint: 'A sturdy open slot with thick walls: press the cables in past the lips. Nothing is hinged, so nothing to snap off.' },
      { value: 'bridge', label: 'Arch clip', hint: 'A stick-on plate with a hinged arch that clicks shut over the cables, like the clips sold in packs.' },
    ]
  }
  if (shape === 'panel') {
    return [{ value: 'snap', label: 'Spring jaws', hint: 'Two thin jaws pinch the panel edge. A slightly negative Mount fit makes them grip.' }]
  }
  return [
    { value: 'snap', label: 'Snap-on grip', hint: 'Springs open and wraps around the mount. Set Mount fit to Tight for a firm hold.' },
    { value: 'clamp', label: 'Bolt clamp', hint: 'A ring with two ears and a bolt. Tighten it as hard as you need; fits any pole.' },
    { value: 'strap', label: 'Strap-on', hint: 'Sits on the mount and is held by a zip tie or velcro strap.' },
  ]
}

export function validMechanism(shape: MountShape, current: Mechanism): Mechanism {
  const list = mechanismsFor(shape)
  return list.some((m) => m.value === current) ? current : list[0].value
}

export const GRIP_PRESETS: { label: string; value: number }[] = [
  { label: 'Loose', value: 0.3 },
  { label: 'Snug', value: 0.1 },
  { label: 'Tight', value: -0.1 },
  { label: 'Very tight', value: -0.25 },
]

export const BOLTS: Record<BoltSize, { hole: number; nutAcrossCorners: number; nutDepth: number; ear: number }> = {
  M3: { hole: 3.5, nutAcrossCorners: 6.8, nutDepth: 2.6, ear: 4 },
  M4: { hole: 4.6, nutAcrossCorners: 8.6, nutDepth: 3.4, ear: 5 },
}

export function sizeLabel(p: ClipParams): string {
  switch (p.shape) {
    case 'round': return `Ø${fmt(p.size)} mm`
    case 'square': return `${fmt(p.size)} mm square`
    case 'rect': return `${fmt(p.size)} × ${fmt(p.size2)} mm`
    case 'triangle': return `${fmt(p.size)} mm triangle`
    case 'panel': return `${fmt(p.size)} mm panel`
    case 'flat': return `${fmt(p.size)} mm plate`
  }
}

export function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}
