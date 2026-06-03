import './test-helpers'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AnnouncementBanner from '../components/AnnouncementBanner.vue'

const STORAGE_KEY = 'a11y-audit:dismissed-announcements'

const TEST_ANNOUNCEMENT = {
  id: 'test-x',
  badge: 'New',
  text: 'hi',
  linkText: 'go',
  linkTo: '/x',
  requiresWcagVersion: '2.2',
}

// Override useRuntimeConfig to inject a test announcement. The global stub in
// test-helpers returns announcements: [], so we replace it here for all tests
// in this file.
const mockUseRuntimeConfig = vi.fn(() => ({
  public: {
    wcagVersion: '2.2',
    announcements: [TEST_ANNOUNCEMENT],
  },
}))

beforeEach(() => {
  // Clear localStorage before each test for isolation.
  localStorage.clear()
  // Inject the announcement-aware config stub.
  vi.stubGlobal('useRuntimeConfig', mockUseRuntimeConfig)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AnnouncementBanner', () => {
  it('renders the banner on first mount (no prior dismissal)', async () => {
    const wrapper = mount(AnnouncementBanner)
    // onMounted fires synchronously in @vue/test-utils (happy-dom env)
    await nextTick()
    expect(wrapper.find('[role="region"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('hi')
    expect(wrapper.text()).toContain('New')
  })

  it('permanently dismisses: banner gone after dismiss + never shown on fresh mount', async () => {
    // --- First mount: banner visible ---
    const wrapper = mount(AnnouncementBanner)
    await nextTick()
    expect(wrapper.find('[role="region"]').exists()).toBe(true)

    // Click the dismiss button.
    await wrapper.find('button[aria-label="Dismiss announcement"]').trigger('click')
    await nextTick()

    // Banner should be gone immediately.
    expect(wrapper.find('[role="region"]').exists()).toBe(false)

    // localStorage must contain the dismissed id.
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[]
    expect(stored).toContain(TEST_ANNOUNCEMENT.id)

    // --- Second mount (simulates a future session / reload) ---
    const wrapper2 = mount(AnnouncementBanner)
    await nextTick()

    // PERMANENT dismissal: banner must NOT appear even on a brand-new instance.
    expect(wrapper2.find('[role="region"]').exists()).toBe(false)
  })

  it('is hidden when no matching announcement exists (announcements empty)', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({
      public: { wcagVersion: '2.2', announcements: [] },
    }))
    const wrapper = mount(AnnouncementBanner)
    await nextTick()
    expect(wrapper.find('[role="region"]').exists()).toBe(false)
  })

  it('is hidden when wcagVersion does not match requiresWcagVersion', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({
      public: {
        wcagVersion: '2.1',
        announcements: [{ ...TEST_ANNOUNCEMENT, requiresWcagVersion: '2.2' }],
      },
    }))
    const wrapper = mount(AnnouncementBanner)
    await nextTick()
    expect(wrapper.find('[role="region"]').exists()).toBe(false)
  })

  it('dismiss button has accessible aria-label', async () => {
    const wrapper = mount(AnnouncementBanner)
    await nextTick()
    const btn = wrapper.find('button[aria-label="Dismiss announcement"]')
    expect(btn.exists()).toBe(true)
  })

  it('accumulates multiple dismissed ids in localStorage', async () => {
    // Pre-seed a different id already dismissed.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['other-id']))

    const wrapper = mount(AnnouncementBanner)
    await nextTick()
    await wrapper.find('button[aria-label="Dismiss announcement"]').trigger('click')
    await nextTick()

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[]
    expect(stored).toContain('other-id')
    expect(stored).toContain(TEST_ANNOUNCEMENT.id)
  })

  it('gracefully ignores corrupt (non-array) localStorage', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ corrupted: true }))
    const wrapper = mount(AnnouncementBanner)
    await nextTick()
    // Must not throw; with no valid dismissed-id list, the banner still shows.
    expect(wrapper.find('[role="region"]').exists()).toBe(true)
  })
})
