/**
 * Batch remediation bug (2026-11-24).
 *
 * A batch frees each File once it is audited, so on a batch tab the repair
 * button has no file and opens a picker. Two things went wrong together:
 *   1. the title/language fields were seeded ONCE and the component instance
 *      was reused across tabs, so document A's title stayed in the form on
 *      document B's tab;
 *   2. the picker accepted any file.
 * Together: A's title written into B's PDF. These tests pin both fixes.
 */
import "./test-helpers";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("#app", () => ({
  navigateTo: vi.fn(),
  useRuntimeConfig: () => ({ public: { remediationEnabled: true } }),
}));

import RemediateButton from "../components/RemediateButton.vue";
import { formatBytes, matchReselectedFile } from "../utils/remediationFileMatch";

const catsA = [
  { id: "title_language", findings: ['Document title: "Report A"', "Language declared: es-US"] },
];
const catsB = [
  {
    id: "title_language",
    findings: ["No document title found in metadata", "No language declaration found"],
  },
];

function pdf(name: string, bytes = 8) {
  return new File(["x".repeat(bytes)], name, { type: "application/pdf" });
}

/** happy-dom will not let a test assign `files`; define it instead. */
async function pick(w: ReturnType<typeof mount>, file: File) {
  const input = w.find('[data-testid="remediate-file-input"]');
  Object.defineProperty(input.element, "files", { value: [file], configurable: true });
  await input.trigger("change");
  await flushPromises();
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    jobId: "j",
    downloadToken: "t",
    inputScore: 60,
    inputGrade: "D",
  }));
  (globalThis as any).$fetch = fetchMock;
});

