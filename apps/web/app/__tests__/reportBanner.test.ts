import { describe, it, expect } from "vitest";
import { BANNER_EYEBROW, bannerMetaLine } from "../utils/reportBanner";

describe("reportBanner", () => {
  it("uses the agreed eyebrow label", () => {
    expect(BANNER_EYEBROW).toBe("ACCESSIBILITY REPORT FOR");
  });

  it("formats a plural page count with the PDF type", () => {
    expect(bannerMetaLine(12)).toBe("12 pages · PDF");
  });

  it("uses the singular 'page' for a one-page document", () => {
    expect(bannerMetaLine(1)).toBe("1 page · PDF");
  });
});
