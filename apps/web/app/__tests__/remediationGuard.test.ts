import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// The PDF auto-remediation pipeline must be offered ONLY for PDF results.
// The old guard (fileType !== 'docx') would show the PDF RemediateButton for
// PowerPoint and Excel results. index.vue isn't mountable in this test env,
// so pin the template condition at the source level (same seam as
// responsive.test.ts / accessibility.test.ts).
describe("index.vue remediation guard", () => {
  const source = readFileSync(
    resolve(__dirname, "..", "pages/index.vue"),
    "utf-8",
  );

  it("gates the RemediateButton on fileType === 'pdf'", () => {
    expect(source).toContain(`v-if="result?.fileType === 'pdf'"`);
  });

  it("no longer uses the negative !== 'docx' guard anywhere", () => {
    expect(source).not.toContain("fileType !== 'docx'");
  });
});
