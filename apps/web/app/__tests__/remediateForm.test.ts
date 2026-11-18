/**
 * The remediation form asks for the title and language to write into the
 * repaired PDF (user decision 2026-11-18), prefilled from the audit's own
 * title-and-language findings, and sends them with the upload.
 */
import "./test-helpers";
import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

vi.mock("#app", () => ({
  navigateTo: vi.fn(),
  useRuntimeConfig: () => ({ public: { remediationEnabled: true } }),
}));

import RemediateButton from "../components/RemediateButton.vue";
import { currentDocMetadata } from "../utils/remediationMetadata";

const titled = [
  {
    id: "title_language",
    findings: [
      'Document title: "Annual Report 2025" (shown by viewers — DisplayDocTitle is set)',
      "Language declared: es-US",
    ],
  },
];
const untitled = [
  {
    id: "title_language",
    findings: ["No document title found in metadata", "No language declaration found"],
  },
];

describe("currentDocMetadata", () => {
  it("reads the title and language the analyzer reported", () => {
    expect(currentDocMetadata(titled)).toEqual({ title: "Annual Report 2025", language: "es-US" });
  });
  it("nothing reported → nothing prefilled", () => {
    expect(currentDocMetadata(untitled)).toEqual({ title: null, language: null });
    expect(currentDocMetadata(undefined)).toEqual({ title: null, language: null });
  });
});

describe("the form", () => {
  it("is prefilled from the audit", () => {
    const w = mount(RemediateButton, { props: { inputScore: 60, categories: titled } });
    expect((w.find('[data-testid="remediate-title"]').element as HTMLInputElement).value).toBe(
      "Annual Report 2025",
    );
    expect((w.find('[data-testid="remediate-language"]').element as HTMLSelectElement).value).toBe(
      "es-US",
    );
  });

  it("an untitled PDF starts with an empty title and English (United States)", () => {
    const w = mount(RemediateButton, { props: { inputScore: 60, categories: untitled } });
    expect((w.find('[data-testid="remediate-title"]').element as HTMLInputElement).value).toBe("");
    expect((w.find('[data-testid="remediate-language"]').element as HTMLSelectElement).value).toBe(
      "en-US",
    );
  });

  it("WIRING: the typed title and chosen language go out with the upload", async () => {
    let sent: FormData | null = null;
    (globalThis as any).$fetch = vi.fn(async (_url: string, opts: { body: FormData }) => {
      sent = opts.body;
      return { jobId: "j", downloadToken: "t", inputScore: 60, inputGrade: "D" };
    });
    const file = new File(["%PDF-1.4"], "a.pdf", { type: "application/pdf" });
    const w = mount(RemediateButton, { props: { file, inputScore: 60, categories: untitled } });
    await w.find('[data-testid="remediate-title"]').setValue("Grant Guidelines 2026");
    await w.find('[data-testid="remediate-language"]').setValue("pl-PL");
    await w.find("button").trigger("click");
    await flushPromises();
    expect(sent).not.toBeNull();
    expect(sent!.get("title")).toBe("Grant Guidelines 2026");
    expect(sent!.get("language")).toBe("pl-PL");
  });

  it("no form on a file that already scores an A", () => {
    const w = mount(RemediateButton, { props: { inputScore: 95, categories: titled } });
    expect(w.find('[data-testid="remediate-title"]').exists()).toBe(false);
  });
});
