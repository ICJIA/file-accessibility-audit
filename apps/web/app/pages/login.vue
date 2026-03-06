<template>
  <div class="flex items-center justify-center min-h-[60vh]">
    <div class="w-full max-w-sm space-y-6">
      <div class="text-center">
        <h2 class="text-2xl font-bold">Sign In</h2>
        <p class="mt-2 text-sm text-neutral-400">Enter your @illinois.gov email to get started</p>
      </div>

      <!-- Step 1: Email -->
      <form v-if="!otpSent" @submit.prevent="requestOTP" class="space-y-4">
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

        <div v-if="error" class="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
          {{ error }}
        </div>

        <UButton type="submit" block size="lg" :loading="loading">
          Send Verification Code
        </UButton>
      </form>

      <!-- Step 2: OTP -->
      <form v-else @submit.prevent="verifyOTP" class="space-y-4">
        <p class="text-sm text-neutral-400">
          A 6-digit code was sent to <strong class="text-white">{{ email }}</strong>
        </p>

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

        <div v-if="error" class="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
          {{ error }}
        </div>

        <UButton type="submit" block size="lg" :loading="loading">
          Verify
        </UButton>

        <button
          type="button"
          class="w-full text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
          @click="reset"
        >
          Use a different email
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const refreshUser = inject<() => Promise<void>>('refreshUser')

const email = ref('')
const otp = ref('')
const otpSent = ref(false)
const loading = ref(false)
const error = ref('')

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
