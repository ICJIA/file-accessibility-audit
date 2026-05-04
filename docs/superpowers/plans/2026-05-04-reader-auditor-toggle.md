# Reader / Auditor toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a page-level Reader/Auditor toggle on `/report/:id` and the post-upload page (`pages/index.vue`), plus a one-line action banner and a severity-ordered "Issues to fix" summary, per the spec at `docs/superpowers/specs/2026-05-04-reader-auditor-toggle-design.md`.

**Architecture:** A single reactive `mode` ref (`"reader" | "auditor"`) lives on each page via a `useReportMode` composable. Every disclosure widget on the page is a small `<details>`-based wrapper component that snaps its `open` state to that ref's value. The Auditor mode keeps every block on today's page in its current position with full content (zero regression for power users). Reader mode collapses optional blocks behind labeled disclosures. Two new content blocks — an action banner and an Issues-to-fix summary — render in both modes. localStorage persistence applies only to the post-upload page; the shareable page always defaults to Reader.

**Tech stack:** Vue 3 + Nuxt 4.3, native HTML `<details>`/`<summary>` for disclosures (no Nuxt UI Collapsible), vitest + `@vue/test-utils` + happy-dom for tests, existing dark-mode flow via `useColorMode` untouched.

**Branch:** `feature/reader-auditor-toggle` (already checked out).

---

## File structure

### New files

| Path | Responsibility |
|---|---|
| `apps/web/app/utils/severityTally.ts` | Pure function `tallySeverity(categories)` returning `{critical, moderate, minor, pass, total}`. |
| `apps/web/app/utils/findings.ts` | Pure helpers `isGuidanceFinding(finding)` and `firstActionableFinding(findings)`. Reused by `IssuesSummary`. |
| `apps/web/app/composables/useReportMode.ts` | Composable returning `{mode, setMode}`. Optional `persist: true` reads + writes localStorage key `audit:reportMode`. |
| `apps/web/app/components/ReportDisclosure.vue` | `<details>` wrapper that snaps `open` to a `mode` prop, with click-override until the next mode change. |
| `apps/web/app/components/ReportModeToggle.vue` | Two-segment pill, v-model'd to `'reader'`/`'auditor'`. |
| `apps/web/app/components/ReportActionBanner.vue` | Reads categories, renders one-line action copy keyed off severity tally. |
| `apps/web/app/components/IssuesSummary.vue` | Severity-ordered punch list with jump anchors to detailed-findings cards. |
| `apps/web/app/__tests__/severityTally.test.ts` | Unit tests for `tallySeverity`. |
| `apps/web/app/__tests__/findings.test.ts` | Unit tests for `isGuidanceFinding` + `firstActionableFinding`. |
| `apps/web/app/__tests__/useReportMode.test.ts` | Tests for default + persist behavior. |
| `apps/web/app/__tests__/ReportDisclosure.test.ts` | Mode-snap and click-override behavior. |
| `apps/web/app/__tests__/ReportModeToggle.test.ts` | v-model + aria-pressed. |
| `apps/web/app/__tests__/ReportActionBanner.test.ts` | All four severity-tally branches. |
| `apps/web/app/__tests__/IssuesSummary.test.ts` | Sort order, exclusion of Pass + null, jump-anchor href. |

### Modified files

| Path | Change |
|---|---|
| `apps/web/app/pages/report/[id].vue` | Add `useReportMode({persist:false})`, mount `<ReportModeToggle>` in header, render `<ReportActionBanner>` and `<IssuesSummary>` after the score hero, add `:id="`cat-${cat.id}`"` to each Detailed Findings card, wrap five page-level optional blocks and three per-card optional blocks in `<ReportDisclosure>`. |
| `apps/web/app/pages/index.vue` | Same as above with `useReportMode({persist:true})`. |

### Files explicitly NOT touched

- `ScoreCard.vue`, `AdobeParityCard.vue`, `ModeCompareBox.vue`, `NaCell.vue`, `BatchProgress.vue`, `CategoryRow.vue`, `DropZone.vue`, `ProcessingOverlay.vue`, `ScoreProfileBanner.vue`, `AppTooltip.vue`.
- API code (`apps/api/**`), the scorer, the data model, exports (`useReportExport.ts`), routing, the dark-mode toggle.
- The existing per-card Basic/Advanced findings-filter toggle and the existing Strict/Practical mode toggle on the Category Scores table.

---

## Task 1: Severity tally utility

**Files:**
- Create: `apps/web/app/utils/severityTally.ts`
- Test: `apps/web/app/__tests__/severityTally.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/__tests__/severityTally.test.ts
import { describe, it, expect } from 'vitest'
import { tallySeverity } from '../utils/severityTally'

describe('tallySeverity', () => {
  it('counts categories by severity, ignoring null and unknown', () => {
    const cats = [
      { severity: 'Critical' },
      { severity: 'Critical' },
      { severity: 'Moderate' },
      { severity: 'Minor' },
      { severity: 'Pass' },
      { severity: null },
      { severity: undefined },
      { severity: 'Bogus' as any },
    ]
    expect(tallySeverity(cats as any)).toEqual({
      critical: 2,
      moderate: 1,
      minor: 1,
      pass: 1,
      total: 5,
    })
  })

  it('returns all zeros for empty input', () => {
    expect(tallySeverity([])).toEqual({
      critical: 0, moderate: 0, minor: 0, pass: 0, total: 0,
    })
  })

  it('treats undefined input as empty', () => {
    expect(tallySeverity(undefined as any)).toEqual({
      critical: 0, moderate: 0, minor: 0, pass: 0, total: 0,
    })
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm --filter web exec vitest run app/__tests__/severityTally.test.ts
```

Expected: fails with `Failed to load url ../utils/severityTally` or similar module-not-found error.

- [ ] **Step 3: Implement utility**

```ts
// apps/web/app/utils/severityTally.ts
export interface SeverityTally {
  critical: number
  moderate: number
  minor: number
  pass: number
  total: number
}

interface CategoryLite {
  severity?: 'Critical' | 'Moderate' | 'Minor' | 'Pass' | string | null
}

export function tallySeverity(categories: CategoryLite[] | undefined | null): SeverityTally {
  const tally: SeverityTally = { critical: 0, moderate: 0, minor: 0, pass: 0, total: 0 }
  if (!categories) return tally
  for (const cat of categories) {
    switch (cat?.severity) {
      case 'Critical': tally.critical++; tally.total++; break
      case 'Moderate': tally.moderate++; tally.total++; break
      case 'Minor':    tally.minor++;    tally.total++; break
      case 'Pass':     tally.pass++;     tally.total++; break
      default: break
    }
  }
  return tally
}
```

