import { describe, it, expect } from "vitest";
import { escapeHtml } from "../utils/escapeHtml";

// escapeHtml guards every PDF-derived string written into the HTML report
// export. It must cover the full OWASP set including the single quote, so a
// payload can't break out of a single-quoted attribute if one is ever added.
describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &#39;");
  });

  it("neutralizes a script-tag payload", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("neutralizes a single-quoted attribute breakout payload", () => {
    expect(escapeHtml("' onmouseover='alert(1)")).toBe("&#39; onmouseover=&#39;alert(1)");
  });

  it("leaves benign text untouched", () => {
    expect(escapeHtml("Quarterly Budget Report 2024")).toBe("Quarterly Budget Report 2024");
  });

  it("escapes ampersand first (no double-encoding artifacts)", () => {
    expect(escapeHtml("Tom & Jerry <tag>")).toBe("Tom &amp; Jerry &lt;tag&gt;");
  });
});
