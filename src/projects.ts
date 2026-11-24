// Saved projects: everything you chose for a clip, kept in this browser (localStorage), so you
// never have to remember a measurement. The work in progress is autosaved; named projects are
// saved on purpose. Files and share links carry the same data, to move it to another machine.
import { cableLabel } from './clip/cable'
import { DEFAULTS, SHAPES, fmt, mechanismsFor, sizeLabel, validMechanism, type ClipParams } from './clip/types'

/** One clip in a project: its own settings, and a name if you gave it one (like "17.5 mm end"). */
export interface ClipEntry {
  name: string
  params: ClipParams
}

export interface SavedProject {
  name: string
  savedAt: string // ISO date
  /** a project holds one or more clips, e.g. the two ends of a pole with different widths */
  clips: ClipEntry[]
}

const CURRENT_KEY = 'cinch-current'
const CURRENT_NAME_KEY = 'cinch-current-name'
const PROJECTS_KEY = 'cinch-projects'
const FILE_APP = 'cinch'

/** A file-name-safe version of a project name. */
export function slugify(name: string): string {
  return name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '')
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Anything that looks like params, made safe: a value is kept only when it has the type of
 * the default, and the choices are checked against the lists. Older saves that miss newer
 * settings simply get their defaults.
 */
export function normalizeParams(raw: unknown): ClipParams {
  const src = isObject(raw) ? raw : {}
  const out: Record<string, unknown> = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS) as (keyof ClipParams)[]) {
    const v = src[key]
    const d = DEFAULTS[key]
    if (typeof v === typeof d && (typeof v !== 'number' || Number.isFinite(v))) out[key] = v
  }
  const p = out as unknown as ClipParams
  const oneOf = <T extends string>(v: T, list: readonly string[], fallback: T): T => (list.includes(v) ? v : fallback)
  p.shape = oneOf(p.shape, SHAPES.map((s) => s.value), DEFAULTS.shape)
  p.mechanism = validMechanism(p.shape, oneOf(p.mechanism, ['snap', 'clamp', 'strap', 'base', 'bridge', 'channel', 'slide'], DEFAULTS.mechanism))
  p.rectFace = oneOf(p.rectFace, ['long', 'short'], DEFAULTS.rectFace)
  p.cableShape = oneOf(p.cableShape, ['round', 'flat'], DEFAULTS.cableShape)
  p.cableFacing = oneOf(p.cableFacing, ['outward', 'same', 'opposite'], DEFAULTS.cableFacing)
  p.holder = oneOf(p.holder, ['rings', 'pocket', 'slide', 'square', 'latch'], DEFAULTS.holder)
  p.bolt = oneOf(p.bolt, ['M3', 'M4'], DEFAULTS.bolt)
  p.fixing = oneOf(p.fixing, ['adhesive', 'screws'], DEFAULTS.fixing)
  p.strapCount = p.strapCount === 2 ? 2 : 1
  p.cableCount = Math.min(Math.max(Math.round(p.cableCount), 1), 4)
  return p
}

export function sameParams(a: ClipParams, b: ClipParams): boolean {
  return (Object.keys(DEFAULTS) as (keyof ClipParams)[]).every((k) => a[k] === b[k])
}

export function sameClips(a: ClipEntry[], b: ClipEntry[]): boolean {
  return a.length === b.length && a.every((c, i) => c.name === b[i].name && sameParams(c.params, b[i].params))
}

export const cloneClips = (clips: ClipEntry[]): ClipEntry[] => clips.map((c) => ({ name: c.name, params: { ...c.params } }))

/** What a clip's tab says when it has no name of its own: "Ø17.5 mm". */
export const clipLabel = (c: ClipEntry): string => c.name.trim() || sizeLabel(c.params)

/** One line to recognise a project by: "Ø25 mm · 2 × Ethernet 6 mm · Snap-on grip", or the list of its clips. */
export function projectSummary(clips: ClipEntry[]): string {
  if (clips.length > 1) return `${clips.length} clips · ${clips.map(clipLabel).join(', ')}`
  const p = clips[0].params
  const mech = (mechanismsFor(p.shape).find((m) => m.value === p.mechanism) ?? mechanismsFor(p.shape)[0]).label
  return `${sizeLabel(p)} · ${p.cableCount} × ${cableLabel(p, fmt)} · ${mech}`
}

/** Clips out of anything we have saved: a list of clips, or (older saves) a lone params object. */
function readClips(data: Record<string, unknown>): ClipEntry[] | null {
  if (Array.isArray(data.clips)) {
    const clips = data.clips
      .filter((c): c is Record<string, unknown> => isObject(c) && isObject(c.params))
      .map((c) => ({ name: typeof c.name === 'string' ? c.name.trim() : '', params: normalizeParams(c.params) }))
    return clips.length ? clips : null
  }
  if (isObject(data.params)) return [{ name: '', params: normalizeParams(data.params) }]
  return null
}

// ── work in progress (autosaved) ─────────────────────────────────────────────

export interface Workspace {
  clips: ClipEntry[]
  /** which clip is open */
  active: number
}

