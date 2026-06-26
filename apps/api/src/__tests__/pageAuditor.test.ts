import { describe, it, expect } from 'vitest'
import { slimIssue } from '../services/pageAuditor.js'

describe('slimIssue', () => {
  it('maps id, impact, description, helpUrl, tags', () => {
    const result = slimIssue({
      id: 'color-contrast',
      impact: 'serious',
      description: 'Elements must have sufficient color contrast',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/color-contrast',
      tags: ['wcag2a', 'wcag143'],
      nodes: [{ target: ['#main > p'] }],
    })
    expect(result.id).toBe('color-contrast')
    expect(result.impact).toBe('serious')
    expect(result.description).toBe('Elements must have sufficient color contrast')
    expect(result.helpUrl).toBe('https://dequeuniversity.com/rules/axe/4.9/color-contrast')
    expect(result.tags).toEqual(['wcag2a', 'wcag143'])
  })

  it('caps nodes to 25 while nodeCount reflects true uncapped count via max(1, len)', () => {
    const manyNodes = Array.from({ length: 40 }, (_, i) => ({ target: [`#el-${i}`] }))
    const result = slimIssue({
      id: 'label',
      impact: 'critical',
      description: 'Form elements must have labels',
      helpUrl: 'https://example.com',
      tags: [],
      nodes: manyNodes,
    })
    expect(result.nodes).toHaveLength(25)
    expect(result.nodeCount).toBe(40)
  })

  it('maps nodes[].target correctly', () => {
    const result = slimIssue({
      id: 'image-alt',
      impact: 'critical',
      description: 'Images must have alt text',
      helpUrl: 'https://example.com',
      tags: [],
      nodes: [
        { target: ['img.hero', '#banner img'] },
        { target: ['footer img'] },
      ],
    })
    expect(result.nodes[0].target).toEqual(['img.hero', '#banner img'])
    expect(result.nodes[1].target).toEqual(['footer img'])
  })

  it('tolerates missing nodes → nodes=[], nodeCount=1', () => {
    const result = slimIssue({
      id: 'aria-roles',
      impact: 'serious',
      description: 'ARIA roles must conform',
      helpUrl: 'https://example.com',
      tags: ['wcag2a'],
    })
    expect(result.nodes).toEqual([])
    expect(result.nodeCount).toBe(1)
  })

  it('tolerates empty nodes array → nodes=[], nodeCount=1', () => {
    const result = slimIssue({
      id: 'aria-roles',
      impact: 'moderate',
      description: 'ARIA roles must conform',
      helpUrl: 'https://example.com',
      tags: [],
      nodes: [],
    })
    expect(result.nodes).toEqual([])
    expect(result.nodeCount).toBe(1)
  })

  it('tolerates missing tags → tags=[]', () => {
    const result = slimIssue({
      id: 'link-name',
      impact: 'serious',
      description: 'Links must have discernible text',
      helpUrl: 'https://example.com',
      nodes: [{ target: ['a.nav-link'] }],
    })
    expect(result.tags).toEqual([])
  })

  it('filters non-string values out of tags', () => {
    const result = slimIssue({
      id: 'link-name',
      impact: 'serious',
      description: 'Links must have discernible text',
      helpUrl: 'https://example.com',
      tags: ['wcag2a', 42, null, 'cat2'],
      nodes: [],
    })
    expect(result.tags).toEqual(['wcag2a', 'cat2'])
  })

  it('a node with no target → { target: [] }', () => {
    const result = slimIssue({
      id: 'color-contrast',
      impact: 'serious',
      description: 'Contrast',
      helpUrl: 'https://example.com',
      tags: [],
      nodes: [{ other: 'data' }, { target: ['#foo'] }],
    })
    expect(result.nodes[0].target).toEqual([])
    expect(result.nodes[1].target).toEqual(['#foo'])
  })

  it('converts null impact to null (not a string)', () => {
    const result = slimIssue({
      id: 'test-rule',
      impact: null,
      description: 'desc',
      helpUrl: 'url',
      tags: [],
      nodes: [],
    })
    expect(result.impact).toBeNull()
  })

  it('converts non-string impact to null', () => {
    const result = slimIssue({
      id: 'test-rule',
      impact: 42,
      description: 'desc',
      helpUrl: 'url',
      tags: [],
      nodes: [],
    })
    expect(result.impact).toBeNull()
  })
})
