/**
 * useReportExport — thin orchestrator (Task F5).
 *
 * The pure report-format builders that used to live in this 1,264-line file
 * now live in ~/utils/exportFormats/{markdown,json,text,html,aiAnalysis}.ts
 * (plus a shared.ts for the types/helpers used by more than one of them).
 * This file re-exports every symbol it used to export directly — `baseFilename`,
 * `ReportResult`, `buildMarkdown`, `buildJSON`, `buildText`, `buildHtml`,
 * `buildAiAnalysis` — as a facade, so existing imports (including
 * __tests__/useReportExport.test.ts, __tests__/reportExportBanner.test.ts,
 * __tests__/ai-analysis.test.ts, and ReportDownloadBar.vue) keep working
 * unchanged; only `useReportExport()` itself (the stateful composable) is
 * actually defined here.
 *
 * Also: file-saver is gone. Downloads go through the native
 * ~/utils/download.ts anchor-click helper instead.
 */
import { downloadBlob } from "~/utils/download";
import { escapeHtml } from "~/utils/escapeHtml";
import { buildMarkdown } from "~/utils/exportFormats/markdown";
import { buildJSON } from "~/utils/exportFormats/json";
import { buildText } from "~/utils/exportFormats/text";
import { buildHtml } from "~/utils/exportFormats/html";
import { buildAiAnalysis } from "~/utils/exportFormats/aiAnalysis";
import { baseFilename, type ReportResult, type BrandingInfo } from "~/utils/exportFormats/shared";

export { baseFilename, buildMarkdown, buildJSON, buildText, buildHtml, buildAiAnalysis };
export type { ReportResult };

// ── Public composable ─────────────────────────────────────────────────────

