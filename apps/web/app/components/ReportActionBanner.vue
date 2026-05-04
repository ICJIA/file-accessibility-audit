<template>
  <div v-if="copy" class="action-banner" :class="severityClass">
    {{ copy }}
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { tallySeverity } from '~/utils/severityTally'

const props = defineProps<{
  categories: Array<{ severity?: string | null }>
}>()

const tally = computed(() => tallySeverity(props.categories))

const copy = computed<string | null>(() => {
  const t = tally.value
  if (t.total === 0) return null

  if (t.critical > 0) {
    if (t.moderate > 0) {
      return `${t.critical} critical and ${t.moderate} moderate issues must be fixed before publishing.`
    }
    const noun = t.critical === 1 ? 'issue' : 'issues'
    return `${t.critical} critical ${noun} must be fixed before publishing.`
  }

  if (t.moderate > 0) {
    const noun = t.moderate === 1 ? 'issue' : 'issues'
    return `${t.moderate} moderate ${noun} found. Recommended to fix before publishing.`
  }

  if (t.minor > 0) {
    const noun = t.minor === 1 ? 'issue' : 'issues'
    return `${t.minor} minor ${noun} found. Optional fixes — PDF passes Illinois accessibility.`
  }

  return 'This PDF passes Illinois IITAA + WCAG 2.1 AA accessibility checks.'
})

const severityClass = computed(() => {
  const t = tally.value
  if (t.critical > 0) return 'critical'
  if (t.moderate > 0) return 'moderate'
  if (t.minor > 0) return 'minor'
  return 'pass'
})
</script>

<style scoped>
.action-banner {
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 13.5px;
  font-weight: 600;
  border: 1px solid;
}
.action-banner.critical {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.05);
  color: rgb(252, 165, 165);
}
.action-banner.moderate {
  border-color: rgba(234, 179, 8, 0.3);
  background: rgba(234, 179, 8, 0.05);
  color: rgb(253, 224, 71);
}
.action-banner.minor {
  border-color: rgba(59, 130, 246, 0.3);
  background: rgba(59, 130, 246, 0.05);
  color: rgb(147, 197, 253);
}
.action-banner.pass {
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.05);
  color: rgb(134, 239, 172);
}
</style>
