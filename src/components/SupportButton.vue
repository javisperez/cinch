<script setup lang="ts">
import { SUPPORT_URL } from '../config'
</script>

<template>
  <a
    :href="SUPPORT_URL"
    target="_blank"
    rel="noopener noreferrer"
    class="group inline-flex items-center gap-2 rounded-full border-2 border-ink bg-card px-2.5 py-1.5 text-sm font-bold text-ink transition-all sm:px-3.5 hover:-translate-y-0.5 hover:bg-ink hover:text-card hover:shadow-[0_3px_0_var(--color-accent)]"
  >
    <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 3v2M11 3v2M14 3v2" class="origin-bottom transition-transform group-hover:-translate-y-0.5" />
    </svg>
    <span class="hidden sm:inline">Buy me a coffee</span>
    <span class="sr-only sm:hidden">Coffee</span>
  </a>
</template>