export function loadWorkspace(): Workspace {
  try {
    const saved = localStorage.getItem(CURRENT_KEY)
    if (saved) {
      const data: unknown = JSON.parse(saved)
      if (isObject(data)) {
        // older versions kept one bare params object here
        const clips = readClips(data) ?? readClips({ params: data })
        if (clips) return { clips, active: Math.min(Math.max(Math.round(Number(data.active)) || 0, 0), clips.length - 1) }
      }
    }
  } catch {
    /* private window or blocked storage: start fresh */
  }
  return { clips: [{ name: '', params: { ...DEFAULTS } }], active: 0 }
}

export function saveWorkspace(w: Workspace): void {
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify(w))
  } catch {
    /* ignore */
  }
}

export function loadCurrentName(): string {
  try {
    return localStorage.getItem(CURRENT_NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveCurrentName(name: string): void {
  try {
    localStorage.setItem(CURRENT_NAME_KEY, name)
  } catch {
    /* ignore */
  }
}

// ── named projects ───────────────────────────────────────────────────────────

function cleanList(list: unknown): SavedProject[] {
  if (!Array.isArray(list)) return []
  const out: SavedProject[] = []
  for (const p of list) {
    if (!isObject(p) || typeof p.name !== 'string' || !p.name.trim()) continue
    const clips = readClips(p)
    if (clips) out.push({ name: p.name.trim(), savedAt: typeof p.savedAt === 'string' ? p.savedAt : new Date().toISOString(), clips })
  }
  return out
}

export function loadProjects(): SavedProject[] {
  try {
    const saved = localStorage.getItem(PROJECTS_KEY)
    if (saved) return cleanList(JSON.parse(saved))
  } catch {
    /* ignore */
  }
  return []
}

export function persistProjects(projects: SavedProject[]): void {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
  } catch {
    /* ignore */
  }
}

/** Insert or overwrite (names match regardless of case), most recently saved first. */
export function upsertProject(projects: SavedProject[], name: string, clips: ClipEntry[]): SavedProject[] {
  const next = projects.filter((p) => p.name.toLowerCase() !== name.toLowerCase())
  next.push({ name, savedAt: new Date().toISOString(), clips: cloneClips(clips) })
  next.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  return next
}

export function findProject(projects: SavedProject[], name: string): SavedProject | undefined {
  return projects.find((p) => p.name.toLowerCase() === name.trim().toLowerCase())
}

/** "Garage pole copy", "Garage pole copy 2", … the first name not taken. */
export function copyName(projects: SavedProject[], name: string): string {
  const taken = new Set(projects.map((p) => p.name.toLowerCase()))
  let candidate = `${name} copy`
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = `${name} copy ${i}`
  return candidate
}

// ── files ────────────────────────────────────────────────────────────────────

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportProjectFile(name: string, clips: ClipEntry[]): void {
  downloadJson({ app: FILE_APP, version: 2, name, exportedAt: new Date().toISOString(), clips }, `${slugify(name) || 'cinch-project'}.json`)
}

/** The whole library in one file: a backup, or a way to move everything to another computer. */
export function exportAllProjectsFile(projects: SavedProject[]): void {
  downloadJson(
    { app: FILE_APP, version: 2, kind: 'project-library', exportedAt: new Date().toISOString(), projects },
    `cinch-projects-${new Date().toISOString().slice(0, 10)}.json`,
  )
}

export type ProjectImport = { kind: 'single'; name: string; clips: ClipEntry[] } | { kind: 'library'; projects: SavedProject[] }

/** Reads a project file, a library backup, or a bare params object. Throws when it is none of those. */
export function parseProjectImport(text: string): ProjectImport {
  const data: unknown = JSON.parse(text)
  if (!isObject(data)) throw new Error('Not a project file')
  if (Array.isArray(data.projects)) {
    const projects = cleanList(data.projects)
    if (!projects.length) throw new Error('The file has no projects')
    return { kind: 'library', projects }
  }
  const clips = readClips(data) ?? (typeof data.shape === 'string' && typeof data.mechanism === 'string' ? readClips({ params: data }) : null)
  if (!clips) throw new Error('Not a Cinch project')
  return { kind: 'single', name: typeof data.name === 'string' ? data.name : '', clips }
}

// ── share links ──────────────────────────────────────────────────────────────
// The project goes into the URL fragment (#p=…). A fragment never leaves the browser, so a link
// is as private as a file: just something to send to yourself or a friend.

export function buildShareLink(name: string, clips: ClipEntry[]): string {
  const payload = JSON.stringify({ v: 2, name, clips })
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(payload)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `${location.origin}${location.pathname}#p=${b64}`
}

/** Reads the project from a share link on load, and clears the fragment so a reload does not redo it. */
export function consumeShareLink(): { name: string; clips: ClipEntry[] } | null {
  const m = /^#p=([A-Za-z0-9_-]+)$/.exec(location.hash)
  if (!m) return null
  history.replaceState(null, '', location.pathname + location.search)
  try {
    const bytes = Uint8Array.from(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!isObject(data)) return null
    const clips = readClips(data)
    return clips ? { name: typeof data.name === 'string' ? data.name : '', clips } : null
  } catch {
    return null
  }
}
