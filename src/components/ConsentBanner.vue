<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { analyticsPresent, CONSENT_EVENT, getConsent, setConsent } from '../analytics'

// Only shows when analytics is really deployed and no choice is saved yet. The footer's
// "Analytics settings" link brings it back so the choice can be changed.
const open = ref(analyticsPresent() && getConsent() === undefined)
const reopen = () => (open.value = true)
window.addEventListener(CONSENT_EVENT, reopen)
onBeforeUnmount(() => window.removeEventListener(CONSENT_EVENT, reopen))

function choose(granted: boolean) {
  setConsent(granted)
  open.value = false
}
</script>

<template>
  <div
    v-if="open"
    role="dialog"
    aria-label="Analytics consent"
    class="fixed inset-x-3 bottom-3 z-50 rounded-xl border border-line bg-card px-3.5 py-3 shadow-[0_8px_24px_-8px_rgb(0_0_0/.25)] sm:right-auto sm:max-w-xs"
  >
    <p class="text-xs leading-snug text-ink-2">Allow anonymous usage analytics (Google Analytics) to help improve Cinch?</p>
    <div class="mt-2.5 flex justify-end gap-2">
      <button type="button" class="rounded-full border border-line px-3 py-1 text-xs font-bold text-ink-2 transition-colors hover:border-ink-3 hover:text-ink" @click="choose(false)">
        Decline
      </button>
      <button type="button" class="rounded-full bg-ink px-3 py-1 text-xs font-bold text-card transition-colors hover:bg-ink-2" @click="choose(true)">
        Accept
      </button>
    </div>
  </div>
</template>