describe("matchReselectedFile", () => {
  it("accepts the same name and size", () => {
    expect(matchReselectedFile({ name: "a.pdf", size: 8 }, { name: "a.pdf", size: 8 })).toEqual({
      ok: true,
    });
  });

  it("ignores case and Unicode composition in the name", () => {
    const nfc = "Café.pdf";
    const nfd = "Café.PDF";
    expect(matchReselectedFile({ name: nfc, size: 8 }, { name: nfd, size: 8 }).ok).toBe(true);
  });

  it("refuses a different name, naming both files and saying nothing was sent", () => {
    const m = matchReselectedFile({ name: "a.pdf", size: 8 }, { name: "b.pdf", size: 8 });
    expect(m.ok).toBe(false);
    if (m.ok) return;
    expect(m.reason).toBe("name");
    expect(m.message).toContain("a.pdf");
    expect(m.message).toContain("b.pdf");
    expect(m.message).toContain("Nothing was sent");
  });

  it("refuses the same name with a different size", () => {
    const m = matchReselectedFile({ name: "a.pdf", size: 8 }, { name: "a.pdf", size: 9 });
    expect(m.ok).toBe(false);
    if (m.ok) return;
    expect(m.reason).toBe("size");
    expect(m.message).toContain("Nothing was sent");
  });

  it("checks the name alone when no size was recorded (a restored report)", () => {
    expect(matchReselectedFile({ name: "a.pdf" }, { name: "a.pdf", size: 123 }).ok).toBe(true);
    expect(matchReselectedFile({ name: "a.pdf", size: null }, { name: "z.pdf", size: 1 }).ok).toBe(
      false,
    );
  });

  it("accepts anything when the caller knows no filename (the old behaviour)", () => {
    expect(matchReselectedFile(null, { name: "a.pdf", size: 1 }).ok).toBe(true);
  });

  it("formats sizes in plain units", () => {
    expect(formatBytes(1)).toBe("1 byte");
    expect(formatBytes(512)).toBe("512 bytes");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("the title and language always belong to the document shown", () => {
  it("reseeds both fields when the report underneath changes (a batch tab switch)", async () => {
    const w = mount(RemediateButton, {
      props: { inputScore: 60, categories: catsA, expectedFile: { name: "a.pdf", size: 8 } },
    });
    const title = () =>
      (w.find('[data-testid="remediate-title"]').element as HTMLInputElement).value;
    const lang = () =>
      (w.find('[data-testid="remediate-language"]').element as HTMLSelectElement).value;
    expect(title()).toBe("Report A");
    expect(lang()).toBe("es-US");

    // The same component instance, now showing document B.
    await w.setProps({ categories: catsB, expectedFile: { name: "b.pdf", size: 9 } });
    expect(title()).toBe("");
    expect(lang()).toBe("en-US");
  });

  it("does not carry a title TYPED for document A over to document B", async () => {
    const w = mount(RemediateButton, {
      props: { inputScore: 60, categories: catsB, expectedFile: { name: "a.pdf", size: 8 } },
    });
    await w.find('[data-testid="remediate-title"]').setValue("Typed for A");
    await w.setProps({ categories: [...catsB], expectedFile: { name: "b.pdf", size: 9 } });
    expect((w.find('[data-testid="remediate-title"]').element as HTMLInputElement).value).toBe("");
  });

  it("WIRING: the page keys the button on the active report and passes the expected file", () => {
    const src = readFileSync(resolve(__dirname, "../pages/index.vue"), "utf8");
    const uses = src.match(/<RemediateButton[\s\S]*?\/>/g) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    for (const use of uses) {
      expect(use).toContain(':key="remediateKey"');
      expect(use).toContain(':expected-file="activeExpectedFile"');
    }
  });
});

describe("re-selecting the file when it is no longer held", () => {
  it("says which file to choose, before the click", () => {
    const w = mount(RemediateButton, {
      props: { inputScore: 60, categories: catsA, expectedFile: { name: "report-a.pdf", size: 8 } },
    });
    const note = w.find('[data-testid="remediate-reselect-note"]');
    expect(note.exists()).toBe(true);
    expect(note.text()).toContain("Choose report-a.pdf again to repair it");
  });

  it("shows no such note while the file is still held", () => {
    const w = mount(RemediateButton, {
      props: {
        file: pdf("report-a.pdf"),
        inputScore: 60,
        categories: catsA,
        expectedFile: { name: "report-a.pdf", size: 8 },
      },
    });
    expect(w.find('[data-testid="remediate-reselect-note"]').exists()).toBe(false);
  });

  it("REFUSES a different file: nothing is sent and the message names both files", async () => {
    const w = mount(RemediateButton, {
      props: { inputScore: 60, categories: catsA, expectedFile: { name: "a.pdf", size: 8 } },
    });
    await pick(w, pdf("b.pdf", 8));
    expect(fetchMock).not.toHaveBeenCalled();
    const err = w.find('[data-testid="remediate-error"]');
    expect(err.attributes("role")).toBe("alert");
    expect(err.text()).toContain("a.pdf");
    expect(err.text()).toContain("b.pdf");
    expect(err.text()).toContain("Nothing was sent");
  });

  it("REFUSES the same name with a different size", async () => {
    const w = mount(RemediateButton, {
      props: { inputScore: 60, categories: catsA, expectedFile: { name: "a.pdf", size: 8 } },
    });
    await pick(w, pdf("a.pdf", 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(w.find('[data-testid="remediate-error"]').exists()).toBe(true);
  });

  it("sends the matching file with THIS document's title and language", async () => {
    const w = mount(RemediateButton, {
      props: { inputScore: 60, categories: catsA, expectedFile: { name: "a.pdf", size: 8 } },
    });
    const file = pdf("a.pdf", 8);
    await pick(w, file);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = (fetchMock.mock.calls[0]![1] as { body: FormData }).body;
    expect((body.get("file") as File).name).toBe("a.pdf");
    expect(body.get("title")).toBe("Report A");
    expect(body.get("language")).toBe("es-US");
  });

  it("a refusal is cleared when the report changes", async () => {
    const w = mount(RemediateButton, {
      props: { inputScore: 60, categories: catsA, expectedFile: { name: "a.pdf", size: 8 } },
    });
    await pick(w, pdf("b.pdf", 8));
    expect(w.find('[data-testid="remediate-error"]').exists()).toBe(true);
    await w.setProps({ categories: catsB, expectedFile: { name: "b.pdf", size: 8 } });
    expect(w.find('[data-testid="remediate-error"]').exists()).toBe(false);
  });
});
