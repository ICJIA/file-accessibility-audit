<template>
  <div class="flex flex-col items-center justify-center min-h-[50vh] space-y-6">
    <div class="relative">
      <div class="w-16 h-16 border-4 border-[#222222] border-t-green-500 rounded-full animate-spin" />
    </div>

    <div class="text-center space-y-2">
      <p class="text-lg font-medium text-white">Analyzing your PDF</p>
      <p class="text-sm text-neutral-400">{{ stage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  stage: string
}>()
</script>
