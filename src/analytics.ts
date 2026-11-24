import { createTracker } from 'pages-analytics/track'

// What gets counted, and nothing more. Values are coarse kinds and counts: never project or clip
// names, sizes, file contents or links. Everything is a no-op unless the deploy added the
// analytics snippet (dev, forks and local builds have none).
export interface AnalyticsEvents {
  app_opened: { source: 'direct' | 'share_link' }
  stl_exported: {
    shape: string
    mechanism: string
    holder: string
    cable_shape: string
    scope: 'clip' | 'all'
    fit_test: boolean
  }
  clip_added: undefined
  project_saved: undefined
  project_opened: undefined
  project_duplicated: undefined
  project_deleted: undefined
  project_created: undefined
  project_file_exported: { scope: 'project' | 'library' }
  project_file_imported: { kind: 'project' | 'library' | 'invalid' }
  share_link_copied: undefined
  feature_changed: { feature: string; value: string }
}

export const track = createTracker<AnalyticsEvents>()

// The discrete choices that say what kind of clip someone is making (sliders are left out: they fire continuously).
export const FEATURES = ['shape', 'mechanism', 'holder', 'cableShape', 'cableFacing', 'rectFace', 'bolt', 'fixing'] as const

// ── consent ──────────────────────────────────────────────────────────────────
// The build adds Google Analytics in consent mode: it collects nothing until the visitor accepts,
// and the choice is remembered in localStorage. The banner reports the choice through these.
export { getConsent, setConsent } from 'pages-analytics/track'
export const CONSENT_EVENT = 'analytics-consent-reopen'

/** True only when the deploy added the analytics snippet. */
export const analyticsPresent = (): boolean => !!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')
