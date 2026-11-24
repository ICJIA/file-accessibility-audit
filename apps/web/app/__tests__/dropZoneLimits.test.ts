/**
 * Tests for DropZone's file-count limit.
 *
 * History: the dropzone copy has always advertised "up to 5 files, max
 * 25 MB each", but MAX_FILES was 3 — dropping four or five files hit
 * "Maximum 3 files allowed" under a label promising five (user report,
 * 2026-08-17). The limit is now 5, matching the promise.
 */
import "./test-helpers";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import DropZone from "../components/DropZone.vue";
import { BATCH } from "../../../../audit.config";

function pdfFile(name: string): File {
  return new File(["%PDF-1.7 test"], name, { type: "application/pdf" });
}

async function selectFiles(wrapper: ReturnType<typeof mount>, files: File[]) {
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, "files", { value: files, configurable: true });
  await input.trigger("change");
}

describe("DropZone file limits", () => {
  // 2026-11-24: the limit is ONE constant, audit.config.ts BATCH.MAX_FILES
  // (25), read by both the check and the copy. It was hard-coded 5 here
  // while the config said 3.
  const MAX = BATCH.MAX_FILES;
  const files = (n: number) => Array.from({ length: n }, (_, i) => pdfFile(`report-${i + 1}.pdf`));

  it("stages five files without a validation error", async () => {
    const wrapper = mount(DropZone);
    await selectFiles(wrapper, files(5));
    expect(wrapper.text()).toContain("5 files selected");
    expect(wrapper.text()).not.toContain("Maximum");
  });

  it("stages a full batch — the configured maximum — without an error", async () => {
    const wrapper = mount(DropZone);
    await selectFiles(wrapper, files(MAX));
    expect(wrapper.text()).toContain(`${MAX} files selected`);
    expect(wrapper.text()).not.toContain("Maximum");
  });

  it("rejects one file more than the maximum with an honest limit message", async () => {
    const wrapper = mount(DropZone);
    await selectFiles(wrapper, files(MAX + 1));
    expect(wrapper.text()).toContain(`Maximum ${MAX} files allowed`);
  });

  it("advertises the same limit it enforces", () => {
    const wrapper = mount(DropZone);
    expect(wrapper.text()).toContain(`up to ${MAX} files`);
  });

  it("the limit comes from config, not from a number typed into the component", () => {
    const src = readFileSync(resolve(__dirname, "../components/DropZone.vue"), "utf8");
    expect(src).not.toMatch(/MAX_FILES\s*=\s*\d+/);
    expect(src).not.toMatch(/up to \d+ files, max/);
    expect(src).toContain("BATCH.MAX_FILES");
    const nuxt = readFileSync(resolve(__dirname, "../../nuxt.config.ts"), "utf8");
    expect(nuxt).toContain("batchMaxFiles: BATCH.MAX_FILES");
  });

  it("follows runtimeConfig when the deployment sets a different limit", async () => {
    const original = (globalThis as any).useRuntimeConfig;
    (globalThis as any).useRuntimeConfig = () => ({
      public: { ...original().public, batchMaxFiles: 4 },
    });
    try {
      const wrapper = mount(DropZone);
      expect(wrapper.text()).toContain("up to 4 files");
      await selectFiles(wrapper, files(5));
      expect(wrapper.text()).toContain("Maximum 4 files allowed");
    } finally {
      (globalThis as any).useRuntimeConfig = original;
    }
  });
});

describe("DropZone — files left out of a mixed selection are named (2026-11-24)", () => {
  function other(name: string): File {
    return new File(["x"], name, { type: "application/octet-stream" });
  }

  it("says which files were skipped and why, in a polite live region", async () => {
    const wrapper = mount(DropZone);
    await selectFiles(wrapper, [pdfFile("a.pdf"), pdfFile("b.pdf"), other("photo.zip")]);
    expect(wrapper.text()).toContain("2 files selected");
    const region = wrapper.find('[data-testid="skipped-files"]');
    expect(region.attributes("role")).toBe("status");
    expect(region.attributes("aria-live")).toBe("polite");
    expect(region.text()).toContain("1 file was left out");
    expect(region.text()).toContain("photo.zip");
    expect(region.text()).toContain("Not a supported file type");
  });

  it("gives a legacy Office file its specific advice", async () => {
    const wrapper = mount(DropZone);
    await selectFiles(wrapper, [pdfFile("a.pdf"), pdfFile("b.pdf"), other("old.doc")]);
    const region = wrapper.find('[data-testid="skipped-files"]');
    expect(region.text()).toContain("old.doc");
    expect(region.text()).not.toContain("Not a supported file type");
  });

  it("the live region exists, empty, before anything is skipped", () => {
    const wrapper = mount(DropZone);
    const region = wrapper.find('[data-testid="skipped-files"]');
    expect(region.exists()).toBe(true);
    expect(region.text()).toBe("");
  });

  it("a later clean selection clears the note", async () => {
    const wrapper = mount(DropZone);
    await selectFiles(wrapper, [pdfFile("a.pdf"), pdfFile("b.pdf"), other("x.zip")]);
    await selectFiles(wrapper, [pdfFile("c.pdf")]);
    expect(wrapper.find('[data-testid="skipped-files"]').text()).toBe("");
  });

  it("a single supported file among unsupported ones is still audited, and the rest named", async () => {
    const wrapper = mount(DropZone);
    await selectFiles(wrapper, [pdfFile("a.pdf"), other("x.zip")]);
    expect(wrapper.emitted("file-selected")).toHaveLength(1);
    expect(wrapper.find('[data-testid="skipped-files"]').text()).toContain("x.zip");
  });
});

describe("DropZone — every remove button names its file", () => {
  it("has an aria-label with the filename, and is a real button", async () => {
    const wrapper = mount(DropZone);
    await selectFiles(wrapper, [pdfFile("alpha.pdf"), pdfFile("beta.pdf")]);
    const buttons = wrapper.findAll('[data-testid="remove-staged"]');
    expect(buttons.map((b) => b.attributes("aria-label"))).toEqual([
      "Remove alpha.pdf",
      "Remove beta.pdf",
    ]);
    for (const b of buttons) {
      expect(b.element.tagName).toBe("BUTTON");
      expect(b.attributes("type")).toBe("button");
      expect(b.find("svg").attributes("aria-hidden")).toBe("true");
    }
    await buttons[0]!.trigger("click");
    expect(wrapper.text()).not.toContain("alpha.pdf");
    expect(wrapper.text()).toContain("beta.pdf");
  });
});
