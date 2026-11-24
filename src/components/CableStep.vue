<script setup lang="ts">
import { computed } from 'vue'
import { CABLE_PRESETS, FLAT_CABLE_PRESETS, type CableHolder, type ClipParams } from '../clip/types'
import ChipRow from './ChipRow.vue'
import NumField from './NumField.vue'
import SegControl from './SegControl.vue'

const props = defineProps<{ params: ClipParams }>()

const showHolder = computed(() => ['round', 'square', 'rect', 'triangle'].includes(props.params.shape) && props.params.mechanism !== 'strap')
const holders: { value: CableHolder; label: string; hint: string }[] = [
  { value: 'rings', label: 'Rings around it', hint: 'A small ring for each cable, spaced around the clip.' },
  { value: 'pocket', label: 'Pocket in the clip', hint: 'One piece: the cable sits in a pocket in the clip\'s wall, open toward the mount. Drop the cable in, clip it on, and the mount holds it in.' },
  { value: 'slide', label: 'Slide-in hook', hint: 'A curved band that hugs the clip with a lip at its tip: push the cable in past the lip and it stays. Nothing to open.' },
  { value: 'square', label: 'Big square slot', hint: 'One roomy slot beside the clip that groups all the cables together.' },
  { value: 'latch', label: 'Closed clip', hint: 'A wide, thin loop lying along the clip with a lip curling outward at the base: slide the cable in under the lip and it stays. Nothing to open.' },
]

// several plain rings spread out by themselves; every other style sits where you put it
const showPosition = computed(() => showHolder.value && (props.params.holder !== 'rings' || props.params.cableCount === 1))
const positions = [
  { label: 'Next to mouth', value: 45 },
  { label: 'Right side', value: 90 },
  { label: 'Opposite mouth', value: 180 },
  { label: 'Left side', value: 270 },
  { label: 'Next to mouth, left', value: 315 },
]
const positionChips = computed(() => positions.map((pos) => ({ label: pos.label, active: props.params.holderAngle === pos.value })))

// the closed loop is meant to stand opposite the mouth, like a handle on top of the clip
function pick(h: CableHolder) {
  props.params.holder = h
  if (h === 'latch') props.params.holderAngle = 180
}

const flat = computed(() => props.params.cableShape === 'flat')
const flatChips = computed(() =>
  FLAT_CABLE_PRESETS.map((c) => ({
    label: `${c.label} (about ${c.width} × ${c.thickness})`,
    active: props.params.cableWidth === c.width && props.params.cableThickness === c.thickness,
  })),
)
function pickFlat(i: number) {
  props.params.cableWidth = FLAT_CABLE_PRESETS[i].width
  props.params.cableThickness = FLAT_CABLE_PRESETS[i].thickness
}

const chips = computed(() =>
  CABLE_PRESETS.map((c) => ({ label: `${c.label} ${c.value}`, active: props.params.cableDiameter === c.value })),
)
</script>

<template>
  <div class="grid gap-5 @3xl:grid-cols-2">
    <div class="space-y-3">
      <p class="text-sm font-semibold">{{ flat ? 'How big is the flat cord?' : 'How thick is the cable?' }}</p>
      <SegControl
        v-model="params.cableShape"
        :options="[
          { value: 'round', label: 'Round cable' },
          { value: 'flat', label: 'Flat cord' },
        ]"
      />
      <template v-if="flat">
        <ChipRow label="Typical flat cords (mm)" :items="flatChips" @pick="pickFlat" />
        <div class="grid grid-cols-2 gap-3">
          <NumField v-model="params.cableWidth" label="Width" unit="mm" :min="2" :max="30" :step="0.1" />
          <NumField v-model="params.cableThickness" label="Thickness" unit="mm" :min="1" :max="10" :step="0.1" />
        </div>
        <p class="max-w-sm text-xs leading-snug text-ink-3">
          The cord lies on its wide side. The sizes above are typical, not exact: measure yours with calipers, the cord itself, not the plug.
        </p>
      </template>
      <template v-else>
        <ChipRow label="Typical cables (mm)" :items="chips" @pick="(i) => (params.cableDiameter = CABLE_PRESETS[i].value)" />
        <NumField
          v-model="params.cableDiameter"
          label="Cable diameter"
          unit="mm"
          :min="1.5"
          :max="20"
          :step="0.1"
          hint="Measure the cable itself with calipers, not the plug on the end."
        />
      </template>
    </div>
    <div class="space-y-3">
      <p class="text-sm font-semibold">How many cables per clip?</p>
      <SegControl
        v-model="params.cableCount"
        :options="[
          { value: 1, label: '1' },
          { value: 2, label: '2' },
          { value: 3, label: '3' },
          { value: 4, label: '4' },
        ]"
      />
      <p class="max-w-sm text-xs leading-snug text-ink-3">
        {{ showHolder ? 'Choose how they are held below.' : 'On a panel edge or flat base the cables sit in a row; the strap-on saddle fans them out, and the arch clip holds them side by side under one arch.' }}
      </p>
    </div>
    <div v-if="showHolder" class="@3xl:col-span-2">
      <p class="mb-2 text-sm font-semibold">How should the cables be held?</p>
      <div class="grid gap-2 @lg:grid-cols-2 @5xl:grid-cols-5" role="radiogroup" aria-label="Cable holder">
        <button
          v-for="h in holders"
          :key="h.value"
          type="button"
          role="radio"
          :aria-checked="params.holder === h.value"
          class="rounded-xl border-2 px-3.5 py-2.5 text-left transition-all"
          :class="
            params.holder === h.value
              ? 'border-accent bg-accent-soft shadow-[0_2px_0_var(--color-accent)]'
              : 'border-line bg-card hover:-translate-y-0.5 hover:border-ink-3'
          "
          @click="pick(h.value)"
        >
          <span class="font-display text-sm font-bold">{{ h.label }}</span>
          <span class="mt-0.5 block text-xs leading-snug text-ink-2">{{ h.hint }}</span>
        </button>
      </div>
    </div>
    <div v-if="showPosition" class="grid gap-3 @3xl:col-span-2 @3xl:grid-cols-2">
      <div class="space-y-1.5">
        <p class="text-sm font-semibold">Where on the clip?</p>
        <ChipRow label="Position" :items="positionChips" @pick="(i) => (params.holderAngle = positions[i].value)" />
      </div>
      <NumField
        v-model="params.holderAngle"
        label="Angle from the mouth"
        unit="°"
        :min="0"
        :max="360"
        :step="5"
        hint="Looking down at the clip with its mouth at the top: 0° is the mouth, 90° the right side, 180° straight opposite, 270° the left side."
      />
    </div>
  </div>
</template>
