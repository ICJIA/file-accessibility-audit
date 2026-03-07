export default defineNuxtRouteMiddleware(async (to) => {
  // Skip auth check for login page
  if (to.path === '/login') return

  try {
    // Check if auth is required
    const headers = import.meta.server ? useRequestHeaders(['cookie']) : {}
    const config = await $fetch<{ requireLogin: boolean }>('/api/auth/config')
    if (!config.requireLogin) return

    // Forward browser cookies during SSR so the API can validate the JWT
    await $fetch('/api/auth/me', { credentials: 'include', headers })
  } catch {
    return navigateTo('/login')
  }
})
