<script setup lang="ts">
import { computed } from 'vue'
import { GRIP_PRESETS, mechanismsFor, type ClipParams } from '../clip/types'
import ChipRow from './ChipRow.vue'
import NumField from './NumField.vue'
import SegControl from './SegControl.vue'

const props = defineProps<{ params: ClipParams }>()

const mechanisms = computed(() => mechanismsFor(props.params.shape))
const isPole = computed(() => ['round', 'square', 'rect', 'triangle'].includes(props.params.shape))
// panels keep a row; on poles several cables spread around the mount, and a single cable can also open the same way as the mount
const showFacing = computed(() => props.params.shape === 'panel' || (isPole.value && ((props.params.cableCount === 1 && props.params.holder === 'rings') || props.params.holder === 'square')))
const facingOptions = computed(() =>
  props.params.shape === 'panel'
    ? [
        { value: 'same', label: 'Same way' },
        { value: 'opposite', label: 'Opposite' },
      ]
    : [
        { value: 'outward', label: 'Outward' },
        { value: 'same', label: 'Same as mount' },
        { value: 'opposite', label: 'Opposite' },
      ],
)
const gripChips = computed(() => GRIP_PRESETS.map((g) => ({ label: g.label, active: Math.abs(props.params.mountClearance - g.value) < 1e-6 })))

const strapChips = [2.5, 3.6, 4.8, 7.6, 10]
const strapItems = computed(() => strapChips.map((w) => ({ label: `${w}`, active: props.params.strapWidth === w })))
const twoStrapsFit = computed(() => props.params.width >= 2 * (props.params.strapWidth + 0.8) + 3.6)
</script>

<template>
  <div class="grid gap-5 @3xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.7fr)]">
    <div>
      <p class="mb-2 text-sm font-semibold">How should it hold on?</p>
      <div class="grid gap-2" role="radiogroup" aria-label="Clip mechanism">
        <button
          v-for="m in mechanisms"
          :key="m.value"
          type="button"
          role="radio"
          :aria-checked="params.mechanism === m.value"
          class="rounded-xl border-2 px-3.5 py-2.5 text-left transition-all"
          :class="
            params.mechanism === m.value
              ? 'border-accent bg-accent-soft shadow-[0_2px_0_var(--color-accent)]'
              : 'border-line bg-card hover:-translate-y-0.5 hover:border-ink-3'
          "
          @click="params.mechanism = m.value"
        >
          <span class="font-display text-sm font-bold">{{ m.label }}</span>
          <span class="mt-0.5 block text-xs leading-snug text-ink-2">{{ m.hint }}</span>
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 content-start gap-x-5 gap-y-3 @lg:grid-cols-2 @5xl:grid-cols-3">
      <NumField
        v-model="params.width"
        :label="params.shape === 'flat' ? 'Clip length' : 'Clip height'"
        unit="mm"
        :min="6"
        :max="40"
        :step="0.5"
      />
      <NumField v-model="params.wall" label="Wall thickness" unit="mm" :min="1" :max="4" :step="0.1" />

      <!-- grip: how tightly the clip holds the mount -->
      <div v-if="params.mechanism === 'snap' || params.mechanism === 'clamp'" class="space-y-1.5">
        <ChipRow label="Grip" :items="gripChips" @pick="(i) => (params.mountClearance = GRIP_PRESETS[i].value)" />
        <NumField
          v-model="params.mountClearance"
          label="Mount fit"
          unit="mm"
          :min="-0.5"
          :max="1"
          :step="0.05"
          hint="Below zero squeezes the mount."
        />
      </div>

      <template v-if="params.mechanism === 'snap'">
        <NumField
          v-if="isPole"
          v-model="params.mountOpening"
          label="Snap opening"
          unit="%"
          :min="0"
          :max="95"
          :step="1"
          hint="Mouth width as a share of the mount. Smaller holds harder; 0% is a closed ring."
        />
        <NumField
          v-model="params.lipFlare"
          label="Lip flare"
          unit="mm"
          :min="0"
          :max="8"
          :step="0.5"
          hint="Outward lead-in that guides the mount in."
        />
      </template>

      <template v-else-if="params.mechanism === 'clamp'">
        <SegControl
          v-model="params.bolt"
          label="Bolt"
          :options="[
            { value: 'M3', label: 'M3' },
            { value: 'M4', label: 'M4' },
          ]"
        />
        <NumField
          v-model="params.clampGap"
          label="Clamp gap"
          unit="mm"
          :min="1"
          :max="5"
          :step="0.1"
          hint="Space between the ears before tightening. Bigger = more range."
        />
      </template>

      <template v-else-if="params.mechanism === 'strap'">
        <div class="space-y-1.5">
          <ChipRow label="Strap width (mm): zip tie or velcro" :items="strapItems" @pick="(i) => (params.strapWidth = strapChips[i])" />
          <NumField v-model="params.strapWidth" label="Strap width" unit="mm" :min="2" :max="20" :step="0.1" />
        </div>
        <NumField v-model="params.strapThickness" label="Strap thickness" unit="mm" :min="0.6" :max="3" :step="0.1" />
        <SegControl
          v-model="params.strapCount"
          label="Strap tunnels"
          :options="[
            { value: 1, label: '1' },
            { value: 2, label: '2', disabled: !twoStrapsFit },
          ]"
        />
        <NumField v-model="params.mountClearance" label="Mount fit" unit="mm" :min="-0.5" :max="1" :step="0.05" />
      </template>

      <NumField
        v-else-if="params.mechanism === 'channel' || params.mechanism === 'slide'"
        v-model="params.lipFlare"
        label="Lip flare"
        unit="mm"
        :min="0"
        :max="8"
        :step="0.5"
        hint="Outward lead-in that guides the cable in."
      />

      <template v-else-if="params.shape === 'panel'">
        <NumField
          v-model="params.lipFlare"
          label="Lip flare"
          unit="mm"
          :min="0"
          :max="8"
          :step="0.5"
          hint="Outward lead-in that guides the panel in."
        />
        <div class="space-y-1.5">
          <NumField
            v-model="params.mountClearance"
            label="Panel fit"
            unit="mm"
            :min="-0.5"
            :max="0.5"
            :step="0.05"
            hint="Slightly negative so the jaws pinch."
          />
        </div>
      </template>

      <SegControl
        v-if="showFacing"
        v-model="params.cableFacing"
        label="Cable slot opens"
        :options="facingOptions"
      />
      <NumField v-if="params.mechanism !== 'bridge' && !(isPole && params.holder === 'pocket')" v-model="params.cableOpening" label="Cable slot opening" unit="%" :min="40" :max="95" :step="1" hint="Smaller = harder to pull the cable out." />
      <NumField v-model="params.cableClearance" label="Cable fit" unit="mm" :min="-0.2" :max="0.8" :step="0.05" />
    </div>
  </div>
</template>
