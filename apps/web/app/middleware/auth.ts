export default defineNuxtRouteMiddleware(async (to) => {
  // Skip auth check for login page
  if (to.path === '/login') return

  try {
    // Forward browser cookies during SSR so the API can validate the JWT
    const headers = import.meta.server ? useRequestHeaders(['cookie']) : {}
    await $fetch('/api/auth/me', { credentials: 'include', headers })
  } catch {
    return navigateTo('/login')
  }
})
