<script setup lang="ts">
const model = defineModel<number>({ required: true })
const props = defineProps<{
  label: string
  min: number
  max: number
  step?: number
  unit?: string
  hint?: string
}>()

function clamp(v: number) {
  const s = props.step ?? 1
  const snapped = Math.round(v / s) * s
  return Math.min(props.max, Math.max(props.min, Math.round(snapped * 1000) / 1000))
}

function onSlide(e: Event) {
  model.value = clamp(parseFloat((e.target as HTMLInputElement).value))
}

// typed values are applied on commit (blur / enter) so half-typed numbers never get clamped mid-keystroke
function onCommit(e: Event) {
  const el = e.target as HTMLInputElement
  const v = parseFloat(el.value)
  if (Number.isFinite(v)) model.value = clamp(v)
  el.value = String(model.value)
}
</script>

<template>
  <div>
    <div class="flex items-baseline justify-between gap-2">
      <span class="text-[11px] font-bold uppercase tracking-wider text-ink-2">{{ label }}</span>
      <span class="flex items-baseline gap-1">
        <input
          type="number"
          :aria-label="label"
          :value="model"
          :min="min"
          :max="max"
          :step="step ?? 1"
          class="w-16 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-right font-mono text-sm font-semibold text-ink hover:border-line focus:border-accent focus:bg-card focus:outline-none"
          @change="onCommit"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        <span v-if="unit" class="w-5 text-xs text-ink-3">{{ unit }}</span>
      </span>
    </div>
    <input
      type="range"
      :aria-label="`${label} slider`"
      :value="model"
      :min="min"
      :max="max"
      :step="step ?? 1"
      @input="onSlide"
    />
    <p v-if="hint" class="mt-0.5 text-xs leading-snug text-ink-3">{{ hint }}</p>
  </div>
</template>
