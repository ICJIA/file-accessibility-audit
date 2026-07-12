// Facade — scorer.ts was split by format in the v1.34.0 structural refactor
// into packages/analyzer/src/scoring/{common,pdf,docx,pptx,xlsx}.ts. Every
// symbol previously exported from this file is re-exported here, unchanged,
// so no other file's imports (routes, tests, the CLI's cross-package import
// of ../../../api/src/services/scorer.js) need to change.
//
// Report-payload types live in packages/shared so the web app can type API
// responses with the real shapes. Re-exported here so the CLI's and the
// API's existing `from "./scorer.js"` type imports keep working unchanged.
import type {
  CategoryResult,
  HelpLink,
  WcagCriterion,
  ScoreProfileResult,
  ScoringMode,
} from "@file-audit/shared";
export type { CategoryResult, HelpLink, WcagCriterion, ScoreProfileResult, ScoringMode };

export type { PdfUaSignals, ScoringResult } from "./scoring/common.js";
export { scoreDocument } from "./scoring/pdf.js";
export { scoreDocx } from "./scoring/docx.js";
export { scorePptx } from "./scoring/pptx.js";
export { scoreXlsx } from "./scoring/xlsx.js";
