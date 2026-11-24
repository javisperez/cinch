<script setup lang="ts" generic="T extends string | number">
defineProps<{
  options: { value: T; label: string; disabled?: boolean }[]
  label?: string
}>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div>
    <span v-if="label" class="mb-1 block text-[11px] font-bold uppercase tracking-wider text-ink-2">{{ label }}</span>
    <div role="radiogroup" :aria-label="label" class="inline-flex rounded-lg border border-line bg-paper p-0.5">
      <button
        v-for="o in options"
        :key="String(o.value)"
        type="button"
        role="radio"
        :aria-checked="model === o.value"
        :disabled="o.disabled"
        class="rounded-md px-3 py-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        :class="model === o.value ? 'bg-ink text-card shadow-sm' : 'text-ink-2 hover:text-ink'"
        @click="model = o.value"
      >
        {{ o.label }}
      </button>
    </div>
  </div>
</template>