- [ ] **Step 4: Run passing test**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm --filter web exec vitest run app/__tests__/severityTally.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/utils/severityTally.ts apps/web/app/__tests__/severityTally.test.ts
git commit -m "Add severityTally utility for action-banner + issues-summary copy"
```

---

## Task 2: Findings helpers utility

**Files:**
- Create: `apps/web/app/utils/findings.ts`
- Test: `apps/web/app/__tests__/findings.test.ts`

Background: `pages/report/[id].vue` and `pages/index.vue` each define a local `isGuidanceFinding` function. The new `IssuesSummary` component needs the same logic. To keep DRY without forcing a refactor of the two pages, extract the helper into a util that the new component imports. The pages themselves are left alone (their local copies still work; deduping them is a follow-up out of scope).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/__tests__/findings.test.ts
import { describe, it, expect } from 'vitest'
import { isGuidanceFinding, firstActionableFinding } from '../utils/findings'

describe('isGuidanceFinding', () => {
  it('detects guidance prefixes (case-insensitive)', () => {
    expect(isGuidanceFinding('How to fix: add alt text')).toBe(true)
    expect(isGuidanceFinding('TIP: embed fonts')).toBe(true)
    expect(isGuidanceFinding('Fix: tag the structure')).toBe(true)
    expect(isGuidanceFinding('Note: this is informational')).toBe(true)
    expect(isGuidanceFinding('Review these warnings')).toBe(true)
  })

  it('returns false for plain findings', () => {
    expect(isGuidanceFinding('5 image(s) found, none have alt text')).toBe(false)
    expect(isGuidanceFinding('Document is tagged')).toBe(false)
  })

  it('returns false for empty / whitespace strings', () => {
    expect(isGuidanceFinding('')).toBe(false)
    expect(isGuidanceFinding('   ')).toBe(false)
  })
})

describe('firstActionableFinding', () => {
  it('returns the first non-guidance, non-divider, non-indented line', () => {
    const findings = [
      '--- Font Embedding ---',
      '  12 fonts: 5 embedded, 7 not embedded',
      'Fix: embed fonts',
      '5 fonts not embedded',
      'Note: monitor display',
    ]
    expect(firstActionableFinding(findings)).toBe('5 fonts not embedded')
  })

  it('falls back to the first finding when nothing actionable is found', () => {
    const findings = ['Fix: do this', '--- header ---']
    expect(firstActionableFinding(findings)).toBe('Fix: do this')
  })

  it('returns empty string for empty input', () => {
    expect(firstActionableFinding([])).toBe('')
    expect(firstActionableFinding(undefined as any)).toBe('')
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm --filter web exec vitest run app/__tests__/findings.test.ts
```

Expected: fails with module-not-found.

- [ ] **Step 3: Implement utility**

```ts
// apps/web/app/utils/findings.ts
export function isGuidanceFinding(finding: string): boolean {
  if (!finding) return false
  const f = finding.toLowerCase().trimStart()
  return (
    f.startsWith('how to fix:') ||
    f.startsWith('tip:') ||
    f.startsWith('fix:') ||
    f.startsWith('note:') ||
    f.startsWith('review these')
  )
}

export function firstActionableFinding(findings: string[] | undefined | null): string {
  if (!findings || findings.length === 0) return ''
  const found = findings.find(
    (f) => f && !f.startsWith('---') && !f.startsWith('  ') && !isGuidanceFinding(f),
  )
  return found || findings[0] || ''
}
```

- [ ] **Step 4: Run passing test**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm --filter web exec vitest run app/__tests__/findings.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/utils/findings.ts apps/web/app/__tests__/findings.test.ts
git commit -m "Extract isGuidanceFinding + firstActionableFinding into shared util"
```

---

## Task 3: useReportMode composable

**Files:**
- Create: `apps/web/app/composables/useReportMode.ts`
- Test: `apps/web/app/__tests__/useReportMode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/__tests__/useReportMode.test.ts
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
```

- [ ] **Step 2: Run failing test**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm --filter web exec vitest run app/__tests__/useReportMode.test.ts
```

Expected: fails with module-not-found.

- [ ] **Step 3: Implement composable**

```ts
// apps/web/app/composables/useReportMode.ts
import { ref, watch, type Ref } from 'vue'

export type ReportMode = 'reader' | 'auditor'

const STORAGE_KEY = 'audit:reportMode'

export interface UseReportModeOptions {
  persist?: boolean
}

export interface UseReportModeReturn {
  mode: Ref<ReportMode>
  setMode: (next: ReportMode) => void
}

function readStored(): ReportMode | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  return raw === 'reader' || raw === 'auditor' ? raw : null
}

export function useReportMode(options: UseReportModeOptions = {}): UseReportModeReturn {
  const persist = options.persist === true
  const initial: ReportMode = persist ? readStored() ?? 'reader' : 'reader'
  const mode = ref<ReportMode>(initial)

  if (persist) {
    watch(mode, (next) => {
      if (typeof window === 'undefined') return
      window.localStorage.setItem(STORAGE_KEY, next)
    })
  }

  function setMode(next: ReportMode) {
    mode.value = next
  }

  return { mode, setMode }
}
```

- [ ] **Step 4: Run passing test**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm --filter web exec vitest run app/__tests__/useReportMode.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/composables/useReportMode.ts apps/web/app/__tests__/useReportMode.test.ts
git commit -m "Add useReportMode composable with optional localStorage persistence"
```

---

## Task 4: ReportDisclosure wrapper component

**Files:**
- Create: `apps/web/app/components/ReportDisclosure.vue`
- Test: `apps/web/app/__tests__/ReportDisclosure.test.ts`

Behavior: snaps `open` state to `mode === 'auditor'` whenever `mode` changes. User clicking the summary toggles `open` locally; that override is preserved until the next `mode` change, at which point the widget snaps back to the new mode default.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/__tests__/ReportDisclosure.test.ts
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
```

- [ ] **Step 2: Run failing test**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm --filter web exec vitest run app/__tests__/ReportDisclosure.test.ts
```

Expected: fails with module-not-found.

- [ ] **Step 3: Implement component**

```vue
<!-- apps/web/app/components/ReportDisclosure.vue -->
<template>
  <details
    :open="isOpen"
    class="report-disclosure"
    @toggle="onToggle"
  >
    <summary>
      <span class="chevron" aria-hidden="true">▸</span>
      <span class="label">{{ label }}</span>
      <span v-if="badge" class="badge">{{ badge }}</span>
    </summary>
    <div class="body">
      <slot />
    </div>
  </details>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  mode: 'reader' | 'auditor'
  label: string
  badge?: string
}>()

const isOpen = ref(props.mode === 'auditor')

watch(
  () => props.mode,
  (next) => {
    isOpen.value = next === 'auditor'
  },
)

function onToggle(e: Event) {
  isOpen.value = (e.target as HTMLDetailsElement).open
}
</script>

<style scoped>
.report-disclosure {
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-card-alt, rgba(255, 255, 255, 0.02));
  margin: 12px 0;
  transition: border-color 0.15s ease;
}
.report-disclosure[open] {
  border-color: var(--border);
}
.report-disclosure > summary {
  list-style: none;
  cursor: pointer;
  padding: 9px 14px;
  font-size: 12.5px;
  color: var(--text-muted);
  user-select: none;
  display: flex;
  align-items: center;
  gap: 8px;
}
.report-disclosure > summary::-webkit-details-marker {
  display: none;
}
.report-disclosure > summary:focus-visible {
  outline: 2px solid var(--accent-green, #22c55e);
  outline-offset: -2px;
}
.report-disclosure > summary .chevron {
  color: var(--text-muted);
  font-size: 10px;
  transition: transform 0.15s ease;
  display: inline-block;
}
.report-disclosure[open] > summary .chevron {
  transform: rotate(90deg);
}
.report-disclosure > summary .label {
  flex: 1;
  color: var(--text-muted);
  font-weight: 500;
}
.report-disclosure[open] > summary .label {
  color: var(--text-secondary);
}
.report-disclosure > summary .badge {
  font-size: 10.5px;
  color: var(--text-muted);
  font-style: italic;
}
.report-disclosure > .body {
  padding: 0 14px 14px;
}
.report-disclosure > .body > :first-child {
  margin-top: 6px;
}
</style>
```

- [ ] **Step 4: Run passing test**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm --filter web exec vitest run app/__tests__/ReportDisclosure.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/ReportDisclosure.vue apps/web/app/__tests__/ReportDisclosure.test.ts
git commit -m "Add ReportDisclosure component (mode-aware <details> wrapper)"
```

---

## Task 5: ReportModeToggle component

**Files:**
- Create: `apps/web/app/components/ReportModeToggle.vue`
- Test: `apps/web/app/__tests__/ReportModeToggle.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/__tests__/ReportModeToggle.test.ts
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
```

- [ ] **Step 2: Run failing test**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm --filter web exec vitest run app/__tests__/ReportModeToggle.test.ts
```

Expected: fails with module-not-found.

- [ ] **Step 3: Implement component**

```vue
<!-- apps/web/app/components/ReportModeToggle.vue -->
<template>
  <div class="mode-toggle" role="group" aria-label="Report view mode">
    <button
      type="button"
      :aria-pressed="modelValue === 'reader' ? 'true' : 'false'"
      :class="['seg', 'reader', { active: modelValue === 'reader' }]"
      @click="emit('update:modelValue', 'reader')"
    >
      Reader
    </button>
    <button
      type="button"
      :aria-pressed="modelValue === 'auditor' ? 'true' : 'false'"
      :class="['seg', 'auditor', { active: modelValue === 'auditor' }]"
      @click="emit('update:modelValue', 'auditor')"
    >
      Auditor
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: 'reader' | 'auditor' }>()
const emit = defineEmits<{ 'update:modelValue': [value: 'reader' | 'auditor'] }>()
</script>

