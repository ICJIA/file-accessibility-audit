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
import DropZone from "../components/DropZone.vue";

function pdfFile(name: string): File {
  return new File(["%PDF-1.7 test"], name, { type: "application/pdf" });
}

async function selectFiles(wrapper: ReturnType<typeof mount>, files: File[]) {
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, "files", { value: files, configurable: true });
  await input.trigger("change");
}

describe("DropZone file limits", () => {
  it("stages five files without a validation error (the copy promises five)", async () => {
    const wrapper = mount(DropZone);
    await selectFiles(
      wrapper,
      [1, 2, 3, 4, 5].map((n) => pdfFile(`report-${n}.pdf`)),
    );
    expect(wrapper.text()).toContain("5 files selected");
    expect(wrapper.text()).not.toContain("Maximum");
  });

  it("rejects a sixth file with an honest limit message", async () => {
    const wrapper = mount(DropZone);
    await selectFiles(
      wrapper,
      [1, 2, 3, 4, 5, 6].map((n) => pdfFile(`report-${n}.pdf`)),
    );
    expect(wrapper.text()).toContain("Maximum 5 files allowed");
  });

  it("advertises the same limit it enforces", () => {
    const wrapper = mount(DropZone);
    expect(wrapper.text()).toContain("up to 5 files");
  });
});
