import './test-helpers'
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ReportActionBanner from '../components/ReportActionBanner.vue'

const cat = (severity: string | null) => ({ severity })

describe('ReportActionBanner', () => {
  it('renders nothing when categories is empty', () => {
    const wrapper = mount(ReportActionBanner, { props: { categories: [] } })
    expect(wrapper.text()).toBe('')
  })

  it('renders nothing when categories has only null severity entries', () => {
    const wrapper = mount(ReportActionBanner, {
      props: { categories: [cat(null), cat(null)] },
    })
    expect(wrapper.text()).toBe('')
  })

  it('singular critical only', () => {
    const wrapper = mount(ReportActionBanner, {
      props: { categories: [cat('Critical'), cat('Pass')] },
    })
    expect(wrapper.text()).toBe('1 critical issue must be fixed before publishing.')
    expect(wrapper.classes()).toContain('critical')
  })

  it('plural critical only', () => {
    const wrapper = mount(ReportActionBanner, {
      props: { categories: [cat('Critical'), cat('Critical'), cat('Critical')] },
    })
    expect(wrapper.text()).toBe('3 critical issues must be fixed before publishing.')
  })

  it('critical + moderate combined', () => {
    const wrapper = mount(ReportActionBanner, {
      props: {
        categories: [cat('Critical'), cat('Critical'), cat('Moderate')],
      },
    })
    expect(wrapper.text()).toBe('2 critical and 1 moderate issues must be fixed before publishing.')
  })

  it('moderate only, singular', () => {
    const wrapper = mount(ReportActionBanner, {
      props: { categories: [cat('Moderate'), cat('Pass')] },
    })
    expect(wrapper.text()).toBe('1 moderate issue found. Recommended to fix before publishing.')
    expect(wrapper.classes()).toContain('moderate')
  })

  it('moderate only, plural', () => {
    const wrapper = mount(ReportActionBanner, {
      props: { categories: [cat('Moderate'), cat('Moderate')] },
    })
    expect(wrapper.text()).toBe('2 moderate issues found. Recommended to fix before publishing.')
  })

  it('minor only, singular', () => {
    const wrapper = mount(ReportActionBanner, {
      props: { categories: [cat('Minor'), cat('Pass')] },
    })
    expect(wrapper.text()).toBe('1 minor issue found. Optional fixes — PDF passes Illinois accessibility.')
    expect(wrapper.classes()).toContain('minor')
  })

  it('minor only, plural', () => {
    const wrapper = mount(ReportActionBanner, {
      props: { categories: [cat('Minor'), cat('Minor')] },
    })
    expect(wrapper.text()).toBe('2 minor issues found. Optional fixes — PDF passes Illinois accessibility.')
  })

  it('all pass', () => {
    const wrapper = mount(ReportActionBanner, {
      props: { categories: [cat('Pass'), cat('Pass'), cat('Pass')] },
    })
    expect(wrapper.text()).toBe('This PDF passes Illinois IITAA + WCAG 2.1 AA accessibility checks.')
    expect(wrapper.classes()).toContain('pass')
  })
})
