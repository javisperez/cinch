<script setup lang="ts">
defineProps<{ items: { label: string; active: boolean }[]; label?: string }>()
defineEmits<{ pick: [index: number] }>()
</script>

<template>
  <div>
    <span v-if="label" class="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ink-2">{{ label }}</span>
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="(it, i) in items"
        :key="it.label"
        type="button"
        :aria-pressed="it.active"
        class="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
        :class="
          it.active
            ? 'border-accent bg-accent-soft text-accent-hover'
            : 'border-line bg-card text-ink-2 hover:border-ink-3 hover:text-ink'
        "
        @click="$emit('pick', i)"
      >
        {{ it.label }}
      </button>
    </div>
  </div>
</template>
