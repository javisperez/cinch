<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { sizeLabel } from '../clip/types'
import { clipLabel, type ClipEntry } from '../projects'

defineProps<{ clips: ClipEntry[]; active: number }>()
const emit = defineEmits<{
  select: [i: number]
  add: []
  remove: [i: number]
  rename: [i: number, name: string]
}>()

const editing = ref(-1)
const draft = ref('')
const input = ref<HTMLInputElement[] | HTMLInputElement | null>(null)

async function startRename(i: number, current: string) {
  editing.value = i
  draft.value = current
  await nextTick()
  const el = Array.isArray(input.value) ? input.value[0] : input.value
  el?.focus()
  el?.select()
}
function finishRename() {
  if (editing.value < 0) return
  emit('rename', editing.value, draft.value.trim())
  editing.value = -1
}
defineExpose({ startRename })
</script>

<template>
  <!-- Folder tabs sitting on the settings panel: the open tab is the same sheet as the panel below it, so everything under it belongs to that clip. -->
  <div class="relative shrink-0 bg-paper pt-2">
    <div class="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-line"></div>
    <div class="relative flex items-end gap-1 px-3 sm:px-6">
    <div class="flex min-w-0 items-end gap-1" role="tablist" aria-label="Clips in this project">
      <template v-for="(c, i) in clips" :key="i">
        <div
          v-if="editing === i"
          class="flex shrink-0 items-center rounded-t-xl border border-b-2 border-line border-b-card bg-card px-2.5 py-1.5"
        >
          <input
            ref="input"
            v-model="draft"
            type="text"
            maxlength="40"
            :placeholder="sizeLabel(c.params)"
            aria-label="Clip name"
            class="w-36 rounded-md border border-accent bg-paper px-1.5 py-0.5 text-sm font-bold focus:outline-none"
            @keydown.enter.prevent="finishRename"
            @keydown.esc.prevent="editing = -1"
            @blur="finishRename"
          />
        </div>
        <div
          v-else
          class="group relative flex items-center rounded-t-xl border border-b-2 transition-colors"
          :class="
            active === i
              ? 'z-10 shrink-0 border-line border-b-card bg-card text-ink'
              : 'min-w-0 shrink border-transparent border-b-transparent text-ink-3 hover:bg-card/60 hover:text-ink'
          "
        >
          <span v-if="active === i" class="absolute inset-x-3 -top-px h-0.5 rounded-full bg-accent"></span>
          <button
            type="button"
            role="tab"
            :aria-selected="active === i"
            class="flex min-w-0 max-w-[12rem] flex-col items-start py-1.5 pl-3.5 text-left leading-tight"
            :class="active === i ? 'pr-1' : 'pr-3.5'"
            @click="emit('select', i)"
            @dblclick="startRename(i, c.name)"
          >
            <span class="max-w-full truncate text-sm font-bold">{{ clipLabel(c) }}</span>
            <span v-if="c.name.trim()" class="max-w-full truncate text-[11px] font-medium text-ink-3">{{ sizeLabel(c.params) }}</span>
          </button>
          <template v-if="active === i">
            <button
              type="button"
              class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-paper hover:text-ink"
              :aria-label="`Rename ${clipLabel(c)}`"
              title="Give this clip a name"
              @click="startRename(i, c.name)"
            >
              <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
              </svg>
            </button>
            <button
              v-if="clips.length > 1"
              type="button"
              class="mr-1.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-warn-bg hover:text-warn-ink"
              :aria-label="`Remove ${clipLabel(c)}`"
              title="Remove this clip"
              @click="emit('remove', i)"
            >
              <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <span v-else class="w-1.5"></span>
          </template>
        </div>
      </template>
    </div>
      <button
        type="button"
        class="mb-1 flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-sm font-bold text-ink-2 transition-colors hover:bg-card hover:text-ink"
        title="Add another clip, starting as a copy of this one"
        @click="emit('add')"
      >
        <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        <span :class="clips.length > 2 ? 'sr-only' : ''">Add clip</span>
      </button>
    </div>
  </div>
</template>
