<template>
  <div>
    <header class="border-b border-[#222222] px-6 py-4">
      <div class="mx-auto max-w-4xl flex items-center justify-between">
        <h1 class="text-lg font-semibold tracking-tight">
          {{ config.public.appName }}
        </h1>
        <nav v-if="user" class="flex items-center gap-4">
          <a href="/" class="text-sm text-neutral-400 hover:text-white transition-colors cursor-pointer" @click.prevent="goAnalyze">
            Analyze
          </a>
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
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const config = useRuntimeConfig()
const user = inject<Ref<any>>('user')
const goAnalyze = inject<() => void>('goAnalyze')
const logout = inject<() => void>('logout')
</script>
