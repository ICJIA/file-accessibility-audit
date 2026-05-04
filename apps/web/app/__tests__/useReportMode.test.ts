import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { useReportMode } from '../composables/useReportMode'

describe('useReportMode', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') window.localStorage.clear()
  })

  it('defaults to reader', () => {
    const { mode } = useReportMode()
    expect(mode.value).toBe('reader')
  })

  it('does not read localStorage when persist is false', () => {
    window.localStorage.setItem('audit:reportMode', 'auditor')
    const { mode } = useReportMode({ persist: false })
    expect(mode.value).toBe('reader')
  })

  it('reads localStorage when persist is true and value is valid', () => {
    window.localStorage.setItem('audit:reportMode', 'auditor')
    const { mode } = useReportMode({ persist: true })
    expect(mode.value).toBe('auditor')
  })

  it('ignores invalid localStorage values', () => {
    window.localStorage.setItem('audit:reportMode', 'bogus')
    const { mode } = useReportMode({ persist: true })
    expect(mode.value).toBe('reader')
  })

  it('writes localStorage on setMode when persist is true', async () => {
    const { setMode } = useReportMode({ persist: true })
    setMode('auditor')
    await nextTick()
    expect(window.localStorage.getItem('audit:reportMode')).toBe('auditor')
  })

  it('does not write localStorage on setMode when persist is false', async () => {
    const { setMode } = useReportMode({ persist: false })
    setMode('auditor')
    await nextTick()
    expect(window.localStorage.getItem('audit:reportMode')).toBeNull()
  })

  it('setMode updates the mode ref', () => {
    const { mode, setMode } = useReportMode()
    setMode('auditor')
    expect(mode.value).toBe('auditor')
    setMode('reader')
    expect(mode.value).toBe('reader')
  })
})
