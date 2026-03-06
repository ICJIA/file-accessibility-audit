export default defineNuxtRouteMiddleware(async (to) => {
  // Skip auth check for login page
  if (to.path === '/login') return

  try {
    await $fetch('/api/auth/me', { credentials: 'include' })
  } catch {
    return navigateTo('/login')
  }
})
