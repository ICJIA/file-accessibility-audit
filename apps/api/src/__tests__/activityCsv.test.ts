/**
 * The daily activity CSV: a fixed column allow-list (adding a column is a
 * policy change), RFC 4180 quoting, a formula-injection guard (managers open
 * these in Excel), a UTF-8 BOM, LF line endings (CRLF shows as ^M in less),
 * and the policy page's tier vocabulary.
 */
import { describe, it, expect } from "vitest";
import {
  ACTIVITY_CSV_COLUMNS,
  CSV_BOM,
  activityCsvLine,
  csvField,
  formatActivityCsv,
  tierLabel,
  type ActivityRow,
} from "../services/activityCsv.js";

const TZ = "America/Chicago";

/** A minimal RFC 4180 reader, so round-trips are checked by a parser and not
 *  by eye. Handles quoted fields, doubled quotes, and embedded newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const row = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  id: 48213,
  created_at: "2026-08-19 14:03:22",
  event_type: "analyze",
  filename: "Annual Report, FY24.pdf",
  score: 72,
  grade: "C",
  content_hash: "9f2c",
  privileged: 0,
  reason: null,
  ...over,
});

describe("the column allow-list", () => {
  it("is exactly these ten columns, in this order — changing it is a policy change", () => {
    expect([...ACTIVITY_CSV_COLUMNS]).toEqual([
      "id",
      "timestamp_utc",
      "timestamp_chicago",
      "event",
      "filename",
      "score",
      "grade",
      "content_hash",
      "tier",
      "reason",
    ]);
  });
});

describe("csvField", () => {
  it("quotes commas, quotes and line breaks; doubles inner quotes", () => {
    expect(csvField("plain.pdf")).toBe("plain.pdf");
    expect(csvField("a, b.pdf")).toBe('"a, b.pdf"');
    expect(csvField('say "hi".pdf')).toBe('"say ""hi"".pdf"');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField("cr\rhere")).toBe('"cr\rhere"');
  });
  it("neutralises formula injection for every trigger character", () => {
    expect(csvField('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("-x")).toBe("'-x");
    expect(csvField("@cmd")).toBe("'@cmd");
    expect(csvField("\tx")).toBe("'\tx");
  });
  it("numbers pass through untouched; NULL and undefined are empty", () => {
    expect(csvField(72)).toBe("72");
    expect(csvField(0)).toBe("0");
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });
});

describe("tierLabel", () => {
  it("uses the policy page's vocabulary, never 'anonymous'", () => {
    expect(tierLabel(1)).toBe("trusted-tool");
    expect(tierLabel(0)).toBe("public");
    expect(tierLabel(null)).toBe("unknown");
    expect(tierLabel(undefined)).toBe("unknown");
  });
});

describe("activityCsvLine", () => {
  it("renders both timestamps from the SQLite UTC text, and the tier and reason columns", () => {
    expect(activityCsvLine(row(), TZ)).toBe(
      '48213,2026-08-19T14:03:22Z,2026-08-19 09:03:22 CDT,analyze,"Annual Report, FY24.pdf",72,C,9f2c,public,',
    );
    expect(
      activityCsvLine(
        row({
          id: 48214,
          created_at: "2026-08-19 14:04:01",
          event_type: "audit-url-page-failed",
          filename: "https://example.gov/files/brief.pdf",
          score: null,
          grade: null,
          content_hash: null,
          privileged: 1,
          reason: "navigation-failed",
        }),
        TZ,
      ),
    ).toBe(
      "48214,2026-08-19T14:04:01Z,2026-08-19 09:04:01 CDT,audit-url-page-failed,https://example.gov/files/brief.pdf,,,,trusted-tool,navigation-failed",
    );
  });
});

describe("formatActivityCsv", () => {
  it("starts with the BOM, then the header, LF endings only, trailing newline", () => {
    const text = formatActivityCsv([row()], TZ);
    expect(text.startsWith(CSV_BOM)).toBe(true);
    expect(text).not.toContain("\r");
    expect(text.endsWith("\n")).toBe(true);
    const lines = text.slice(CSV_BOM.length).split("\n");
    expect(lines[0]).toBe(ACTIVITY_CSV_COLUMNS.join(","));
    expect(lines).toHaveLength(3); // header, row, trailing ""
  });
  it("an empty day is a header-only file", () => {
    expect(formatActivityCsv([], TZ)).toBe(`${CSV_BOM}${ACTIVITY_CSV_COLUMNS.join(",")}\n`);
  });
  it("a hostile filename round-trips through a CSV parser with exactly ten fields", () => {
    const hostile = '=cmd|"calc"!A1, "quoted"\nsecond line';
    const text = formatActivityCsv([row({ filename: hostile })], TZ).slice(CSV_BOM.length);
    const parsed = parseCsv(text);
    expect(parsed[0]).toEqual([...ACTIVITY_CSV_COLUMNS]);
    expect(parsed[1]).toHaveLength(10);
    expect(parsed[1][4]).toBe(`'${hostile}`); // the guard's leading quote survives, the rest is intact
    expect(parsed).toHaveLength(2);
  });
});
