import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ProcessingOverlay from "../components/ProcessingOverlay.vue";

// ---------------------------------------------------------------------------
// v1.99.0 (user request): a ~26-second production audit showed one frozen
// line the whole time ("Extracting PDF structure…" — even for Word files),
// which read as "stuck". The overlay now rotates through the REAL check
// suite with an elapsed timer and escalating, truthful reassurance.
//
// The honesty shape under test: the server reports nothing until it's done,
// so the queue must CYCLE (never fake completion of a step), the elapsed
// line must say the checks run together, and screen readers must get a
// sparse cadence — not a 2.5-second firehose.
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("ProcessingOverlay — legacy static mode (URL audits)", () => {
  it("renders the explicit stage string in a live region when rotate is off", () => {
    const w = mount(ProcessingOverlay, { props: { stage: "Fetching https://x…" } });
    const el = w.find('[data-testid="overlay-static-stage"]');
    expect(el.text()).toBe("Fetching https://x…");
    expect(el.attributes("aria-live")).toBe("polite");
    expect(w.find('[data-testid="overlay-rotating-stage"]').exists()).toBe(false);
  });
});

describe("ProcessingOverlay — the rotating check queue", () => {
  it("rotates through the PDF check list every 2.5s and CYCLES rather than stopping (no faked completion)", async () => {
    const w = mount(ProcessingOverlay, { props: { stage: "", rotate: true, fileType: "pdf" } });
    const line = () => w.find('[data-testid="overlay-rotating-stage"]').text();
    const first = line();
    expect(first).toContain("Uploading and validating");
    await vi.advanceTimersByTimeAsync(2_500);
    expect(line()).not.toBe(first);
    // Walk far past one full cycle: it must come back around to the start.
    await vi.advanceTimersByTimeAsync(2_500 * 30);
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      seen.add(line());
      await vi.advanceTimersByTimeAsync(2_500);
    }
    expect(seen.has(first)).toBe(true);
  });

  it("the PDF queue names both veraPDF passes; the Office queue names OOXML and never veraPDF", async () => {
    const pdf = mount(ProcessingOverlay, { props: { stage: "", rotate: true, fileType: "pdf" } });
    const collect = async (w: ReturnType<typeof mount>) => {
      const out: string[] = [];
      for (let i = 0; i < 12; i++) {
        out.push(w.find('[data-testid="overlay-rotating-stage"]').text());
        await vi.advanceTimersByTimeAsync(2_500);
      }
      return out.join("\n");
    };
    const pdfText = await collect(pdf);
    // v1.99.1 (user question "should it say pass 2 of 2?"): enumerated as a
    // pair, with the concurrency stated in the same breath — a bare
    // "pass 2 of 2" would claim sequential progress the client cannot know
    // (the two passes run together and report nothing until done).
    expect(pdfText).toContain("pass 1 of 2, both run together): PDF/UA conformance");
    expect(pdfText).toContain("pass 2 of 2, both run together): WCAG 2.2 machine checks");

    const docx = mount(ProcessingOverlay, { props: { stage: "", rotate: true, fileType: "docx" } });
    const docxText = await collect(docx);
    expect(docxText).toContain("OOXML");
    expect(docxText).toContain("contrast");
    expect(docxText).not.toContain("veraPDF");
  });

  it("shows a live elapsed counter that states the checks run together", async () => {
    const w = mount(ProcessingOverlay, { props: { stage: "", rotate: true, fileType: "pdf" } });
    await vi.advanceTimersByTimeAsync(7_000);
    const el = w.find('[data-testid="overlay-elapsed"]');
    expect(el.text()).toContain("7s elapsed");
    expect(el.text()).toContain("run together on the server");
  });

  it("reassurance escalates truthfully: nothing early, the 30–60s expectation at 15s, the hard-timeout promise at 60s", async () => {
    const w = mount(ProcessingOverlay, { props: { stage: "", rotate: true, fileType: "pdf" } });
    expect(w.find('[data-testid="overlay-reassurance"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(w.find('[data-testid="overlay-reassurance"]').text()).toContain("30–60 seconds");
    await vi.advanceTimersByTimeAsync(45_000);
    const late = w.find('[data-testid="overlay-reassurance"]').text();
    expect(late).toContain("hard timeouts");
    expect(late).toContain("never hangs forever");
  });

  it("screen readers get a SPARSE cadence: the rotating line is aria-hidden and the live region updates on ~15s milestones only", async () => {
    const w = mount(ProcessingOverlay, { props: { stage: "", rotate: true, fileType: "pdf" } });
    expect(w.find('[data-testid="overlay-rotating-stage"]').attributes("aria-hidden")).toBe("true");
    const live = () => w.find('[data-testid="overlay-live-region"]').text();
    const initial = live();
    // Many rotations later but before the first milestone: unchanged.
    await vi.advanceTimersByTimeAsync(14_000);
    expect(live()).toBe(initial);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(live()).not.toBe(initial);
    expect(live()).toContain("15 seconds");
  });
});

describe("wiring — index.vue's single-file path drives the rotation", () => {
  const index = readFileSync(resolve(__dirname, "../pages/index.vue"), "utf8");
  it("the overlay receives rotate + file-type, uploads turn rotation on, and the URL path keeps its real milestone strings", () => {
    expect(index).toContain(':rotate="processingRotate"');
    expect(index).toContain(':file-type="processingFileType"');
    expect(index).toContain("processingRotate.value = true");
    // URL audits still narrate real milestones (legacy mode).
    expect(index).toMatch(/processingStage\.value = `Fetching \$\{url\}…`/);
    // The frozen, sometimes-wrong hand-set stage is gone for uploads.
    expect(index).not.toContain("Extracting PDF structure…");
  });
});

describe("DropZone — the timing expectation (v1.99.0, user request)", () => {
  it("tells users up front that analysis is not instantaneous and can take up to a minute", () => {
    const src = readFileSync(resolve(__dirname, "../components/DropZone.vue"), "utf8");
    const m = src.match(/data-testid="dropzone-timing-note"[\s\S]{0,400}?<\/p>/);
    expect(m).toBeTruthy();
    expect(m![0]).toContain("isn't instant");
    expect(m![0]).toContain("up to a minute");
  });
});
