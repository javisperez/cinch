<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { buildClip, type ClipResult } from './clip/buildClip'
import { downloadStl } from './clip/exportStl'
import { buildFitTest, canFitTest } from './clip/fitTest'
import { cableLabel } from './clip/cable'
import { DEFAULTS, fmt, mechanismsFor, sizeLabel, type ClipParams } from './clip/types'
import { APP_NAME } from './config'
import {
  buildShareLink, clipLabel, cloneClips, consumeShareLink, copyName, exportAllProjectsFile, exportProjectFile, findProject, loadCurrentName, loadProjects,
  loadWorkspace, parseProjectImport, persistProjects, sameClips, saveCurrentName, saveWorkspace, slugify, upsertProject, type ClipEntry,
} from './projects'
import CableStep from './components/CableStep.vue'
import ClipTabs from './components/ClipTabs.vue'
import ClipViewer from './components/ClipViewer.vue'
import HoldStep from './components/HoldStep.vue'
import MountStep from './components/MountStep.vue'
import ProjectMenu from './components/ProjectMenu.vue'
import SupportButton from './components/SupportButton.vue'

// a share link (#p=…) opens with that project; otherwise the work picks up where it was left
const shared = consumeShareLink()
const start = shared ? { clips: shared.clips, active: 0 } : loadWorkspace()
// the project's clips, and the one being edited: `params` is that clip's settings, which every step edits directly
const clips = ref<ClipEntry[]>(start.clips)
const active = ref(start.active)
const params = reactive<ClipParams>({ ...clips.value[active.value].params })
const result = shallowRef<ClipResult | null>(null)
const error = ref('')
const step = ref(0)
const fitTest = ref(false)
const viewer = ref<InstanceType<typeof ClipViewer> | null>(null)
const tabs = ref<InstanceType<typeof ClipTabs> | null>(null)
const showingStrip = computed(() => fitTest.value && canFitTest(params))

// ── projects ─────────────────────────────────────────────────────────────────
const projectName = ref(shared ? shared.name : loadCurrentName())
const projects = ref(loadProjects())
const dirty = computed(() => {
  const saved = findProject(projects.value, projectName.value)
  return !saved || !sameClips(saved.clips, clips.value)
})
if (shared) {
  // a link replaces the work in progress, so keep it through a reload
  saveWorkspace({ clips: clips.value, active: active.value })
  saveCurrentName(projectName.value)
}
// edits go into the open clip, and everything is autosaved
watch(params, () => {
  clips.value[active.value] = { ...clips.value[active.value], params: { ...params } }
})
watch([clips, active], () => saveWorkspace({ clips: clips.value, active: active.value }), { deep: true })
watch(projectName, saveCurrentName)

function openClip(i: number) {
  active.value = i
  Object.assign(params, clips.value[i].params)
  fitTest.value = false
}
async function addClip() {
  // starts as a copy of the clip you are on: change only what differs (say, the diameter)
  clips.value.push({ name: '', params: { ...params } })
  active.value = clips.value.length - 1
  // and asks what to call it, so the tabs say what is what from the start (leave it empty to go by size)
  await nextTick()
  tabs.value?.startRename(active.value, '')
}
function removeClip(i: number) {
  if (clips.value.length < 2 || !confirm(`Remove "${clipLabel(clips.value[i])}" from this project?`)) return
  clips.value.splice(i, 1)
  openClip(Math.min(active.value, clips.value.length - 1))
}
function renameClip(i: number, name: string) {
  clips.value[i] = { ...clips.value[i], name }
}

