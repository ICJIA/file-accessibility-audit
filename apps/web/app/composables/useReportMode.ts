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
