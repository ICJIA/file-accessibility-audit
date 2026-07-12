<template>
  <div v-if="totalPages > 1" class="mt-4 flex justify-center gap-2">
    <UButton
      v-for="p in totalPages"
      :key="p"
      size="xs"
      :variant="p === page ? 'solid' : 'ghost'"
      :color="p === page ? 'primary' : 'neutral'"
      :aria-label="`Go to page ${p}`"
      :aria-current="p === page ? 'page' : undefined"
      @click="emit('update:page', p)"
    >
      {{ p }}
    </UButton>
  </div>
</template>

<script setup lang="ts">
/**
 * PaginationControls — the numbered page-button row shared by
 * pages/history.vue and pages/my-history.vue (Task F3). Self-hides when
 * there's only one page, matching both pages' original
 * `v-if="pagination.totalPages > 1"` guard, so callers don't need to repeat it.
 */
defineProps<{
  page: number;
  totalPages: number;
}>();

const emit = defineEmits<{ (e: "update:page", page: number): void }>();
</script>
