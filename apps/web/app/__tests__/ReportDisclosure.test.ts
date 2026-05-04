import './test-helpers'
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReportDisclosure from '../components/ReportDisclosure.vue'

describe('ReportDisclosure', () => {
  it('renders closed when mode is reader', () => {
    const wrapper = mount(ReportDisclosure, {
      props: { mode: 'reader', label: 'Methodology' },
      slots: { default: '<p>body content</p>' },
    })
    const details = wrapper.find('details')
    expect(details.exists()).toBe(true)
    expect(details.attributes('open')).toBeUndefined()
  })

  it('renders open when mode is auditor', () => {
    const wrapper = mount(ReportDisclosure, {
      props: { mode: 'auditor', label: 'Methodology' },
      slots: { default: '<p>body content</p>' },
    })
    expect(wrapper.find('details').attributes('open')).toBeDefined()
  })

  it('snaps open when mode flips reader -> auditor', async () => {
    const wrapper = mount(ReportDisclosure, {
      props: { mode: 'reader', label: 'X' },
    })
    expect(wrapper.find('details').attributes('open')).toBeUndefined()
    await wrapper.setProps({ mode: 'auditor' })
    expect(wrapper.find('details').attributes('open')).toBeDefined()
  })

  it('snaps closed when mode flips auditor -> reader', async () => {
    const wrapper = mount(ReportDisclosure, {
      props: { mode: 'auditor', label: 'X' },
    })
    expect(wrapper.find('details').attributes('open')).toBeDefined()
    await wrapper.setProps({ mode: 'reader' })
    expect(wrapper.find('details').attributes('open')).toBeUndefined()
  })

  it('renders the label text inside the summary', () => {
    const wrapper = mount(ReportDisclosure, {
      props: { mode: 'reader', label: 'How Strict and Practical differ' },
    })
    expect(wrapper.find('summary').text()).toContain('How Strict and Practical differ')
  })

  it('renders the badge when provided', () => {
    const wrapper = mount(ReportDisclosure, {
      props: { mode: 'reader', label: 'WCAG references', badge: '2 success criteria' },
    })
    expect(wrapper.find('summary').text()).toContain('2 success criteria')
  })

  it('renders slot content inside the body', () => {
    const wrapper = mount(ReportDisclosure, {
      props: { mode: 'auditor', label: 'X' },
      slots: { default: '<span class="probe">slotted</span>' },
    })
    expect(wrapper.find('.probe').exists()).toBe(true)
  })
})
