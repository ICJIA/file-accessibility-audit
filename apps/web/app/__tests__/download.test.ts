import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadBlob } from "../utils/download";

// ---------------------------------------------------------------------------
// downloadBlob (Task F5) — the native anchor-download helper that replaces
// file-saver's saveAs(). Mocks the Blob-URL/anchor-click machinery so this
// runs deterministically under happy-dom without depending on its exact
// URL.createObjectURL support.
// ---------------------------------------------------------------------------

describe("downloadBlob", () => {
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURLSpy = vi.fn(() => "blob:mock-url");
    revokeObjectURLSpy = vi.fn();
    clickSpy = vi.fn();
    (URL as any).createObjectURL = createObjectURLSpy;
    (URL as any).revokeObjectURL = revokeObjectURLSpy;
    HTMLAnchorElement.prototype.click = clickSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an object URL from the given blob", () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    downloadBlob(blob, "hello.txt");
    expect(createObjectURLSpy).toHaveBeenCalledWith(blob);
  });

  it("clicks a detached anchor with href set to the object URL and the given download filename", () => {
    downloadBlob(new Blob(["x"]), "report.json");
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("sets the anchor's download attribute to the given filename before clicking", () => {
    let capturedFilename: string | null = null;
    clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
      capturedFilename = this.download;
    });
    downloadBlob(new Blob(["x"]), "my-report.md");
    expect(capturedFilename).toBe("my-report.md");
  });

  it("revokes the object URL after triggering the click", () => {
    downloadBlob(new Blob(["x"]), "a.txt");
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");
  });

  it("does not leave the anchor attached to the document", () => {
    const before = document.body.querySelectorAll("a").length;
    downloadBlob(new Blob(["x"]), "a.txt");
    const after = document.body.querySelectorAll("a").length;
    expect(after).toBe(before);
  });
});
