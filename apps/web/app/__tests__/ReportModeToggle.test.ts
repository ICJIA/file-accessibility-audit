import './test-helpers'
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ReportModeToggle from '../components/ReportModeToggle.vue'

describe('ReportModeToggle', () => {
  it('renders both segments', () => {
    const wrapper = mount(ReportModeToggle, {
      props: { modelValue: 'reader' },
    })
    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBe(2)
    expect(buttons[0]?.text()).toBe('Reader')
    expect(buttons[1]?.text()).toBe('Auditor')
  })

  it('marks reader segment aria-pressed=true when modelValue is reader', () => {
    const wrapper = mount(ReportModeToggle, {
      props: { modelValue: 'reader' },
    })
    const buttons = wrapper.findAll('button')
    expect(buttons[0]?.attributes('aria-pressed')).toBe('true')
    expect(buttons[1]?.attributes('aria-pressed')).toBe('false')
  })

  it('marks auditor segment aria-pressed=true when modelValue is auditor', () => {
    const wrapper = mount(ReportModeToggle, {
      props: { modelValue: 'auditor' },
    })
    const buttons = wrapper.findAll('button')
    expect(buttons[0]?.attributes('aria-pressed')).toBe('false')
    expect(buttons[1]?.attributes('aria-pressed')).toBe('true')
  })

  it('emits update:modelValue=reader when reader segment is clicked', async () => {
    const wrapper = mount(ReportModeToggle, {
      props: { modelValue: 'auditor' },
    })
    await wrapper.findAll('button')[0]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['reader'])
  })

  it('emits update:modelValue=auditor when auditor segment is clicked', async () => {
    const wrapper = mount(ReportModeToggle, {
      props: { modelValue: 'reader' },
    })
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['auditor'])
  })

  it('exposes a group role with descriptive aria-label', () => {
    const wrapper = mount(ReportModeToggle, {
      props: { modelValue: 'reader' },
    })
    const group = wrapper.find('[role="group"]')
    expect(group.exists()).toBe(true)
    expect(group.attributes('aria-label')).toBe('Report view mode')
  })
})
