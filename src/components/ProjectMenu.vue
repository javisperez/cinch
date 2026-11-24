<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { projectSummary, type SavedProject } from '../projects'

const props = defineProps<{
  /** the project being edited ('' = not named yet) */
  name: string
  projects: SavedProject[]
  /** the work differs from what is saved under this name (or has not been saved) */
  dirty: boolean
  /** how many clips are open, and whether Download all is running */
  clipCount: number
  downloading: boolean
}>()
const emit = defineEmits<{
  save: [name: string]
  open: [name: string]
  remove: [name: string]
  duplicate: [name: string]
  create: []
  exportOne: []
  exportAll: []
  share: []
  downloadAll: []
  import: [file: File]
}>()

const open = ref(false)
const draft = ref('')
const root = ref<HTMLElement | null>(null)
const nameInput = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const copied = ref(false)
let copiedTimer = 0

watch(open, async (o) => {
  if (!o) return
  draft.value = props.name
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
})

function onDocClick(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
document.addEventListener('mousedown', onDocClick)
document.addEventListener('keydown', onKey)
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick)
  document.removeEventListener('keydown', onKey)
  window.clearTimeout(copiedTimer)
})

function save() {
  const n = draft.value.trim()
  if (n) emit('save', n)
}
function pickFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (f) emit('import', f)
  input.value = ''
  open.value = false
}
function share() {
  emit('share')
  copied.value = true
  window.clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => (copied.value = false), 1800)
}
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const item = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent'
</script>

<template>
  <div ref="root" class="sm:relative">
    <button
      type="button"
      class="flex max-w-[7.5rem] items-center gap-2 rounded-full border-2 border-line bg-card px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:border-ink-3 sm:max-w-[16rem] sm:px-3"
      :class="open ? 'border-ink-3' : ''"
      aria-haspopup="dialog"
      :aria-expanded="open"
      title="Save and open your projects"
      @click="open = !open"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
      <span class="truncate" :class="name ? '' : 'font-semibold text-ink-3'">{{ name || 'Projects' }}</span>
      <span v-if="name && dirty" class="h-2 w-2 shrink-0 rounded-full bg-accent" title="Changes not saved yet"></span>
    </button>

    <div
      v-if="open"
      role="dialog"
      aria-label="Projects"
      class="fixed inset-x-4 top-[3.75rem] z-30 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem] rounded-2xl border border-line bg-card p-3 shadow-[0_12px_30px_-8px_rgb(0_0_0/.25)]"
    >
      <form class="flex gap-2" @submit.prevent="save">
        <input
          ref="nameInput"
          v-model="draft"
          type="text"
          maxlength="60"
          placeholder="Name this project, e.g. Garage pole"
          aria-label="Project name"
          class="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          class="rounded-lg bg-accent px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
          :disabled="!draft.trim()"
        >
          Save
        </button>
      </form>
      <p class="mt-1.5 px-0.5 text-xs leading-snug text-ink-3">
        Your work is kept in this browser as you go. Saving gives it a name you can come back to.
      </p>

      <ul v-if="projects.length" class="mt-2.5 max-h-60 space-y-1 overflow-y-auto border-t border-line-2 pt-2.5" aria-label="Saved projects">
        <li
          v-for="p in projects"
          :key="p.name"
          class="group flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-paper"
          :class="p.name.toLowerCase() === name.toLowerCase() ? 'bg-accent-soft/60' : ''"
        >
          <button type="button" class="min-w-0 flex-1 px-2.5 py-1.5 text-left" @click="emit('open', p.name); open = false">
            <span class="flex items-baseline justify-between gap-2">
              <span class="truncate text-sm font-bold">{{ p.name }}</span>
              <span class="shrink-0 text-[11px] text-ink-3">{{ when(p.savedAt) }}</span>
            </span>
            <span class="block truncate text-xs text-ink-3">{{ projectSummary(p.clips) }}</span>
          </button>
          <button
            type="button"
            class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-line-2 hover:text-ink"
            :aria-label="`Duplicate ${p.name}`"
            title="Duplicate"
            @click="emit('duplicate', p.name)"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" />
            </svg>
          </button>
          <button
            type="button"
            class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-warn-bg hover:text-warn-ink"
            :aria-label="`Delete ${p.name}`"
            title="Delete"
            @click="emit('remove', p.name)"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
            </svg>
          </button>
        </li>
      </ul>
      <p v-else class="mt-2.5 border-t border-line-2 pt-2.5 text-xs text-ink-3">No saved projects yet.</p>

      <div class="mt-2.5 space-y-0.5 border-t border-line-2 pt-2">
        <button v-if="clipCount > 1" type="button" :class="item" :disabled="downloading" @click="emit('downloadAll'); open = false">
          {{ downloading ? 'Preparing the STLs…' : `Download all ${clipCount} clips (one STL each)` }}
        </button>
        <button type="button" :class="item" @click="emit('create'); open = false">New project (start from the defaults)</button>
        <button type="button" :class="item" @click="share">{{ copied ? 'Link copied ✓' : 'Copy a link to this project' }}</button>
        <button type="button" :class="item" @click="emit('exportOne'); open = false">Export this project as a file</button>
        <button type="button" :class="item" :disabled="!projects.length" @click="emit('exportAll'); open = false">
          Back up all projects ({{ projects.length }})
        </button>
        <button type="button" :class="item" @click="fileInput?.click()">Import a file…</button>
        <input ref="fileInput" type="file" accept=".json,application/json" class="hidden" @change="pickFile" />
      </div>
    </div>
  </div>
</template>
