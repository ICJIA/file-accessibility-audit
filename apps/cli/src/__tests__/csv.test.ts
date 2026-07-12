import { describe, it, expect } from "vitest";
import { escapeCsvField } from "../lib/csv.js";

// ---------------------------------------------------------------------------
// CSV / formula-injection guard (CWE-1236). escapeCsvField already quoted
// commas/quotes/newlines, but a field whose value starts with =, +, -, or @
// (e.g. a document's Title metadata crafted as "=cmd|'/c calc'!A1") becomes a
// LIVE FORMULA when the exported publist CSV is opened in Excel/Google
// Sheets. Per OWASP's CSV Injection guidance, a leading tab or carriage
// return is also a trigger character. The fix prefixes a single quote `'`
// onto the field BEFORE the existing comma/quote/newline quoting runs, so
// the neutralizer character itself ends up inside the quoted field for
// fields that also need quoting.
// ---------------------------------------------------------------------------

describe("escapeCsvField (CSV/formula-injection guard)", () => {
  it("prefixes a leading = with a single quote (RED: currently passes the formula through unmodified)", () => {
    expect(escapeCsvField("=1+2")).toBe("'=1+2");
  });

  it("prefixes a leading + with a single quote", () => {
    expect(escapeCsvField("+1+1")).toBe("'+1+1");
  });

  it("prefixes a leading - with a single quote", () => {
    expect(escapeCsvField("-1+1")).toBe("'-1+1");
  });

  it("prefixes a leading @ with a single quote", () => {
    expect(escapeCsvField("@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
  });

  it("prefixes a leading tab or carriage return with a single quote (OWASP extra trigger chars)", () => {
    // A leading tab has no comma/quote/newline in the rest of the value, so
    // it stays unquoted after the prefix.
    expect(escapeCsvField("\t=1+2")).toBe("'\t=1+2");
    // A leading \r also satisfies the pre-existing comma/quote/newline
    // quoting condition (str.includes('\r')), so the whole field additionally
    // gets wrapped in double quotes — both guards apply, same as the
    // leading-char-plus-comma case below.
    expect(escapeCsvField("\r=1+2")).toBe('"\'\r=1+2"');
  });

  it("leaves a normal field completely unchanged", () => {
    expect(escapeCsvField("normal")).toBe("normal");
    expect(escapeCsvField("Annual Report 2024")).toBe("Annual Report 2024");
  });

  it("does not touch a = that is not the FIRST character", () => {
    expect(escapeCsvField("Score=90")).toBe("Score=90");
  });

  it("applies both guards when a field has a leading trigger char AND needs comma-quoting", () => {
    expect(escapeCsvField("=1+2,3")).toBe('"\'=1+2,3"');
  });

  it("applies both guards when a field has a leading trigger char AND contains a double quote", () => {
    expect(escapeCsvField('=HYPERLINK("evil")')).toBe('"\'=HYPERLINK(""evil"")"');
  });

  it("numbers are stringified and unaffected (no leading-char match)", () => {
    expect(escapeCsvField(42)).toBe("42");
  });

  it("null and undefined still produce an empty string", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("existing comma/quote/newline quoting is unchanged for fields with no leading trigger char", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField('a"b')).toBe('"a""b"');
    expect(escapeCsvField("a\nb")).toBe('"a\nb"');
  });
});