export function useReportExport() {
  const config = useRuntimeConfig();
  const branding: BrandingInfo = {
    appName: config.public.appName as string,
    siteUrl: config.public.siteUrl as string,
    wcagVersion: String(config.public.wcagVersion ?? "2.2"),
    wcagUnderstandingBase: String(
      config.public.wcagUnderstandingBase ?? "https://www.w3.org/WAI/WCAG22/Understanding/",
    ),
  };
  const exporting = ref(false);
  const sharing = ref(false);
  const shareUrl = ref<string | null>(null);
  const shareError = ref<string | null>(null);
  const aiCopied = ref(false);
  let aiCopyTimer: ReturnType<typeof setTimeout> | null = null;

  async function exportMarkdown(result: ReportResult) {
    const md = buildMarkdown(result, branding);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    downloadBlob(blob, `${baseFilename(result)}.md`);
  }

  async function exportJSON(result: ReportResult) {
    const json = buildJSON(result, branding);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, `${baseFilename(result)}.json`);
  }

  async function exportText(result: ReportResult) {
    const text = buildText(result, branding);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `${baseFilename(result)}.txt`);
  }

  // Gather every same-origin stylesheet's rules so the exported file renders
  // standalone (the app's Tailwind build + theme variables). Cross-origin
  // sheets can't be read and are skipped — the app ships no consequential ones.
  function collectAppCss(): string {
    let out = "";
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) out += rule.cssText + "\n";
      } catch {
        /* cross-origin stylesheet — not readable; skip */
      }
    }
    return out;
  }

  /**
   * Snapshot the LIVE rendered report — the `[data-report-content]` subtree —
   * to a self-contained HTML file, so the download is identical to what's on
   * screen rather than a hand-built re-render that can drift. Everything is
   * expanded first (the file needs no interaction), interactive-only controls
   * (`[data-export-exclude]`) are dropped, and the app's stylesheet + color
   * mode are inlined so it renders anywhere. Returns false (→ buildHtml
   * fallback) when there is no live DOM (SSR / programmatic use).
   */
  async function snapshotReport(result: ReportResult): Promise<boolean> {
    if (typeof document === "undefined") return false;
    const el = document.querySelector<HTMLElement>("[data-report-content]");
    if (!el) return false;

    // Expand every collapsed section (IssuesSummary rows + the Basic/Advanced
    // signal toggles both expose state via aria-expanded="false").
    const toggles = Array.from(el.querySelectorAll<HTMLElement>('[aria-expanded="false"]'));
    toggles.forEach((t) => t.click());
    // Let Vue flush the resulting v-if renders before we clone.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-export-exclude]").forEach((n) => n.remove());
    clone.querySelectorAll("details").forEach((d) => (d.open = true));

    const css = collectAppCss();
    const doc = `<!DOCTYPE html>
<html lang="en" class="${escapeHtml(document.documentElement.className)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility Report — ${escapeHtml(result.filename)}</title>
<style>${css}</style>
<style>
  html { background: var(--surface-body, #0a0a0a); }
  body { margin: 0; padding: 32px 16px; background: var(--surface-body, #0a0a0a); color: var(--text-secondary, #e5e7eb); }
  .report-export { max-width: 900px; margin: 0 auto; }
  [data-export-exclude] { display: none !important; }
  /* The export is static (no JS): neutralize the now-inert click affordances
     while leaving pure-CSS hover tooltips (NaCell) and native <details> working. */
  .report-export button { cursor: default; }
</style>
</head>
<body>
<main class="report-export">${clone.outerHTML}</main>
</body>
</html>`;

    downloadBlob(
      new Blob([doc], { type: "text/html;charset=utf-8" }),
      `${baseFilename(result)}.html`,
    );

    // Restore the live page's original collapse state.
    toggles.forEach((t) => t.click());
    return true;
  }

  async function exportHtml(result: ReportResult) {
    if (await snapshotReport(result)) return;
    // Fallback for SSR / no live DOM: the hand-built HTML report.
    const html = buildHtml(result, branding);
    downloadBlob(
      new Blob([html], { type: "text/html;charset=utf-8" }),
      `${baseFilename(result)}.html`,
    );
  }

  /**
   * Trigger the browser's native print dialog so the user can save the
   * current report page as a PDF (Save as PDF is the default print
   * destination on macOS, Windows, and ChromeOS). The browser respects
   * the @media print rules in assets/css/main.css which hide site
   * chrome, switch to ink-on-paper colors, expand <details> sections,
   * scale mermaid SVGs, and avoid awkward page breaks. The user can
   * choose the filename in the print dialog.
   *
   * Browser print is the lightest possible PDF generator — it works
   * without adding puppeteer / playwright / pdfkit dependencies (~100 MB
   * combined) and produces output that's visually faithful to the
   * report page itself.
   */
  function exportPdfViaBrowserPrint(_result: ReportResult) {
    if (typeof window === "undefined") return;
    // Defer one frame so any UI close-handlers (e.g., dropdown closing
    // before print fires) settle before the modal blocks the page.
    requestAnimationFrame(() => {
      window.print();
    });
  }

  async function shareReport(result: ReportResult): Promise<string | null> {
    sharing.value = true;
    shareError.value = null;
    shareUrl.value = null;
    try {
      const response = await $fetch<{ id: string }>("/api/reports", {
        method: "POST",
        body: { report: result },
        credentials: "include",
      });
      const config = useRuntimeConfig();
      const url = `${config.public.siteUrl}/report/${response.id}`;
      shareUrl.value = url;
      return url;
    } catch (err: any) {
      shareError.value = err?.data?.error || "Failed to create share link";
      return null;
    } finally {
      sharing.value = false;
    }
  }

  function clearShare() {
    shareUrl.value = null;
    shareError.value = null;
  }

  function buildAiAnalysisText(result: ReportResult): string {
    return buildAiAnalysis(result, branding);
  }

  async function copyAiAnalysis(result: ReportResult): Promise<boolean> {
    const text = buildAiAnalysis(result, branding);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        return false;
      }
      aiCopied.value = true;
      if (aiCopyTimer) clearTimeout(aiCopyTimer);
      aiCopyTimer = setTimeout(() => {
        aiCopied.value = false;
      }, 2500);
      return true;
    } catch {
      return false;
    }
  }

  return {
    exportMarkdown,
    exportJSON,
    exportText,
    exportHtml,
    exportPdfViaBrowserPrint,
    shareReport,
    shareUrl,
    shareError,
    sharing,
    clearShare,
    exporting,
    copyAiAnalysis,
    aiCopied,
    buildAiAnalysisText,
  };
}
