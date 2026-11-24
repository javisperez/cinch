<script setup lang="ts">
import { computed } from 'vue'
import { MOUNT_PRESETS, SHAPES, SHAPE_START, validMechanism, type ClipParams, type MountShape } from '../clip/types'
import ChipRow from './ChipRow.vue'
import NumField from './NumField.vue'
import SegControl from './SegControl.vue'
import ShapeIcon from './ShapeIcon.vue'

// `params` is the app's reactive state; the step edits it in place.
const props = defineProps<{ params: ClipParams }>()

const presets = computed(() => MOUNT_PRESETS[props.params.shape])
const chips = computed(() =>
  presets.value.map((pr) => ({
    label: pr.label,
    active: Object.entries(pr.patch).every(([k, v]) => props.params[k as keyof ClipParams] === v),
  })),
)

function pickShape(shape: MountShape) {
  Object.assign(props.params, { shape, ...SHAPE_START[shape], mechanism: validMechanism(shape, props.params.mechanism) })
}

function pickPreset(i: number) {
  Object.assign(props.params, presets.value[i].patch)
}

const sizeLabel = computed(() => {
  switch (props.params.shape) {
    case 'round': return 'Diameter'
    case 'rect': return 'Width'
    case 'panel': return 'Panel thickness'
    case 'flat': return 'Plate size'
    default: return 'Side length'
  }
})
const sizeRange = computed<[number, number, number]>(() => {
  switch (props.params.shape) {
    case 'round': return [8, 80, 0.5]
    case 'triangle': return [15, 60, 0.5]
    case 'panel': return [0.8, 12, 0.1]
    case 'flat': return [14, 60, 1]
    default: return [10, 80, 0.5]
  }
})
const presetLabel = computed(() =>
  props.params.shape === 'panel' ? 'Common thicknesses (mm)' : props.params.shape === 'flat' ? 'Plate sizes (mm)' : 'Common sizes (mm)',
)
const hasCorner = computed(() => ['square', 'rect', 'triangle'].includes(props.params.shape))
</script>

<template>
  <div class="grid gap-5 @3xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
    <div>
      <p class="mb-2 text-sm font-semibold">What are you clipping onto?</p>
      <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Mount shape">
        <button
          v-for="s in SHAPES"
          :key="s.value"
          type="button"
          role="radio"
          :aria-checked="params.shape === s.value"
          class="flex flex-col items-center gap-0.5 rounded-xl border-2 px-1.5 pb-1.5 pt-1.5 text-center transition-all"
          :class="
            params.shape === s.value
              ? 'border-accent bg-accent-soft text-ink shadow-[0_2px_0_var(--color-accent)]'
              : 'border-line bg-card text-ink-2 hover:-translate-y-0.5 hover:border-ink-3 hover:text-ink'
          "
          @click="pickShape(s.value)"
        >
          <ShapeIcon :shape="s.value" />
          <span class="font-display text-sm font-bold">{{ s.label }}</span>
          <span class="text-[11px] leading-tight text-ink-3">{{ s.hint }}</span>
        </button>
      </div>
    </div>

    <div class="space-y-3">
      <ChipRow :label="presetLabel" :items="chips" @pick="pickPreset" />
      <div class="grid grid-cols-1 gap-x-5 gap-y-2 @lg:grid-cols-2">
        <NumField v-model="params.size" :label="sizeLabel" unit="mm" :min="sizeRange[0]" :max="sizeRange[1]" :step="sizeRange[2]" />
        <NumField v-if="params.shape === 'rect'" v-model="params.size2" label="Height" unit="mm" :min="10" :max="80" :step="0.5" />
        <NumField
          v-if="params.shape === 'panel'"
          v-model="params.size2"
          label="Grip depth"
          unit="mm"
          :min="6"
          :max="40"
          :step="1"
          hint="How far the jaws reach over the panel."
        />
        <NumField
          v-if="hasCorner"
          v-model="params.cornerRadius"
          label="Corner radius"
          unit="mm"
          :min="0"
          :max="8"
          :step="0.25"
          hint="Round off the clip's inside corners to match the mount."
        />
        <NumField v-if="params.shape === 'flat'" v-model="params.baseThickness" label="Plate thickness" unit="mm" :min="1.2" :max="5" :step="0.2" />
      </div>
      <SegControl
        v-if="params.shape === 'rect'"
        v-model="params.rectFace"
        label="Cable sits on the"
        :options="[
          { value: 'long', label: 'Long face' },
          { value: 'short', label: 'Short face' },
        ]"
      />
      <SegControl
        v-if="params.shape === 'flat' && params.mechanism === 'base'"
        v-model="params.fixing"
        label="Fixing"
        :options="[
          { value: 'adhesive', label: 'Tape / glue' },
          { value: 'screws', label: 'Two screws' },
        ]"
      />
    </div>
  </div>
</template>
