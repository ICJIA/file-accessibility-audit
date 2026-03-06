import './test-helpers'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

import LoginPage from '../pages/login.vue'

// Stub $fetch globally for login API calls
const fetchMock = vi.fn()
;(globalThis as any).$fetch = fetchMock

describe('Login Page', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({})
  })

  function mountLogin() {
    return mount(LoginPage, {
      global: {
        provide: {
          refreshUser: vi.fn(),
        },
      },
    })
  }

  // ---- Initial render ----

  it('renders the Sign In heading', () => {
    const wrapper = mountLogin()
    expect(wrapper.text()).toContain('Sign In')
  })

  it('renders the email input on initial load', () => {
    const wrapper = mountLogin()
    const input = wrapper.find('input[type="email"]')
    expect(input.exists()).toBe(true)
  })

  it('renders the email placeholder text', () => {
    const wrapper = mountLogin()
    const input = wrapper.find('input')
    expect(input.attributes('placeholder')).toBe('you@agency.illinois.gov')
  })

  it('shows the "Send Verification Code" button', () => {
    const wrapper = mountLogin()
    expect(wrapper.text()).toContain('Send Verification Code')
  })

  it('does NOT show the OTP input initially', () => {
    const wrapper = mountLogin()
    // There should be no numeric input / OTP form initially
    expect(wrapper.text()).not.toContain('Verification code')
    expect(wrapper.text()).not.toContain('Verify')
  })

  // ---- After email submission ----

  it('shows OTP input after successful email submission', async () => {
    fetchMock.mockResolvedValueOnce({})
    const wrapper = mountLogin()

    // Type an email
    const emailInput = wrapper.find('input')
    await emailInput.setValue('user@illinois.gov')

    // Submit the email form
    await wrapper.find('form').trigger('submit')

    // Wait for async operations
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Verify')
    })

    // OTP-step text should now be visible
    expect(wrapper.text()).toContain('6-digit code was sent')
    expect(wrapper.text()).toContain('user@illinois.gov')
  })

  it('calls the /api/auth/request endpoint on email submit', async () => {
    fetchMock.mockResolvedValueOnce({})
    const wrapper = mountLogin()

    const emailInput = wrapper.find('input')
    await emailInput.setValue('test@agency.illinois.gov')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/request', {
        method: 'POST',
        body: { email: 'test@agency.illinois.gov' },
        credentials: 'include',
      })
    })
  })

  it('shows error message when email request fails', async () => {
    fetchMock.mockRejectedValueOnce({
      data: { error: 'Only illinois.gov emails are allowed' },
    })
    const wrapper = mountLogin()

    const emailInput = wrapper.find('input')
    await emailInput.setValue('bad@gmail.com')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Only illinois.gov emails are allowed')
    })
  })

  it('shows fallback error when request fails without specific message', async () => {
    fetchMock.mockRejectedValueOnce({})
    const wrapper = mountLogin()

    const emailInput = wrapper.find('input')
    await emailInput.setValue('user@illinois.gov')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Failed to send verification code')
    })
  })

  // ---- OTP step ----

  it('allows going back to email step via "Use a different email" button', async () => {
    fetchMock.mockResolvedValueOnce({})
    const wrapper = mountLogin()

    const emailInput = wrapper.find('input')
    await emailInput.setValue('user@illinois.gov')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Verify')
    })

    // Click "Use a different email"
    const backBtn = wrapper.find('button[type="button"]')
    await backBtn.trigger('click')

    // Should be back to the email step
    expect(wrapper.text()).toContain('Send Verification Code')
    expect(wrapper.text()).not.toContain('Verify')
  })

  it('submits the OTP to /api/auth/verify', async () => {
    fetchMock.mockResolvedValueOnce({}) // request OTP
    fetchMock.mockResolvedValueOnce({}) // verify OTP

    const wrapper = mountLogin()

    // Step 1: submit email
    const emailInput = wrapper.find('input')
    await emailInput.setValue('user@illinois.gov')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Verify')
    })

    // Step 2: enter OTP and submit
    const otpInput = wrapper.find('input')
    await otpInput.setValue('123456')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/verify', {
        method: 'POST',
        body: { email: 'user@illinois.gov', otp: '123456' },
        credentials: 'include',
      })
    })
  })

  it('shows error when OTP verification fails', async () => {
    fetchMock.mockResolvedValueOnce({}) // request OTP succeeds
    fetchMock.mockRejectedValueOnce({
      data: { error: 'Invalid or expired code' },
    })

    const wrapper = mountLogin()

    const emailInput = wrapper.find('input')
    await emailInput.setValue('user@illinois.gov')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Verify')
    })

    const otpInput = wrapper.find('input')
    await otpInput.setValue('000000')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Invalid or expired code')
    })
  })

  it('displays the helper text about illinois.gov email', () => {
    const wrapper = mountLogin()
    expect(wrapper.text()).toContain('@illinois.gov')
  })
})