function loadInto(name: string, list: ClipEntry[]) {
  clips.value = cloneClips(list)
  projectName.value = name
  step.value = 0
  openClip(0)
}
function saveProject(name: string) {
  const exists = findProject(projects.value, name)
  if (exists && exists.name.toLowerCase() !== projectName.value.trim().toLowerCase() && !confirm(`Replace the saved project "${exists.name}"?`)) return
  const final = exists?.name ?? name
  projects.value = upsertProject(projects.value, final, clips.value)
  persistProjects(projects.value)
  projectName.value = final
}
function openProject(name: string) {
  const p = findProject(projects.value, name)
  if (!p) return
  if (dirty.value && projectName.value && !confirm(`"${projectName.value}" has changes you have not saved. Open "${p.name}" anyway?`)) return
  loadInto(p.name, p.clips)
}
function removeProject(name: string) {
  if (!confirm(`Delete the project "${name}"?`)) return
  projects.value = projects.value.filter((p) => p.name !== name)
  persistProjects(projects.value)
}
function duplicateProject(name: string) {
  const p = findProject(projects.value, name)
  if (!p) return
  projects.value = upsertProject(projects.value, copyName(projects.value, p.name), p.clips)
  persistProjects(projects.value)
}
function newProject() {
  if (dirty.value && !confirm('Start over from the defaults? Anything you have not saved is lost.')) return
  loadInto('', [{ name: '', params: { ...DEFAULTS } }])
}
function copyLink() {
  navigator.clipboard?.writeText(buildShareLink(projectName.value.trim(), clips.value)).catch(() => {})
}
async function importFile(file: File) {
  try {
    const data = parseProjectImport(await file.text())
    if (data.kind === 'library') {
      for (const p of data.projects) projects.value = upsertProject(projects.value, p.name, p.clips)
      persistProjects(projects.value)
      alert(`Added ${data.projects.length} project${data.projects.length === 1 ? '' : 's'} to your list.`)
    } else {
      loadInto(data.name, data.clips)
    }
  } catch {
    alert('That file does not look like a Cinch project.')
  }
}

// ── rebuild the model whenever a parameter changes (debounced; CSG is not free) ──
let timer = 0
function rebuild() {
  try {
    result.value = showingStrip.value ? buildFitTest({ ...params }) : buildClip({ ...params })
    error.value = ''
  } catch (e) {
    console.error(e)
    error.value = 'These settings could not be turned into a clip. Try a larger size or thinner walls.'
  }
}
watch(params, () => {
  window.clearTimeout(timer)
  timer = window.setTimeout(rebuild, 80)
})
// a flat base has nothing to test the fit of, so leave strip mode when it is picked
watch(
  () => params.shape,
  (s) => {
    if (s === 'flat') fitTest.value = false
  },
)

// switching between the clip and the fit-test strip rebuilds at once and re-frames the camera
watch(showingStrip, async () => {
  window.clearTimeout(timer)
  rebuild()
  await nextTick()
  viewer.value?.fit()
})
onMounted(rebuild)
onBeforeUnmount(() => window.clearTimeout(timer))

// ── wizard ───────────────────────────────────────────────────────────────────
const mechanismLabel = computed(() => {
  const list = mechanismsFor(params.shape)
  return (list.find((m) => m.value === params.mechanism) ?? list[0]).label
})
const steps = computed(() => [
  { title: 'Mount', summary: sizeLabel(params).replace('mm ', 'mm · ') },
  { title: 'Cable', summary: `${params.cableCount} × ${cableLabel(params, fmt)}` },
  { title: 'Hold', summary: `${mechanismLabel.value}` },
])
const lastStep = computed(() => step.value === steps.value.length - 1)

const tip = computed(() => {
  if (params.mechanism === 'channel' || params.mechanism === 'slide') return 'Print it standing on its end, as shown, with a brim and no supports. PETG or PLA both work: the walls are thick and stiff.'
  if (params.mechanism === 'bridge') return 'Print it standing on its end, as shown, with a brim and no supports: the layers then run around the arch, which makes it flex without splitting. PETG works best.'
  if (params.shape === 'flat') return 'Print it as shown: plate flat on the bed, no supports needed.'
  if (params.mechanism === 'strap') return 'Print it as shown, no supports: the strap tunnels are short bridges. PETG or PLA both work.'
  if (params.mechanism === 'clamp') return 'Print it standing, ring flat on the bed, in PETG with 4+ perimeters so the ears stay strong.'
  return 'Print it standing, ring flat on the bed, in PETG with 3+ perimeters. No supports needed.'
})

/** "<project>_<clip>_cinch-round25-cable6x1-snap.stl": the settings are in the name, and so is whatever you called the project and clip. */
function stlName(c: ClipEntry, strip = false): string {
  const p = c.params
  const shape = p.shape === 'rect' ? `${fmt(p.size)}x${fmt(p.size2)}` : fmt(p.size)
  const base = strip
    ? `cinch-fit-test-${p.shape}${shape}`
    : `cinch-${p.shape}${shape}-cable${p.cableShape === 'flat' ? `flat${fmt(p.cableWidth)}x${fmt(p.cableThickness)}` : fmt(p.cableDiameter)}x${p.cableCount}-${p.mechanism}`
  return [slugify(projectName.value), slugify(c.name), base].filter(Boolean).join('_') + '.stl'
}

