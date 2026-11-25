import { describe, it, expect } from "vitest";
import { formatMetaDate, metadataItemsFor } from "../utils/documentMetadata";

// A server-rendered report is rendered twice: on the server, then in the
// browser. A date written in the local time zone differs between the two, and
// Vue reports that as a hydration mismatch (found on the sample report,
// 2026-11-25: the server said 11:32 AM, the browser 6:32 AM). The first render
// on both sides therefore asks for UTC.
describe("document dates are stable between the server and the browser", () => {
  const iso = "2023-06-22T11:32:00Z";

  it("in UTC the text does not depend on where the code runs, and says it is UTC", () => {
    expect(formatMetaDate(iso, "UTC")).toBe("June 22, 2023 at 11:32 AM UTC");
  });

  it("without a time zone it is the reader's local time, unlabelled, as before", () => {
    const local = formatMetaDate(iso);
    expect(local).toMatch(/^June 2[12], 2023 at \d{1,2}:\d{2} [AP]M$/);
  });

  it("metadataItemsFor passes the time zone to both PDF dates", () => {
    const items = metadataItemsFor(
      { pdfMetadata: { creationDate: iso, modDate: "2023-06-23T01:05:00Z" } },
      "UTC",
    );
    const value = (label: string) => items.find((i) => i.label === label)?.value;
    expect(value("Created")).toBe("June 22, 2023 at 11:32 AM UTC");
    expect(value("Last Modified")).toBe("June 23, 2023 at 1:05 AM UTC");
  });

  it("an empty date is still null", () => {
    expect(formatMetaDate(null, "UTC")).toBeNull();
  });
});
