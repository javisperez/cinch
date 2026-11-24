<script setup lang="ts">
import type { MountShape } from '../clip/types'
// The mount in ink, the cable in orange, always on the right-hand face, like the real model.
defineProps<{ shape: MountShape }>()
</script>

<template>
  <svg viewBox="0 0 56 48" class="h-12 w-14" fill="none" aria-hidden="true">
    <circle v-if="shape === 'round'" cx="21" cy="24" r="13" stroke="currentColor" stroke-width="3" />
    <rect v-else-if="shape === 'square'" x="8" y="11" width="26" height="26" rx="3" stroke="currentColor" stroke-width="3" />
    <rect v-else-if="shape === 'rect'" x="11" y="8" width="20" height="32" rx="3" stroke="currentColor" stroke-width="3" />
    <path
      v-else-if="shape === 'triangle'"
      d="M7 24 L33 9.5 V38.5 Z"
      stroke="currentColor"
      stroke-width="3"
      stroke-linejoin="round"
    />
    <template v-else-if="shape === 'panel'">
      <path d="M10 9 V35 a3 3 0 0 0 3 3 H27 a3 3 0 0 0 3 -3 V9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
      <rect x="18" y="4" width="4" height="26" rx="1" fill="currentColor" opacity=".35" />
    </template>
    <template v-else>
      <path d="M5 39 H37" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
      <path d="M12 39 V32 a8 8 0 0 1 16 0 V39" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <circle cx="47" cy="24" r="5" fill="var(--color-accent)" />
  </svg>
</template>
