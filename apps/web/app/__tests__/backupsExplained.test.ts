import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { renderBackup, renderStatusHtml } from "../../server/utils/statusHtml";

// The tool makes one central promise — "your file is never stored" — and then
// publishes a nightly backup on /status and a backup row in the retention
// table. A reader who meets both concludes one of them is untrue. A real
// person asked exactly that: *why are you backing anything up if nothing is
// being stored?*
//
// The answer (the DOCUMENT is never saved; the service's RECORD that it was
// checked is, and that is what the backup copies) is not deducible from a
// completion timestamp or a retention row. It is therefore stated on both
// surfaces, and this file pins it on both — deliberately one file rather than
// two, because the failure mode here is not a surface losing the explanation
// outright but the two surfaces DRIFTING into different claims. Same suite,
// same assertions, one place to notice.
//
// The hardest assertions below are the ones guarding against OVERCLAIM. The
// tempting simplification — "the backup contains no personal information" —
// remains false even after v1.68.0 removed accounts and every email/IP/
// user-agent column: the uploaded file name can itself name a person, and a
// saved/shared report quotes short labels from inside the document. Being
// caught on either would discredit the whole policy page. Copy that
// reassures by omission is the regression these tests exist to catch.

const WEB_ROOT = resolve(__dirname, "../..");
const RETENTION_SECTION = readFileSync(
  resolve(WEB_ROOT, "app/components/dataRetention/Section07RetentionTable.vue"),
  "utf8",
);
const RETENTION_PAGE = readFileSync(resolve(WEB_ROOT, "app/pages/data-retention.vue"), "utf8");
const STORED_SECTION = readFileSync(
  resolve(WEB_ROOT, "app/components/dataRetention/Section08Stored.vue"),
  "utf8",
);

const PAYLOAD: Record<string, unknown> = {
  status: "ok",
  version: "1.58.0",
  uptime_seconds: 51_233,
  degraded: [],
  web: "ok",
  api: "ok",
};

const BACKUP_OK = {
  status: "ok",
  finished_at: "2026-08-07T05:00:12Z",
  finished_at_chicago: "Aug 7, 2026, 12:00:12 AM CDT",
  age_hours: 8,
  size_bytes: 29_360_128,
  rows: 8065,
};

/** Tag-stripped visible text, for assertions about what a reader actually
 *  reads rather than how it happens to be marked up. */
function visibleText(html: string): string {
  return html
    .replace(/<style>[\s\S]*?<\/style>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&sect;/g, "§")
    .replace(/\s+/g, " ")
    .trim();
}