<style scoped>
.mode-toggle {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 999px;
  overflow: hidden;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.seg {
  padding: 4px 12px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border: 0;
  font: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  transition: background 0.15s ease, color 0.15s ease;
}
.seg:hover:not(.active) {
  color: var(--text-secondary);
  background: var(--surface-hover);
}
.seg:focus-visible {
  outline: 2px solid var(--accent-green, #22c55e);
  outline-offset: -2px;
}
.seg.reader.active {
  background: rgba(16, 185, 129, 0.15);
  color: rgb(110, 231, 183);
}
.seg.auditor.active {
  background: rgba(245, 158, 11, 0.15);
  color: rgb(252, 211, 77);
}
</style>
```

- [ ] **Step 4: Run passing test**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm --filter web exec vitest run app/__tests__/ReportModeToggle.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/ReportModeToggle.vue apps/web/app/__tests__/ReportModeToggle.test.ts
git commit -m "Add ReportModeToggle pill (Reader/Auditor v-model)"
```

---

## Task 6: ReportActionBanner component

**Files:**
- Create: `apps/web/app/components/ReportActionBanner.vue`
- Test: `apps/web/app/__tests__/ReportActionBanner.test.ts`

Copy table (deterministic, no LLM):

| Tally | Banner copy | Severity tint |
|---|---|---|
| `critical >= 1, moderate == 0, N == 1` | `1 critical issue must be fixed before publishing.` | red |
| `critical >= 1, moderate == 0, N > 1` | `N critical issues must be fixed before publishing.` | red |
| `critical >= 1, moderate >= 1` | `N critical and M moderate issues must be fixed before publishing.` | red |
| `critical == 0, moderate == 1` | `1 moderate issue found. Recommended to fix before publishing.` | yellow |
| `critical == 0, moderate > 1` | `M moderate issues found. Recommended to fix before publishing.` | yellow |
| `critical == 0, moderate == 0, minor == 1` | `1 minor issue found. Optional fixes — PDF passes Illinois accessibility.` | blue |
| `critical == 0, moderate == 0, minor > 1` | `K minor issues found. Optional fixes — PDF passes Illinois accessibility.` | blue |
| `critical + moderate + minor == 0, total > 0` | `This PDF passes Illinois IITAA + WCAG 2.1 AA accessibility checks.` | green |
| `total == 0` | (component renders nothing) | – |

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/__tests__/ReportActionBanner.test.ts
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
```

- [ ] **Step 2: Run failing test**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm --filter web exec vitest run app/__tests__/ReportActionBanner.test.ts
```

Expected: fails with module-not-found.

- [ ] **Step 3: Implement component**

```vue
<!-- apps/web/app/components/ReportActionBanner.vue -->
<template>
  <div v-if="copy" class="action-banner" :class="severityClass">
    {{ copy }}
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { tallySeverity } from '~/utils/severityTally'

const props = defineProps<{
  categories: Array<{ severity?: string | null }>
}>()

const tally = computed(() => tallySeverity(props.categories))

const copy = computed<string | null>(() => {
  const t = tally.value
  if (t.total === 0) return null

  if (t.critical > 0) {
    if (t.moderate > 0) {
      return `${t.critical} critical and ${t.moderate} moderate issues must be fixed before publishing.`
    }
    const noun = t.critical === 1 ? 'issue' : 'issues'
    return `${t.critical} critical ${noun} must be fixed before publishing.`
  }

  if (t.moderate > 0) {
    const noun = t.moderate === 1 ? 'issue' : 'issues'
    return `${t.moderate} moderate ${noun} found. Recommended to fix before publishing.`
  }

  if (t.minor > 0) {
    const noun = t.minor === 1 ? 'issue' : 'issues'
    return `${t.minor} minor ${noun} found. Optional fixes — PDF passes Illinois accessibility.`
  }

  return 'This PDF passes Illinois IITAA + WCAG 2.1 AA accessibility checks.'
})

const severityClass = computed(() => {
  const t = tally.value
  if (t.critical > 0) return 'critical'
  if (t.moderate > 0) return 'moderate'
  if (t.minor > 0) return 'minor'
  return 'pass'
})
</script>

<style scoped>
.action-banner {
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 13.5px;
  font-weight: 600;
  border: 1px solid;
}
.action-banner.critical {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.05);
  color: rgb(252, 165, 165);
}
.action-banner.moderate {
  border-color: rgba(234, 179, 8, 0.3);
  background: rgba(234, 179, 8, 0.05);
  color: rgb(253, 224, 71);
}
.action-banner.minor {
  border-color: rgba(59, 130, 246, 0.3);
  background: rgba(59, 130, 246, 0.05);
  color: rgb(147, 197, 253);
}
.action-banner.pass {
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.05);
  color: rgb(134, 239, 172);
}
</style>
```

- [ ] **Step 4: Run passing test**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm --filter web exec vitest run app/__tests__/ReportActionBanner.test.ts
```

Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/ReportActionBanner.vue apps/web/app/__tests__/ReportActionBanner.test.ts
git commit -m "Add ReportActionBanner with severity-keyed copy"
```

---

## Task 7: IssuesSummary component

**Files:**
- Create: `apps/web/app/components/IssuesSummary.vue`
- Test: `apps/web/app/__tests__/IssuesSummary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/__tests__/IssuesSummary.test.ts
import './test-helpers'
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IssuesSummary from '../components/IssuesSummary.vue'

const mkCat = (id: string, label: string, severity: string | null, findings: string[] = []) => ({
  id, label, severity, findings,
})

describe('IssuesSummary', () => {
  it('renders nothing when no Critical/Moderate/Minor categories present', () => {
    const wrapper = mount(IssuesSummary, {
      props: {
        categories: [
          mkCat('a', 'Alpha', 'Pass', ['ok']),
          mkCat('b', 'Beta', null, []),
        ],
      },
    })
    expect(wrapper.text()).toBe('')
  })

  it('orders rows Critical, Moderate, Minor regardless of input order', () => {
    const wrapper = mount(IssuesSummary, {
      props: {
        categories: [
          mkCat('m1', 'Reading Order', 'Moderate', ['2 pages reorder columns']),
          mkCat('c1', 'Alt Text on Images', 'Critical', ['5 images with no alt text']),
          mkCat('mi1', 'Bookmarks', 'Minor', ['Some bookmarks missing']),
          mkCat('c2', 'Document Title', 'Critical', ['Title metadata blank']),
          mkCat('p1', 'Bookmarks', 'Pass', ['ok']),
        ],
      },
    })
    const rows = wrapper.findAll('li')
    expect(rows.length).toBe(4)
    expect(rows[0]!.text()).toContain('Alt Text on Images')
    expect(rows[1]!.text()).toContain('Document Title')
    expect(rows[2]!.text()).toContain('Reading Order')
    expect(rows[3]!.text()).toContain('Bookmarks')
  })

  it('renders the first actionable finding as the row summary', () => {
    const wrapper = mount(IssuesSummary, {
      props: {
        categories: [
          mkCat('c1', 'Alt Text on Images', 'Critical', [
            '--- Detected images ---',
            '  Page 3: 200x150 figure',
            'Fix: add alt text in Acrobat',
            '5 images with no alt text',
          ]),
        ],
      },
    })
    expect(wrapper.find('li').text()).toContain('5 images with no alt text')
  })

  it('renders jump anchor href as #cat-<id>', () => {
    const wrapper = mount(IssuesSummary, {
      props: {
        categories: [
          mkCat('alt_text_images', 'Alt Text', 'Critical', ['x']),
        ],
      },
    })
    const a = wrapper.find('a')
    expect(a.exists()).toBe(true)
    expect(a.attributes('href')).toBe('#cat-alt_text_images')
  })

  it('excludes Pass and null severity categories', () => {
    const wrapper = mount(IssuesSummary, {
      props: {
        categories: [
          mkCat('p', 'P', 'Pass', ['x']),
          mkCat('n', 'N', null, ['x']),
          mkCat('c', 'C', 'Critical', ['x']),
        ],
      },
    })
    expect(wrapper.findAll('li').length).toBe(1)
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm --filter web exec vitest run app/__tests__/IssuesSummary.test.ts
```

Expected: fails with module-not-found.

- [ ] **Step 3: Implement component**

```vue
<!-- apps/web/app/components/IssuesSummary.vue -->
<template>
  <div v-if="rows.length" class="issues-summary">
    <h2 class="title">Issues to fix</h2>
    <p class="subtitle">Sorted by severity. Click a row to jump to its fix steps.</p>
    <ul class="rows">
      <li
        v-for="row in rows"
        :key="row.id"
        :class="['row', `sev-${row.sevClass}`]"
      >
        <span :class="['sev', `sev-${row.sevClass}`]">{{ row.severity }}</span>
        <span class="name">{{ row.label }}</span>
        <span class="summary">{{ row.summary }}</span>
        <a :href="`#cat-${row.id}`" class="jump" @click.prevent="onJump(row.id)">↓ Fix steps</a>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { firstActionableFinding } from '~/utils/findings'

const props = defineProps<{
  categories: Array<{
    id: string
    label: string
    severity?: string | null
    findings?: string[]
  }>
}>()

const SEVERITY_RANK: Record<string, number> = {
  Critical: 0,
  Moderate: 1,
  Minor: 2,
}

const rows = computed(() => {
  return (props.categories || [])
    .filter((c) => c.severity === 'Critical' || c.severity === 'Moderate' || c.severity === 'Minor')
    .map((c) => ({
      id: c.id,
      label: c.label,
      severity: c.severity as 'Critical' | 'Moderate' | 'Minor',
      sevClass: (c.severity as string).toLowerCase(),
      summary: firstActionableFinding(c.findings),
    }))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
})

function onJump(catId: string) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(`cat-${catId}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}
</script>

<style scoped>
.issues-summary {
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface-card);
  padding: 16px 18px;
}
.title {
  color: var(--text-heading);
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}
.subtitle {
  color: var(--text-muted);
  font-size: 11.5px;
  margin: 2px 0 10px;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 10px;
  background: var(--surface-deep);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  font-size: 12px;
}
.sev {
  font-size: 10.5px;
  padding: 1px 7px;
  border-radius: 999px;
  flex: 0 0 auto;
  font-weight: 600;
}
.sev.sev-critical { background: rgba(239,68,68,0.12); color: rgb(252,165,165); }
.sev.sev-moderate { background: rgba(234,179,8,0.12); color: rgb(253,224,71); }
.sev.sev-minor    { background: rgba(59,130,246,0.12); color: rgb(147,197,253); }
.name { color: var(--text-secondary); font-weight: 500; flex: 0 0 auto; }
.summary {
  color: var(--text-muted);
  font-size: 11.5px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jump {
  color: var(--link, #3b82f6);
  font-size: 11.5px;
  flex: 0 0 auto;
  text-decoration: none;
}
.jump:hover { text-decoration: underline; }
.jump:focus-visible { outline: 2px solid var(--accent-green, #22c55e); outline-offset: 2px; border-radius: 2px; }
</style>
```

- [ ] **Step 4: Run passing test**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm --filter web exec vitest run app/__tests__/IssuesSummary.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/components/IssuesSummary.vue apps/web/app/__tests__/IssuesSummary.test.ts
git commit -m "Add IssuesSummary severity-ordered punch list with jump anchors"
```

---

## Task 8: Wire mode + toggle + new blocks into `pages/report/[id].vue`

**Files:**
- Modify: `apps/web/app/pages/report/[id].vue`

This task adds the `useReportMode` call, mounts `<ReportModeToggle>` next to the existing dark-mode button, renders `<ReportActionBanner>` and `<IssuesSummary>`, and adds anchor IDs to each Detailed Findings card. No disclosure wrapping yet — that's Task 9 (page-level) and Task 10 (per-card).

- [ ] **Step 1: Read current state of the page**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && wc -l apps/web/app/pages/report/\[id\].vue
```

Expected: ~1252 lines (post-v1.16.3, after the gradeColors fix).

- [ ] **Step 2: Add the mode setup and import the new components**

In the `<script setup lang="ts">` block (currently starts around line 981 with `import { getWcagCriteria } from "~/utils/wcag";`), add the new imports right after the existing ones and call `useReportMode` near the top of the setup body. Replace:

```ts
import { getWcagCriteria } from "~/utils/wcag";
import ModeCompareBox from "~/components/ModeCompareBox.vue";
import NaCell from "~/components/NaCell.vue";
import {
  type ScoringMode,
  categoriesForScoringMode,
  MODE_BUTTON_LABELS,
} from "~/utils/scoringProfiles";

definePageMeta({ layout: false });

const route = useRoute();
const id = route.params.id as string;
const config = useRuntimeConfig();
const auditUrl = config.public.siteUrl as string;
const appName = config.public.appName as string;
const colorMode = useColorMode();
```

with (only the lines under the existing imports change — keep the imports themselves):

```ts
import { getWcagCriteria } from "~/utils/wcag";
import ModeCompareBox from "~/components/ModeCompareBox.vue";
import NaCell from "~/components/NaCell.vue";
import ReportModeToggle from "~/components/ReportModeToggle.vue";
import ReportActionBanner from "~/components/ReportActionBanner.vue";
import IssuesSummary from "~/components/IssuesSummary.vue";
import {
  type ScoringMode,
  categoriesForScoringMode,
  MODE_BUTTON_LABELS,
} from "~/utils/scoringProfiles";
import { useReportMode } from "~/composables/useReportMode";

definePageMeta({ layout: false });

const route = useRoute();
const id = route.params.id as string;
const config = useRuntimeConfig();
const auditUrl = config.public.siteUrl as string;
const appName = config.public.appName as string;
const colorMode = useColorMode();

const { mode } = useReportMode({ persist: false });
```

- [ ] **Step 3: Mount the mode toggle next to the dark-mode button**

The existing dark-mode button container is around line 28-67:

```html
        <div class="text-center mb-8">
          <div class="flex justify-end mb-4">
            <button
              class="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
              :aria-label="
                colorMode.value === 'dark'
                  ? 'Switch to light mode'
                  : 'Switch to dark mode'
              "
              @click="toggleColorMode"
            >
              ...svg paths...
            </button>
          </div>
```

Change the `<div class="flex justify-end mb-4">` line to:

```html
          <div class="flex justify-end items-center gap-2 mb-4">
            <ReportModeToggle v-model="mode" />
            <button
```

(Leave the rest of the button alone.)

- [ ] **Step 4: Render the action banner and issues summary after the score hero**

The score hero block ends around line 100 with `</ScoreCard>`. Insert the two new blocks immediately after the `</div>` that closes `<!-- Score Hero -->`, before the `<!-- Scanned warning -->` block. Replace:

```html
        <!-- Score Hero -->
        <div
          class="text-center mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-8"
        >
          <ScoreCard
            v-model:selected-mode="selectedScoreMode"
            :result="(data as any).report"
          />
        </div>

        <!-- Scanned warning -->
```

with:

```html
        <!-- Score Hero -->
        <div
          class="text-center mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4 sm:p-8"
        >
          <ScoreCard
            v-model:selected-mode="selectedScoreMode"
            :result="(data as any).report"
          />
        </div>

        <ReportActionBanner
          v-if="data?.report?.categories"
          :categories="(data as any).report.categories"
          class="mb-4"
        />

        <IssuesSummary
          v-if="data?.report?.categories"
          :categories="(data as any).report.categories"
          class="mb-8"
        />

        <!-- Scanned warning -->
```

- [ ] **Step 5: Add anchor IDs to each Detailed Findings card**

The `v-for="cat in scoredCategories"` loop is around line 497. Locate:

```html
          <div
            v-for="cat in scoredCategories"
            :key="cat.id"
            class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-3 sm:p-5"
          >
```

Change to:

```html
          <div
            v-for="cat in scoredCategories"
            :key="cat.id"
            :id="`cat-${cat.id}`"
            class="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-3 sm:p-5"
          >
```

(One added line: the `:id` binding.)

- [ ] **Step 6: Verify the page still renders**

The dev servers are already running (api: 5103, web: 5102). Confirm:

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && curl -sS -o /dev/null -w "STATUS:%{http_code}\nLEN:%{size_download}\n" "http://localhost:5102/report/8e2d0b2ff14cc45f040785ad985b7e2d"
```

Expected: `STATUS:200`, `LEN:` greater than the previous size by ~1–2 KB (the new banner + summary + toggle markup).

If you don't have the row seeded, re-run the seed step from the v1.16.3 fix:

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && cat > apps/api/seed-report.mjs <<'EOF'
import Database from 'better-sqlite3'
import { readFileSync, existsSync } from 'node:fs'
const dbPath = process.argv[2] || './data/audit.db'
if (!existsSync('/tmp/prod-report.json')) {
  console.error('Missing /tmp/prod-report.json — re-fetch from prod first')
  process.exit(1)
}
const payload = JSON.parse(readFileSync('/tmp/prod-report.json', 'utf8'))
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
const id = '8e2d0b2ff14cc45f040785ad985b7e2d'
db.prepare('DELETE FROM shared_reports WHERE id = ?').run(id)
db.prepare('INSERT INTO shared_reports (id, email, filename, report_json, expires_at, created_at) VALUES (?,?,?,?,?,?)')
  .run(id, payload.sharedBy || 'anonymous', payload.report.filename, JSON.stringify(payload.report),
       payload.expiresAt || new Date(Date.now() + 15*86400*1000).toISOString(),
       payload.createdAt || new Date().toISOString())
console.log('Seeded:', id)
db.close()
EOF
cd apps/api && node seed-report.mjs ./data/audit.db && rm seed-report.mjs && cd ../..
```

If `/tmp/prod-report.json` is missing:

```bash
curl -sS "https://audit.icjia.app/api/reports/8e2d0b2ff14cc45f040785ad985b7e2d" -o /tmp/prod-report.json
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/pages/report/\[id\].vue
git commit -m "Add Reader/Auditor toggle, action banner, issues summary on /report/:id"
```

---

## Task 9: Wrap five page-level optional blocks in `<ReportDisclosure>` on `pages/report/[id].vue`

**Files:**
- Modify: `apps/web/app/pages/report/[id].vue`

The five blocks to wrap, in render order, with their disclosure labels:

| Block | Approximate template location | Label | Badge |
|---|---|---|---|
| Methodology block (`How Scores Are Derived`) | ~lines 128-221 | `Methodology and scoring sources` | `QPDF · pdf.js · WCAG 2.1 AA · ADA Title II` |
| Strict-vs-Practical explainer paragraph (above Category Scores) | ~lines 276-319 | `How Strict and Practical differ` | (none) |
| Adobe Parity card (`<AdobeParityCard>`) | ~lines 223-226 | `How Adobe Acrobat would score this` | `32-rule reconciliation` |
| PDF Metadata block | ~lines 455-489 | `Document metadata` | `creator · producer · author · dates` |
| Not Included in Scoring section | ~lines 770-860 | `Categories not included in scoring` | (none) |

Each wrap follows the same pattern:

```html
<!-- BEFORE -->
<div class="...the existing block markup...">
  ...content...
</div>

<!-- AFTER -->
<ReportDisclosure :mode="mode" label="Block label" badge="Optional badge">
  <div class="...the existing block markup...">
    ...content...
  </div>
</ReportDisclosure>
```

The Strict/Practical explainer is a `<p>` rather than a `<div>`; wrap it the same way.

- [ ] **Step 1: Wrap the Methodology block**

Locate the block that starts with the comment `<!-- Methodology -->` and `<div class="mb-8 rounded-xl border border-[var(--border-alt)] ...`. The block contains a heading "How Scores Are Derived", two tool badges (QPDF, PDF.js), and the closing paragraph about "Nine categories are weighted by impact…".

Wrap the entire block (the `<div class="mb-8 rounded-xl border ...` element) inside:

```html
        <ReportDisclosure
          :mode="mode"
          label="Methodology and scoring sources"
          badge="QPDF · pdf.js · WCAG 2.1 AA · ADA Title II"
          class="mb-8"
        >
          <!-- existing methodology div + contents stays here, unchanged -->
        </ReportDisclosure>
```

Remove `mb-8` from the existing `class` of the inner div if both have it (avoid double margin). Quickest: keep `mb-8` only on the `<ReportDisclosure>` wrapper, drop it from the original div's class.

- [ ] **Step 2: Wrap the Strict-vs-Practical explainer paragraph**

Locate the `<p v-if="data.report.scoreProfiles?.remediation" class="mt-2 text-xs text-[var(--text-muted)]">` paragraph that contains the `<template v-if="remediationModeActive">` and `<template v-else>` branches. It currently sits inside the Category Scores card header.

Wrap that single `<p>` element:

```html
        <ReportDisclosure
          v-if="data?.report?.scoreProfiles?.remediation"
          :mode="mode"
          label="How Strict and Practical differ"
          class="mt-2"
        >
          <p class="text-xs text-[var(--text-muted)]">
            <!-- existing template v-if / v-else branches stay here -->
          </p>
        </ReportDisclosure>
```

(Remove the `v-if="data.report.scoreProfiles?.remediation"` and the `mt-2` from the inner paragraph since the wrapper now owns those. Keep the rest of the paragraph content intact.)

- [ ] **Step 3: Wrap the Adobe Parity card**

The current usage is short:

```html
        <!-- Adobe Acrobat parity — a third view alongside Strict and Practical. -->
        <div v-if="data.report.adobeParity" class="mb-8">
          <AdobeParityCard :parity="data.report.adobeParity" />
        </div>
```

Replace with:

```html
        <ReportDisclosure
          v-if="data?.report?.adobeParity"
          :mode="mode"
          label="How Adobe Acrobat would score this"
          badge="32-rule reconciliation"
          class="mb-8"
        >
          <AdobeParityCard :parity="data.report.adobeParity" />
        </ReportDisclosure>
```

- [ ] **Step 4: Wrap the PDF Metadata block**

Locate the block that starts with `<!-- PDF Metadata -->` and `<div v-if="data.report.pdfMetadata" class="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] overflow-hidden">`. Wrap it:

```html
        <ReportDisclosure
          v-if="data?.report?.pdfMetadata"
          :mode="mode"
          label="Document metadata"
          badge="creator · producer · author · dates"
          class="mb-8"
        >
          <!-- existing div + its inner content stays here unchanged -->
        </ReportDisclosure>
```

Drop the `mb-8` from the inner div's class so it doesn't double up.

- [ ] **Step 5: Wrap the "Not Included in Scoring" section**

Locate the block that starts with `<!-- Not Included in Scoring -->` and `<div v-if="naCategories.length">`. Wrap that entire `<div v-if="naCategories.length">` element:

```html
        <ReportDisclosure
          v-if="naCategories.length"
          :mode="mode"
          label="Categories not included in scoring"
          class="mt-8"
        >
          <!-- existing div + its content stays here unchanged -->
        </ReportDisclosure>
```

Drop the redundant `mt-8` if present on the inner div.

- [ ] **Step 6: Verify the page renders correctly in Reader mode**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && curl -sS -o /dev/null -w "STATUS:%{http_code}\n" "http://localhost:5102/report/8e2d0b2ff14cc45f040785ad985b7e2d"
```

Expected: `STATUS:200`. Manually open in browser: confirm Methodology, Adobe parity, PDF metadata, and Not-Included-in-Scoring sections render as collapsed disclosures with their labels visible. Confirm clicking a disclosure expands it. Confirm clicking the toggle to Auditor opens all of them at once.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/pages/report/\[id\].vue
git commit -m "Wrap page-level optional blocks in ReportDisclosure on /report/:id"
```

---

## Task 10: Wrap per-card optional blocks in `<ReportDisclosure>` on `pages/report/[id].vue`

**Files:**
- Modify: `apps/web/app/pages/report/[id].vue`

Inside the Detailed Findings `v-for="cat in scoredCategories"` loop (around lines 497-768), three sub-blocks per card need wrapping:

| Block | Existing condition | Disclosure label | Badge expression |
|---|---|---|---|
| `<p v-if="cat.explanation">` "What this checks" paragraph | `cat.explanation` | `What this category checks` | (none) |
| `<div v-if="getWcagCriteria(cat.id).length && cat.score !== null">` WCAG references panel | `getWcagCriteria(cat.id).length && cat.score !== null` | `WCAG 2.1 references` | `${getWcagCriteria(cat.id).length} success criteria` |
| `<div v-if="cat.helpLinks?.length">` "Learn more" pill links | `cat.helpLinks?.length` | `Learn more` | `${cat.helpLinks.length} reference links` |

Pattern for each: keep the existing `v-if` on the wrapper (so empty content doesn't render an empty disclosure); preserve the inner block exactly.

- [ ] **Step 1: Wrap the "What this checks" paragraph**

Locate inside the `v-for="cat in scoredCategories"` loop:

```html
            <p
              v-if="cat.explanation"
              class="text-sm text-[var(--text-secondary)] bg-[var(--surface-deep)] rounded-lg px-4 py-3 border border-[var(--border-subtle)] mb-3"
            >
              <span class="text-[var(--text-muted)] font-medium"
                >What this checks:</span
              >
              {{ cat.explanation }}
            </p>
```

Replace with:

```html
            <ReportDisclosure
              v-if="cat.explanation"
              :mode="mode"
              label="What this category checks"
              class="mb-3"
            >
              <p class="text-sm text-[var(--text-secondary)] bg-[var(--surface-deep)] rounded-lg px-4 py-3 border border-[var(--border-subtle)]">
                {{ cat.explanation }}
              </p>
            </ReportDisclosure>
```

(The "What this checks:" lede inside the paragraph is dropped — the disclosure label replaces it.)

- [ ] **Step 2: Wrap the WCAG references panel**

Locate inside the loop:

```html
            <div
              v-if="getWcagCriteria(cat.id).length && cat.score !== null"
              class="mt-4 rounded-lg border border-indigo-500/30 bg-indigo-500/5 overflow-hidden"
            >
              <!-- ...indigo header + ul of criteria... -->
            </div>
```

Replace with:

```html
            <ReportDisclosure
              v-if="getWcagCriteria(cat.id).length && cat.score !== null"
              :mode="mode"
              label="WCAG 2.1 references"
              :badge="`${getWcagCriteria(cat.id).length} success ${getWcagCriteria(cat.id).length === 1 ? 'criterion' : 'criteria'}`"
              class="mt-4"
            >
              <div class="rounded-lg border border-indigo-500/30 bg-indigo-500/5 overflow-hidden">
                <!-- ...preserve the original indigo header + ul intact... -->
              </div>
            </ReportDisclosure>
```

(Drop the `mt-4` from the inner div since the wrapper owns it.)

- [ ] **Step 3: Wrap the "Learn more" pill links strip**

Locate inside the loop:

```html
            <div
              v-if="cat.helpLinks?.length"
              class="mt-3 pt-3 border-t border-[var(--border-subtle)]"
            >
              <span
                class="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide"
                >Learn more</span
              >
              <div class="mt-2 flex flex-wrap gap-2">
                <!-- ...pill <a> elements... -->
              </div>
            </div>
```

Replace with:

```html
            <ReportDisclosure
              v-if="cat.helpLinks?.length"
              :mode="mode"
              label="Learn more"
              :badge="`${cat.helpLinks.length} reference ${cat.helpLinks.length === 1 ? 'link' : 'links'}`"
              class="mt-3"
            >
              <div class="flex flex-wrap gap-2">
                <!-- ...preserve the original pill <a> elements intact... -->
              </div>
            </ReportDisclosure>
```

(Drop the redundant `<span>Learn more</span>` since the disclosure label replaces it. Drop the `mt-3 pt-3 border-t border-[var(--border-subtle)]` from the inner div — the wrapper provides separation.)

- [ ] **Step 4: Apply the same three wraps inside the "Not Included in Scoring" loop**

The `v-for="cat in naCategories"` loop (now itself inside a disclosure wrapper from Task 9 step 5) has the same three patterns: `cat.explanation` paragraph, and `cat.helpLinks?.length` pill links. (No WCAG references panel in N/A categories, since `cat.score` is null disables that branch.)

Apply the same wraps from Steps 1 and 3 inside the N/A loop. Preserve existing markup verbatim, only the wrappers change.

- [ ] **Step 5: Verify the page renders correctly in both modes**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && curl -sS -o /dev/null -w "STATUS:%{http_code}\n" "http://localhost:5102/report/8e2d0b2ff14cc45f040785ad985b7e2d"
```

Expected: `STATUS:200`. In a browser: confirm each Detailed Findings card now shows three labeled disclosures ("What this category checks", "WCAG 2.1 references — N success criteria", "Learn more — N reference links"), all collapsed in Reader. Toggle to Auditor and confirm all three open across every card.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/pages/report/\[id\].vue
git commit -m "Wrap per-card optional blocks in ReportDisclosure on /report/:id"
```

---

## Task 11: Apply the same changes to `pages/index.vue` (post-upload page)

**Files:**
- Modify: `apps/web/app/pages/index.vue`

This page contains the same post-analysis report layout, so the same nine wrappings apply (five page-level + three per-card + the toggle/banner/summary additions). Two differences from `pages/report/[id].vue`:

1. **Persist the mode**: call `useReportMode({ persist: true })` (instead of `false`).
2. **Toggle visibility**: only show the toggle and the new blocks once the analysis result is present (the page renders an upload UI before analysis runs). Gate the new blocks on the same condition the page already uses to render the "Detailed Findings" section — find the existing `v-if` (e.g., `v-if="result"` or whatever ref name the page uses; inspect the page to confirm).

### Pattern recap (so this task is self-contained)

**Page-level disclosure wrap pattern:** for any block that should collapse in Reader and stay open in Auditor, replace the existing block with:

```html
<ReportDisclosure
  v-if="<existing condition, if any>"
  :mode="mode"
  label="<short human label>"
  badge="<optional secondary line>"
  class="<existing margin classes from the wrapped block>"
>
  <!-- existing markup, unchanged inside, with redundant outer margin/v-if removed -->
</ReportDisclosure>
```

**Per-card disclosure wrap pattern:** inside the `v-for` over scored categories, replace the inline "What this checks" paragraph, the WCAG references panel, and the "Learn more" pill links each with their own `<ReportDisclosure>` wrapper, preserving the existing render condition on the wrapper. The Adobe Acrobat fix-steps panel is **not** wrapped — it stays inline in both modes.

- [ ] **Step 1: Read the page and locate the post-analysis section**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && wc -l apps/web/app/pages/index.vue && grep -nE 'definePageMeta|useColorMode|toggleColorMode|"Score|<ScoreCard' apps/web/app/pages/index.vue | head -20
```

This identifies the result-section markers. The page is 3200+ lines; the analysis-result render section is the bottom half.

- [ ] **Step 2: Add imports + composable call**

Find the existing imports in `<script setup>`. Add (matching the imports already present, do not duplicate `getWcagCriteria` if already imported):

```ts
import ReportModeToggle from "~/components/ReportModeToggle.vue";
import ReportActionBanner from "~/components/ReportActionBanner.vue";
import IssuesSummary from "~/components/IssuesSummary.vue";
import { useReportMode } from "~/composables/useReportMode";
```

In the setup body, after the existing top-level state declarations, add:

```ts
const { mode } = useReportMode({ persist: true });
```

- [ ] **Step 3: Mount `<ReportModeToggle>` adjacent to the existing dark-mode button**

Locate the dark-mode toggle button in this page's header (search for `toggleColorMode` to find its container). Insert `<ReportModeToggle v-model="mode" />` next to it inside the same flex row, gated so the toggle only appears once a report is loaded. The pattern:

```html
<div class="flex justify-end items-center gap-2 mb-4" v-if="<result-loaded condition>">
  <ReportModeToggle v-model="mode" />
  <button @click="toggleColorMode" ...>...existing dark-mode button unchanged...</button>
</div>
```

If the existing container does not currently render conditionally (e.g., the dark-mode button is always visible), wrap only the `<ReportModeToggle>` itself in `v-if`:

```html
<ReportModeToggle v-if="<result-loaded condition>" v-model="mode" />
```

so the dark-mode button remains visible in the upload state.

- [ ] **Step 4: Render `<ReportActionBanner>` and `<IssuesSummary>` after the score hero**

Find the `<ScoreCard ... />` usage in this page. Insert immediately after the Score hero block, gated on the result being present (use the same gating condition the page already uses elsewhere, e.g., `v-if="result?.categories"`):

```html
        <ReportActionBanner
          v-if="result?.categories"
          :categories="result.categories"
          class="mb-4"
        />

        <IssuesSummary
          v-if="result?.categories"
          :categories="result.categories"
          class="mb-8"
        />
```

(Substitute the actual ref name the page uses for the analysis result — confirm by inspecting the page; common names in this codebase include `result`, `analysisResult`, or `report`.)

- [ ] **Step 5: Add anchor IDs to each Detailed Findings card**

Find this page's `v-for` over the scored categories (search for `v-for="cat in scoredCategories"` or similar — the page uses the same naming convention as `report/[id].vue`). Add `:id="`cat-${cat.id}`"` to the per-card root element:

```html
<div
  v-for="cat in scoredCategories"
  :key="cat.id"
  :id="`cat-${cat.id}`"
  class="...existing classes..."
>
```

If the page also has a separate `v-for="cat in naCategories"` loop for the N/A section, add the same `:id` binding to its per-card root element.

- [ ] **Step 6: Wrap the five page-level optional blocks in `<ReportDisclosure>`**

Using the page-level wrap pattern at the top of this task, wrap each of the following five blocks where they appear in `pages/index.vue`. The labels and badges are identical to those used on `pages/report/[id].vue`:

| Block to find | Disclosure label | Badge |
|---|---|---|
| Methodology block (the "How Scores Are Derived" surface — search for that string in the page) | `Methodology and scoring sources` | `QPDF · pdf.js · WCAG 2.1 AA · ADA Title II` |
| Strict-vs-Practical explainer paragraph above the Category Scores table (search for `remediationModeActive` or the `<template v-if="remediationModeActive">` block) | `How Strict and Practical differ` | (none) |
| `<AdobeParityCard :parity="..."` usage | `How Adobe Acrobat would score this` | `32-rule reconciliation` |
| PDF Metadata surface (search for `pdfMetadata` template references) | `Document metadata` | `creator · producer · author · dates` |
| Not-Included-in-Scoring section (`v-if="naCategories.length"` outer wrapper) | `Categories not included in scoring` | (none) |

For each: keep any existing `v-if` on the wrapper, drop redundant outer margins from the inner block since the wrapper now owns spacing.

- [ ] **Step 7: Wrap the three per-card optional blocks in `<ReportDisclosure>`**

Inside the `v-for="cat in scoredCategories"` loop, apply the per-card wrap pattern at the top of this task to each of:

**(a) "What this checks" paragraph** — find `<p v-if="cat.explanation"`:

```html
<ReportDisclosure
  v-if="cat.explanation"
  :mode="mode"
  label="What this category checks"
  class="mb-3"
>
  <p class="text-sm text-[var(--text-secondary)] bg-[var(--surface-deep)] rounded-lg px-4 py-3 border border-[var(--border-subtle)]">
    {{ cat.explanation }}
  </p>
</ReportDisclosure>
```

(Drop the inline `<span>What this checks:</span>` lede — the disclosure label replaces it.)

**(b) WCAG references panel** — find `<div v-if="getWcagCriteria(cat.id).length && cat.score !== null"`:

```html
<ReportDisclosure
  v-if="getWcagCriteria(cat.id).length && cat.score !== null"
  :mode="mode"
  label="WCAG 2.1 references"
  :badge="`${getWcagCriteria(cat.id).length} success ${getWcagCriteria(cat.id).length === 1 ? 'criterion' : 'criteria'}`"
  class="mt-4"
>
  <div class="rounded-lg border border-indigo-500/30 bg-indigo-500/5 overflow-hidden">
    <!-- preserve the indigo header + ul of criteria intact -->
  </div>
</ReportDisclosure>
```

**(c) "Learn more" pill links** — find `<div v-if="cat.helpLinks?.length"`:

```html
<ReportDisclosure
  v-if="cat.helpLinks?.length"
  :mode="mode"
  label="Learn more"
  :badge="`${cat.helpLinks.length} reference ${cat.helpLinks.length === 1 ? 'link' : 'links'}`"
  class="mt-3"
>
  <div class="flex flex-wrap gap-2">
    <!-- preserve the pill <a> elements intact -->
  </div>
</ReportDisclosure>
```

(Drop the redundant `<span>Learn more</span>` inline label and the original `mt-3 pt-3 border-t` outer styles since the wrapper provides separation.)

If the page also has a `v-for="cat in naCategories"` loop, repeat patterns (a) and (c) inside it. (Pattern (b) does not apply to N/A categories because `cat.score === null`.)

- [ ] **Step 8: Verify the post-upload page renders**

Restart the web dev server if it's been running long:

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && curl -sS -o /dev/null -w "STATUS:%{http_code}\n" "http://localhost:5102/"
```

Expected: `STATUS:200` for the empty upload state.

Manually upload a real PDF via the browser UI at `http://localhost:5102/`, confirm the post-analysis report renders with the toggle visible and Reader as the default. Toggle to Auditor; refresh the page; confirm the page comes back up in Auditor (localStorage stickiness). Toggle back to Reader; refresh; confirm Reader sticks.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/pages/index.vue
git commit -m "Apply Reader/Auditor toggle + disclosures to post-upload page"
```

---

## Task 12: Run full test suite + production build

**Files:**
- (verification only)

- [ ] **Step 1: Run vitest**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm --filter web exec vitest run
```

Expected: all existing tests still pass, plus the new tests added in Tasks 1-7. If any existing test fails because it scanned source for strings that have moved (e.g., the `accessibility.test.ts` source-grep check for "Learn more" presence), update the test to reflect the new structure. Source-grep tests that verified an inline label may need to verify the disclosure label instead.

- [ ] **Step 2: Run production build to catch tsc errors**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && pnpm build
```

Expected: builds cleanly, no `tsc --noEmit` errors. If there are type errors in the new components or pages, fix them inline. Common issues: untyped `any` on `categories` or `cat` accesses; if the existing pages already use `(data as any).report.categories`, follow that local convention rather than tightening types in this branch.

- [ ] **Step 3: Manual SSR verification on `/report/:id`**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && curl -sS -o /tmp/branch-verify.html -w "STATUS:%{http_code}\nLEN:%{size_download}\n" "http://localhost:5102/report/8e2d0b2ff14cc45f040785ad985b7e2d"
```

Expected: `STATUS:200`. Reader is the default on `/report/:id`, so `LEN:` should be smaller than the pre-branch baseline (the v1.16.3 page returned ~243KB; expect roughly 140KB-180KB in Reader since the disclosed bodies render but their visual chrome is reduced). The body should contain the literal markers `Issues to fix`, the action banner copy substring `must be fixed before publishing` (or another severity-keyed substring depending on the seeded fixture), and at least one disclosure summary like `Methodology and scoring sources`.

```bash
grep -c "Issues to fix\|must be fixed\|Methodology and scoring sources" /tmp/branch-verify.html
```

Expected: 3 or more matches.

- [ ] **Step 4: Visual confirmation in browser**

Open `http://localhost:5102/report/8e2d0b2ff14cc45f040785ad985b7e2d` in a real browser. Confirm:

- Reader is the default. The page is noticeably shorter than the previous version.
- The action banner appears under the score hero with the correct severity tint.
- The Issues to fix list appears under the banner with rows in Critical → Moderate → Minor order.
- Clicking a `↓ Fix steps` jump anchor smooth-scrolls to the right Detailed Findings card and the Adobe Acrobat fix steps panel is visible inline (not collapsed).
- The five page-level disclosures are collapsed and labeled correctly.
- Toggling to Auditor opens every disclosure simultaneously and the page matches today's layout.
- Refreshing the shareable page returns to Reader (localStorage is ignored on this page).
- Dark mode still works; the toggle button position is unchanged.

- [ ] **Step 5: Lighthouse accessibility audit (the page being itself accessible matters)**

The user has a configured `lightcap` MCP server (per their global `~/.claude/CLAUDE.md` preferences for Lighthouse audits). Run an accessibility audit against the local app in both modes:

```
mcp__lightcap__run_a11y(url="http://localhost:5102/report/8e2d0b2ff14cc45f040785ad985b7e2d")
```

Expected: a11y score ≥ 95. If the new disclosure widget triggers any accessibility regression (e.g., missing `aria-label` on the chevron, summary not announcing collapsed/expanded state, or color-contrast on the new mode toggle), fix in `ReportDisclosure.vue` or `ReportModeToggle.vue` and re-run.

- [ ] **Step 6: Commit any post-verification fixes (if needed)**

```bash
git add -A
git commit -m "Address verification findings (test fixes / a11y polish)"
```

If no changes were needed, skip this commit.

---

## Task 13: Document the redesign in CHANGELOG (no version bump yet)

**Files:**
- Modify: `CHANGELOG.md`

This task adds an `[Unreleased]` entry for the branch's work. Version bump and the `dateModified` update happen at merge time, not now (the user wants to vet on the branch first).

- [ ] **Step 1: Read the top of the changelog**

```bash
cd /Volumes/satechi/webdev/file-accessibility-audit && head -30 CHANGELOG.md
```

- [ ] **Step 2: Add the [Unreleased] section**

Insert directly under the introductory paragraph (line 5 area), before `## [1.16.3]`:

```markdown
## [Unreleased] — feature/reader-auditor-toggle

### Added — Reader / Auditor view modes

A page-level Reader / Auditor toggle on the post-upload page and the shareable-report page collapses optional blocks (methodology, the Adobe Acrobat parity card, PDF metadata, the Strict-vs-Practical explainer paragraph, the per-card "What this checks" copy, the WCAG references panel, and the Learn-more pill links) behind labeled disclosures in Reader mode. Auditor preserves today's layout exactly — every existing block, badge, and panel stays in its current position with full content. Sticky in localStorage on the post-upload page; the shareable page always defaults to Reader so each recipient lands in a fresh view regardless of any other viewer's preference.

Two new blocks render in both modes:
- A one-line action banner under the score hero with severity-keyed copy (e.g., `3 critical and 2 moderate issues must be fixed before publishing.`).
- A severity-ordered "Issues to fix" punch list with anchor links that jump to the matching Detailed Findings card, where the Adobe Acrobat fix-steps panel — users' favorite feature — stays inline in every mode.

### Tests

New unit tests for `tallySeverity`, `firstActionableFinding`/`isGuidanceFinding`, `useReportMode`, `ReportDisclosure`, `ReportModeToggle`, `ReportActionBanner`, and `IssuesSummary`. The two pages themselves are still tested via the existing source-grep pattern; a full SSR-render smoke test is deferred to a separate engagement (see `docs/superpowers/specs/2026-05-04-reader-auditor-toggle-design.md` open items).
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "Document Reader/Auditor toggle in CHANGELOG (Unreleased)"
```

---

## Final state

After all 13 tasks are complete, the branch contains:

- 7 new files (3 utils/composables, 4 components) plus 7 test files.
- 2 modified pages (`pages/report/[id].vue` and `pages/index.vue`).
- 1 modified `CHANGELOG.md`.
- ~13 new commits on `feature/reader-auditor-toggle` ahead of `main`.

What deliberately did not happen on this branch:

- No version bump in any `package.json`. No git tag. No `dateModified` update in `nuxt.config.ts`.
- No `git push`.
- No "Fix automatically" buttons or remediation-tool affordances.
- No refactoring of `pages/index.vue` or `pages/report/[id].vue` into shared components beyond the four new components introduced.
- No API, scoring, or data-model changes.

Merge to `main` (with version bump, tag, push, redeploy) is a separate user-driven step after the branch is reviewed and the user is satisfied with the in-browser feel of both modes.
