<template>
  <NuxtLoadingIndicator color="#22c55e" />
  <div class="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
    <header class="border-b border-[#222222] px-6 py-4">
      <div class="mx-auto max-w-4xl flex items-center justify-between">
        <h1 class="text-lg font-semibold tracking-tight">
          {{ config.public.appName }}
        </h1>
        <nav v-if="user" class="flex items-center gap-4">
          <NuxtLink to="/" class="text-sm text-neutral-400 hover:text-white transition-colors">
            Analyze
          </NuxtLink>
          <NuxtLink to="/my-history" class="text-sm text-neutral-400 hover:text-white transition-colors">
            My History
          </NuxtLink>
          <NuxtLink v-if="user.isAdmin" to="/history" class="text-sm text-neutral-400 hover:text-white transition-colors">
            Admin Logs
          </NuxtLink>
          <span class="text-xs text-neutral-500">{{ user.email }}</span>
          <UButton size="xs" variant="ghost" color="neutral" @click="logout">
            Logout
          </UButton>
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-4xl px-6 py-8">
      <NuxtPage />
    </main>
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()

const { data: user, refresh: refreshUser } = useFetch('/api/auth/me', {
  credentials: 'include',
  default: () => null,
  watch: false,
})

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  user.value = null
  navigateTo('/login')
}

provide('user', user)
provide('refreshUser', refreshUser)
</script>
