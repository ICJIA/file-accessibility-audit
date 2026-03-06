<template>
  <div class="flex items-center justify-center min-h-[80vh]">
    <div v-if="ready" class="w-full max-w-md">
      <!-- Card -->
      <div class="rounded-2xl border border-[#2a2a2a] bg-[#111111] shadow-2xl shadow-black/50 overflow-hidden">
        <!-- Card header with accent bar -->
        <div class="h-1 bg-gradient-to-r from-orange-500 via-orange-400 to-green-500" />

        <div class="px-8 pt-8 pb-2 text-center">
          <div class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-orange-500/10 border border-orange-500/20 mb-4">
            <svg class="w-7 h-7 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h2 class="text-2xl font-bold text-white">Sign In</h2>
          <p class="mt-2 text-sm text-neutral-400">
            {{ otpSent ? 'Enter the code we sent you' : 'Enter your @illinois.gov email to get started' }}
          </p>
        </div>

        <div class="px-8 pb-8 pt-4">
          <!-- Step 1: Email -->
          <form v-if="!otpSent" @submit.prevent="requestOTP" class="space-y-5">
            <UFormField label="Email address">
              <UInput
                v-model="email"
                type="email"
                placeholder="you@agency.illinois.gov"
                size="lg"
                required
                :disabled="loading"
                class="w-full"
              />
            </UFormField>

            <div v-if="error" class="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              {{ error }}
            </div>

            <UButton
              type="submit"
              block
              size="lg"
              :loading="loading"
              class="bg-orange-500! hover:bg-orange-400! text-white! font-semibold cursor-pointer"
            >
              Send Verification Code
            </UButton>

            <p class="text-xs text-center text-neutral-500">
              Only <span class="text-neutral-400">@illinois.gov</span> emails are accepted
            </p>
          </form>

          <!-- Step 2: OTP -->
          <form v-else @submit.prevent="verifyOTP" class="space-y-5">
            <div class="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 text-sm text-green-400">
              Code sent to <strong class="text-green-300">{{ email }}</strong>
            </div>

            <UFormField label="Verification code">
              <UInput
                v-model="otp"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength="6"
                placeholder="000000"
                size="lg"
                required
                :disabled="loading"
                class="w-full text-center tracking-[0.5em] font-mono text-xl"
              />
            </UFormField>

            <div v-if="error" class="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              {{ error }}
            </div>

            <UButton
              type="submit"
              block
              size="lg"
              :loading="loading"
              class="bg-green-600! hover:bg-green-500! text-white! font-semibold cursor-pointer"
            >
              Verify & Sign In
            </UButton>

            <button
              type="button"
              class="w-full text-sm text-neutral-500 hover:text-orange-400 transition-colors cursor-pointer"
              @click="reset"
            >
              ← Use a different email
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const refreshUser = inject<() => Promise<void>>('refreshUser')

const ready = ref(false)
const email = ref('')
const otp = ref('')
const otpSent = ref(false)
const loading = ref(false)
const error = ref('')

// If already authenticated, skip login and go straight to upload
onMounted(async () => {
  try {
    await $fetch('/api/auth/me', { credentials: 'include' })
    navigateTo('/', { replace: true })
    return
  } catch {
    // Not authenticated — show login form
  }
  ready.value = true
})

async function requestOTP() {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/request', {
      method: 'POST',
      body: { email: email.value.trim().toLowerCase() },
      credentials: 'include',
    })
    otpSent.value = true
  } catch (err: any) {
    error.value = err.data?.error || 'Failed to send verification code'
  } finally {
    loading.value = false
  }
}

async function verifyOTP() {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/verify', {
      method: 'POST',
      body: { email: email.value.trim().toLowerCase(), otp: otp.value },
      credentials: 'include',
    })
    await refreshUser?.()
    navigateTo('/')
  } catch (err: any) {
    error.value = err.data?.error || 'Verification failed'
  } finally {
    loading.value = false
  }
}

function reset() {
  otpSent.value = false
  otp.value = ''
  error.value = ''
}
</script>