function download() {
  if (!result.value) return
  downloadStl(result.value.geometry, stlName(clips.value[active.value], showingStrip.value))
}

// every clip in the project, one STL each
const downloadingAll = ref(false)
async function downloadAll() {
  downloadingAll.value = true
  try {
    const used = new Set<string>()
    for (const c of clips.value) {
      let name = stlName(c)
      for (let n = 2; used.has(name); n++) name = stlName(c).replace(/\.stl$/, `-${n}.stl`)
      used.add(name)
      downloadStl(buildClip({ ...c.params }).geometry, name)
      await new Promise((r) => setTimeout(r, 250)) // browsers drop downloads that come in a burst
    }
  } catch (e) {
    console.error(e)
    alert('One of the clips could not be built, so not everything was downloaded.')
  } finally {
    downloadingAll.value = false
  }
}
</script>

<template>
  <div class="flex h-dvh flex-col">
    <header class="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-card px-3 py-2.5 sm:gap-3 sm:px-6">
      <div class="flex items-center gap-3">
        <svg viewBox="0 0 32 32" class="h-8 w-8" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
          <path d="M21.5 9.5A8 8 0 1 0 21.5 22.5" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" />
        </svg>
        <div class="leading-tight">
          <h1 class="font-display text-xl font-extrabold tracking-tight">{{ APP_NAME }}</h1>
          <p class="hidden text-xs text-ink-3 sm:block">Cable clips for 3D printing, sized to your pole and your cable</p>
        </div>
      </div>
      <div class="flex items-center gap-2 sm:gap-2.5">
        <ProjectMenu
          :name="projectName"
          :projects="projects"
          :dirty="dirty"
          :clip-count="clips.length"
          @save="saveProject"
          @open="openProject"
          @remove="removeProject"
          @duplicate="duplicateProject"
          @create="newProject"
          @export-one="exportProjectFile(projectName.trim() || 'cinch-project', clips)"
          @export-all="exportAllProjectsFile(projects)"
          :downloading="downloadingAll"
          @download-all="downloadAll"
          @share="copyLink"
          @import="importFile"
        />
        <SupportButton />
        <button
          type="button"
          class="whitespace-nowrap rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-white shadow-[0_2px_0_var(--color-accent-hover)] transition-all hover:bg-accent-hover active:translate-y-px disabled:opacity-50"
          aria-label="Download STL"
          :disabled="!result"
          @click="download"
        >
          <span class="sm:hidden">STL ↓</span>
          <span class="hidden sm:inline">Download STL</span>
        </button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
    <main class="relative min-h-[260px] flex-1 lg:min-h-0">
      <ClipViewer ref="viewer" :result="result" />
      <div v-if="canFitTest(params)" class="absolute bottom-3 right-3 flex items-center gap-2">
        <span
          v-if="showingStrip"
          class="rounded-md bg-ink px-2.5 py-1 text-xs font-semibold text-card shadow-sm"
        >
          Fit-test strip
        </span>
        <button
          type="button"
          :aria-pressed="showingStrip"
          class="rounded-full border-2 px-3.5 py-1 text-xs font-bold shadow-sm transition-colors"
          :class="showingStrip ? 'border-accent bg-accent text-white hover:bg-accent-hover' : 'border-ink bg-card text-ink hover:bg-ink hover:text-card'"
          @click="fitTest = !fitTest"
        >
          {{ showingStrip ? '← Back to my clip' : 'Print a fit test first' }}
        </button>
      </div>
      <p
        v-if="error"
        role="alert"
        class="absolute inset-x-3 bottom-3 rounded-lg bg-warn-bg px-3 py-2 text-sm font-medium text-warn-ink ring-1 ring-warn-ink/20"
      >
        {{ error }}
      </p>
    </main>

    <!-- below the preview on a phone; a full-height column beside it on a wide screen -->
    <aside class="flex shrink-0 flex-col lg:min-h-0 lg:w-[27rem] lg:border-l lg:border-line xl:w-[30rem]">
    <ClipTabs
      ref="tabs"
      :clips="clips"
      :active="active"
      @select="openClip"
      @add="addClip"
      @remove="removeClip"
      @rename="renameClip"
    />

    <section class="flex shrink-0 flex-col bg-card lg:min-h-0 lg:flex-1" aria-label="Clip settings">
      <nav class="flex border-b border-line-2" role="tablist" aria-label="Steps">
        <button
          v-for="(s, i) in steps"
          :key="s.title"
          type="button"
          role="tab"
          :aria-selected="step === i"
          class="relative flex min-w-0 flex-1 items-center gap-2.5 px-4 py-2.5 text-left transition-colors sm:px-6 lg:gap-2 lg:px-3"
          :class="step === i ? 'bg-card' : 'bg-paper/60 hover:bg-paper'"
          @click="step = i"
        >
          <span
            class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold"
            :class="step === i ? 'bg-accent text-white' : i < step ? 'bg-ink text-card' : 'bg-line text-ink-2'"
          >{{ i + 1 }}</span>
          <span class="min-w-0 leading-tight">
            <span class="block font-display text-sm font-bold" :class="step === i ? 'text-ink' : 'text-ink-2'">{{ s.title }}</span>
            <span class="block truncate text-xs text-ink-3">{{ s.summary }}</span>
          </span>
          <span v-if="step === i" class="absolute inset-x-0 -bottom-px h-0.5 bg-accent"></span>
        </button>
      </nav>

      <div class="@container max-h-[36vh] overflow-y-auto px-4 py-4 sm:px-6 lg:max-h-none lg:min-h-0 lg:flex-1 lg:px-5">
        <MountStep v-if="step === 0" :params="params" />
        <CableStep v-else-if="step === 1" :params="params" />
        <HoldStep v-else :params="params" />

        <ul v-if="result?.warnings.length || result?.notes.length" class="mt-4 space-y-1.5" aria-label="Warnings and notes">
          <li
            v-for="w in result.warnings"
            :key="w"
            class="rounded-lg bg-warn-bg px-3 py-1.5 text-xs font-medium leading-snug text-warn-ink"
          >
            {{ w }}
          </li>
          <li
            v-for="n in result.notes"
            :key="n"
            class="rounded-lg bg-paper px-3 py-1.5 text-xs font-medium leading-snug text-ink-2"
          >
            {{ n }}
          </li>
        </ul>
        <p v-if="lastStep" class="mt-4 hidden text-xs leading-snug text-ink-3 lg:block">
          {{ showingStrip ? 'Print the strip, try each ring on your mount, then set Mount fit to the best one.' : tip }}
        </p>
      </div>

      <footer class="flex shrink-0 items-center justify-between gap-3 border-t border-line-2 px-4 py-2.5 sm:px-6 lg:px-5">
        <button
          type="button"
          class="rounded-full px-4 py-1.5 text-sm font-semibold text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:invisible"
          :disabled="step === 0"
          @click="step--"
        >
          ← Back
        </button>
        <p v-if="lastStep" class="hidden min-w-0 flex-1 text-center text-xs text-ink-3 md:block lg:hidden">
          {{ showingStrip ? 'Print the strip, try each ring on your mount, then set Mount fit to the best one.' : tip }}
        </p>
        <button
          v-if="!lastStep"
          type="button"
          class="rounded-full bg-ink px-5 py-1.5 text-sm font-bold text-card transition-colors hover:bg-ink-2"
          @click="step++"
        >
          Next: {{ steps[step + 1].title }} →
        </button>
        <div v-else class="flex items-center gap-2">
        <button
          v-if="clips.length > 1"
          type="button"
          class="rounded-full px-3 py-1.5 text-sm font-semibold text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-50"
          :disabled="downloadingAll"
          @click="downloadAll"
        >
          {{ downloadingAll ? 'Preparing…' : `All ${clips.length} clips` }}
        </button>
        <button
          type="button"
          class="rounded-full bg-accent px-5 py-1.5 text-sm font-bold text-white shadow-[0_2px_0_var(--color-accent-hover)] transition-all hover:bg-accent-hover active:translate-y-px disabled:opacity-50"
          :disabled="!result"
          @click="download"
        >
          {{ showingStrip ? 'Download fit test' : 'Download STL' }}
        </button>
        </div>
      </footer>
    </section>
    </aside>
    </div>
  </div>
</template>