describe("/status backup card — what is in a backup", () => {
  it("answers the question a reader actually arrives with", () => {
    const text = visibleText(renderBackup({ ...PAYLOAD, backup: BACKUP_OK }));
    // Not a paraphrase test: the literal question, so the card cannot be
    // reworded into something that no longer poses it.
    expect(text).toContain("Why back up anything if documents aren't stored?");
    expect(text).toMatch(/document.{0,40}never saved/i);
    expect(text).toMatch(/no document is ever written to disk/i);
  });

  it("states what a backup contains and what it cannot contain", () => {
    const text = visibleText(renderBackup({ ...PAYLOAD, backup: BACKUP_OK }));
    expect(text).toContain("In a backup");
    expect(text).toContain("Not in a backup");
    expect(text).toMatch(/one line of metadata per audit/i);
    expect(text).toMatch(/PDF, Word, PowerPoint or Excel file itself/i);
    expect(text).toMatch(/could not reproduce one page/i);
  });

  it("states the identity guarantees affirmatively and never overclaims (v1.68.0)", () => {
    // The overclaim guard survives the identifier removal: a file NAME can
    // still name a person and a shared report still quotes short labels, so
    // "no personal data" stays banned even now that no email / IP / browser
    // identifier exists anywhere in the schema. What the card must now say
    // outright is the affirmative absence — no accounts, and no columns.
    const text = visibleText(renderStatusHtml({ ...PAYLOAD, backup: BACKUP_OK }));
    expect(text).not.toMatch(/no personal (data|information|details)/i);
    expect(text).not.toMatch(/(contains|holds) no PII/i);
    expect(text).not.toMatch(/anonymous|anonymi[sz]ed/i);
    expect(text).toMatch(/no accounts or sign-in/i);
    expect(text).toMatch(/no column for an email address, an IP address, or a browser/i);
    expect(text).toMatch(/says nothing about who did the checking/i);
  });

  it("keeps the explanation on every backup state, not just the healthy one", () => {
    // "Why is this backed up at all" is not a question that only applies
    // when the last run succeeded.
    for (const status of ["ok", "stale", "unavailable"]) {
      const html = renderBackup({ ...PAYLOAD, backup: { ...BACKUP_OK, status } });
      expect(visibleText(html), `status=${status}`).toContain(
        "Why back up anything if documents aren't stored?",
      );
    }
  });

  it("names what is backed up in the collapsed peek, not only in the body", () => {
    // A byte size next to a service that promises never to keep your file
    // reads as "28 MB of files" — the one impression the card exists to
    // prevent, and the only text a reader who never expands it will see.
    const html = renderBackup({ ...PAYLOAD, backup: BACKUP_OK });
    const summary = html.slice(html.indexOf("<summary>"), html.indexOf("</summary>"));
    expect(summary).toContain("records, not documents");
  });

  it("links to the full accounting rather than restating it", () => {
    const html = renderBackup({ ...PAYLOAD, backup: BACKUP_OK });
    expect(html).toContain('href="/data-retention#backups-explained"');
    // Same-origin, and still no script surface on a CSP-strict page.
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/<script/i);
    expect(renderStatusHtml({ ...PAYLOAD, backup: BACKUP_OK })).not.toMatch(/<script/i);
  });

  it("stays behind the fold — a healthy backup does not turn the page into an essay", () => {
    // The card earned a long explanation; the PAGE did not. renderStatusHtml's
    // "keeps the prose bounded" test covers the default view, and this pins
    // the mechanism that keeps it true: all of this text lives inside a
    // collapsed <details>.
    const html = renderBackup({ ...PAYLOAD, backup: BACKUP_OK });
    expect(html).toContain('<details class="card">');
    expect(html).not.toContain('<details class="card" open>');
    const bodyStart = html.indexOf('<div class="card-body">');
    expect(bodyStart).toBeGreaterThan(-1);
    expect(html.indexOf("Why back up anything")).toBeGreaterThan(bodyStart);
  });

  it("renders nothing at all for a payload with no backup field", () => {
    // Additive, like every curated card: an older API build must not start
    // emitting an explanation of a backup it never reported.
    expect(renderBackup(PAYLOAD)).toBe("");
    expect(renderStatusHtml(PAYLOAD)).not.toContain("Why back up anything");
  });
});

describe("data-retention § 7a — the same answer, for someone reading the policy", () => {
  it("exists as an anchored section the status card can link to", () => {
    expect(RETENTION_SECTION).toContain('id="backups-explained"');
    expect(RETENTION_SECTION).toMatch(
      /7a\. Why anything is backed up when documents aren't stored/,
    );
  });

  it("is reachable from the table of contents", () => {
    // The page is long enough that an unlisted section is an unfindable one.
    expect(RETENTION_PAGE).toContain('href="#backups-explained"');
  });

  it("draws the two lanes rather than only asserting the conclusion", () => {
    const text = visibleText(RETENTION_SECTION);
    expect(text).toContain("Your document");
    expect(text).toContain("The audit metadata");
    // Each lane ends in its own verdict — the point of setting them side by side.
    expect(text).toMatch(/Never written to disk, so it cannot be in a backup/i);
    expect(text).toMatch(/only this .{0,10} is what the nightly backup copies/i);
  });

  it("states the personal detail the metadata can still carry", () => {
    const text = visibleText(RETENTION_SECTION);
    expect(text).not.toMatch(/no personal (data|information|details)/i);
    // The affirmative absences an auditor verifies against the schema...
    expect(text).toMatch(/no accounts, no sign-in/i);
    expect(text).toMatch(/no email, IP-address, or browser column/i);
    // ...and the one personal thing that remains, which a records officer
    // most needs named: the file name is kept as uploaded.
    expect(text).toMatch(/file named after a person stores that person's name/i);
  });

  it("keeps § 8 pointing at the same conclusion", () => {
    expect(visibleText(STORED_SECTION)).toMatch(/records of audits, never the audited files/i);
  });
});
