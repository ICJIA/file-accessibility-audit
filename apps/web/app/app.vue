<template>
  <NuxtLoadingIndicator color="#22c55e" />
  <div class="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()

// Forward browser cookies during SSR so the API can validate the JWT
const reqHeaders = import.meta.server ? useRequestHeaders(['cookie']) : {}

const { data: user, refresh: refreshUser } = useFetch('/api/auth/me', {
  credentials: 'include',
  headers: reqHeaders,
  default: () => null,
  watch: false,
})

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  user.value = null
  navigateTo('/login')
}

// Provide a signal that child pages can watch to reset state
const resetSignal = ref(0)

function goAnalyze() {
  resetSignal.value++
  navigateTo('/')
}

provide('user', user)
provide('refreshUser', refreshUser)
provide('resetSignal', resetSignal)
provide('goAnalyze', goAnalyze)
provide('logout', logout)
</script>
