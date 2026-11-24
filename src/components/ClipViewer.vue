<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ClipResult } from '../clip/buildClip'
import { useClipViewer } from '../useClipViewer'

const props = defineProps<{ result: ClipResult | null }>()

const canvas = ref<HTMLCanvasElement | null>(null)
const showFit = ref(true)
const { setResult, setShowFit, fit } = useClipViewer(canvas)

watch(() => props.result, (r) => r && setResult(r), { immediate: true })
watch(showFit, setShowFit)
defineExpose({ fit })
</script>

<template>
  <div class="relative h-full w-full overflow-hidden">
    <canvas ref="canvas" class="block h-full w-full touch-none" aria-label="3D preview of the clip" />

    <div class="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
      <span
        v-if="result"
        class="rounded-md bg-card/90 px-2.5 py-1 font-mono text-xs font-semibold text-ink shadow-sm ring-1 ring-line"
      >
        {{ result.size.x.toFixed(1) }} × {{ result.size.y.toFixed(1) }} × {{ result.size.z.toFixed(1) }} mm
      </span>
    </div>

    <div class="absolute right-3 top-3 flex items-center gap-2">
      <button
        type="button"
        :aria-pressed="showFit"
        class="rounded-md px-2.5 py-1 text-xs font-semibold shadow-sm ring-1 transition-colors"
        :class="showFit ? 'bg-ink text-card ring-ink' : 'bg-card/90 text-ink-2 ring-line hover:text-ink'"
        @click="showFit = !showFit"
      >
        Show fit
      </button>
      <button
        type="button"
        class="rounded-md bg-card/90 px-2.5 py-1 text-xs font-semibold text-ink-2 shadow-sm ring-1 ring-line transition-colors hover:text-ink"
        @click="fit()"
      >
        Reset view
      </button>
    </div>

    <div v-if="showFit" class="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 text-[11px] font-medium text-ink-2">
      <span class="flex items-center gap-1.5"><i class="inline-block h-2.5 w-2.5 rounded-sm bg-steel/40 ring-1 ring-steel/60"></i>your mount</span>
      <span class="flex items-center gap-1.5"><i class="inline-block h-2.5 w-2.5 rounded-sm bg-ink/50"></i>your cable</span>
    </div>
  </div>
</template>
