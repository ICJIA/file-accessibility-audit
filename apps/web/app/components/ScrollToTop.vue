<template>
  <Transition name="stt-fade">
    <button
      v-show="visible"
      type="button"
      aria-label="Scroll back to top"
      title="Back to top"
      class="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-white shadow-lg ring-1 ring-black/10 hover:bg-green-500 hover:scale-105 active:scale-95 transition-all"
      @click="toTop"
    >
      <svg
        class="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
      </svg>
    </button>
  </Transition>
</template>

<script setup lang="ts">
// A lower-right floating button that appears once the user has scrolled down,
// and smooth-scrolls back to the top. Self-contained; drop it on any page.
const props = withDefaults(defineProps<{ threshold?: number }>(), {
  threshold: 500,
});

const visible = ref(false);

function onScroll() {
  visible.value = window.scrollY > props.threshold;
}

function toTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

onMounted(() => {
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
});
</script>

<style scoped>
.stt-fade-enter-active,
.stt-fade-leave-active {
  transition: opacity 0.2s ease;
}
.stt-fade-enter-from,
.stt-fade-leave-to {
  opacity: 0;
}
</style>
