# PDF Remediation — Interactive Alt-Text Walkthrough Spec

**Status:** Design — Phase 1 of the post-v1 roadmap.
**Companion docs:** `docs/pdf-remediation-integration-plan.md` (v1 architecture),
`docs/spike-remediation-results.md` (OpenDataLoader feasibility data).

## Context

The auto-remediation feature (`feat/pdf-remediation`, shipping as v1.18.0) ships
basic OpenDataLoader structure tagging with a post-flight veraPDF check and a
per-profile regression guard. It reliably moves untagged PDFs from F-grade
into B/A territory on the audit's headline metrics.

The remaining gap is **alt text for figures**. ODL marks figures as
`/Figure` structure elements but cannot author meaningful descriptions —
"Image of a bar chart" is the best a 256M-parameter vision model produces,
and a hosted vision API costs money + creates AI-dependence we want to
avoid.

This spec describes an **AI-free, user-driven walkthrough** that lets the
agency author add meaningful alt text one figure at a time, then writes
those descriptions back into the PDF's structure tree via `pdf-lib`. The
output is auditor-grade, regulatorily durable, and respects user agency
(including the user's right to decline manual work as a documented
choice).

## Framing principles (carried over from the integration plan)

- **Assist, don't replace, manual review.** The walkthrough is opt-in —
  declining is fine and goes into the receipt as "user skipped alt-text
  walkthrough."
- **Net gains only.** Saving a partial walkthrough must never *decrease*
  any visible metric. If the user adds 3 of 7 alt texts, the score should
  reflect 3 newly-described figures, not a partial state that looks worse.
- **No AI in the v1 walkthrough.** Suggestion-via-vision-API stays on the
  roadmap (Phase 3+); v1 is purely human.
- **Privacy posture unchanged.** The output PDF still gets deleted on
  first download; the walkthrough can extend the TTL but only within
  bounded limits.

## Architecture

State machine for a remediation job, extended with the enhance phase:

```
[pending] → [running] → [complete (basic)]
                              │
                              ├─ user opens walkthrough → [enhancing]
                              │       │
                              │       └─ user saves & finishes → [complete (enhanced)]
                              │
                              └─ user downloads basic output → [expired]
```

The walkthrough is a side-effecting workflow on top of an already-`complete`
job. The user can either:

1. Download the basic-remediation output (existing flow, completes the job)
2. Open the walkthrough, author alt texts, save → re-validate → new output
   replaces the basic one → download enhanced version

The job row gains an `enhancement_state` column to track which path was
chosen.

## Scope decisions (locked for v1 of the walkthrough)

- **Alt text only.** Table headers, reading order, and heading levels are
  separate walkthroughs in their own future specs.
- **Single session.** Closing the tab discards in-progress edits. No
  persistent-draft state machinery. Restart from scratch.
- **Skip allowed at any point.** Save-and-skip-rest acceptable. Per-image
  "this is decorative" also acceptable. Forcing the user to author every
  description would burn them out and lower completion rates.
- **Output replaces basic output.** Only one file lives in
  `data/remediation/<jobId>/output.pdf` — the enhanced version overwrites
  the basic one. Avoids retention complexity.
- **Output TTL extends by 30 min when walkthrough starts.** Bounded
  extension to allow the user to complete a typical 30-page document
  without timing out, but still cleaned up the same day.

## UX flow

### Entry point (result page)

The "outstanding issues" expandable in the After card already lists alt
text as a remaining gap. Add a primary action above the per-category
breakdown:

```
┌─────────────────────────────────────────────────────┐
│ N figures still need descriptions                    │
│ Auto-remediation marked the figures but couldn't     │
│ write meaningful alt text. Want to add them now?     │
│ ~30 seconds per figure.                              │
│                                                      │
│ [ Add Alt Text → ]  [ Skip — download as-is ]        │
└─────────────────────────────────────────────────────┘
```

Clicking "Add Alt Text" → `/remediate/<jobId>/enhance`. Clicking "Skip"
proceeds to download.

### Walkthrough page (`pages/remediate/[jobId]/enhance.vue`)

```
┌─────────────────────────────────────────────────────┐
│  Adding alt text — figure 3 of 7                     │
│  ████████████░░░░░░░░  43%                            │
│                                                      │
│  ┌─────────────────────────────────────┐             │
│  │                                     │             │
│  │     [rendered figure preview]       │             │
│  │     (bounded by struct element      │             │
│  │      bbox; aspect-ratio preserved)  │             │
│  │                                     │             │
│  └─────────────────────────────────────┘             │
│                                                      │
│  ☐ This image is decorative (skip alt text)          │
│                                                      │
│  ┌─────────────────────────────────────┐             │
│  │ Describe what's in this image…      │             │
│  │                                     │             │
│  └─────────────────────────────────────┘             │
│  Plain language, 1–2 sentences. Don't say            │
│  "image of" — screen readers add that.               │
│                                                      │
│  [ ← Back ]  [ Skip ]  [ Save & Next → ]             │
│                                                      │
│  Keyboard: ←/→ navigate, S to skip, Enter to save    │
└─────────────────────────────────────────────────────┘
```

Behaviors:

- **Back** restores the previous edit (in-memory only).
- **Skip** records "user declined" for this figure and moves on.
- **Save & Next** validates the text (non-empty if not decorative) and
  moves on.
- After the last figure: a "review and save" summary screen showing
  every edit before the user commits.
- Save-all → calls `POST /api/remediate/:jobId/enhance` with the edits.

### Save-all screen

```
┌─────────────────────────────────────────────────────┐
│  Review your edits                                   │
│                                                      │
│  ✓ Figure 1: "Bar chart of arrests by year…"        │
│  ✓ Figure 2: marked decorative                       │
│  ✓ Figure 3: "Photo of the courthouse exterior."    │
│  – Figure 4: skipped (no description provided)       │
│  ✓ Figure 5: "Map of Illinois counties…"            │
│                                                      │
│  [ ← Back to edits ]  [ Save & download → ]          │
└─────────────────────────────────────────────────────┘
```

### Download

Same single-use token + delete-on-close behavior as the basic-remediation
download.

## API design

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/remediate/:jobId/figures` | Returns the list of `Figure` structure elements needing alt text: `[{ structRef, page, bbox, imageDataUrl }]`. The `imageDataUrl` is a base64-encoded PNG rendered server-side via pdfjs. Auth-gated, same email check as `/status`. |
| POST | `/api/remediate/:jobId/enhance` | Body: `{ edits: [{ structRef, altText?: string, decorative?: boolean, skipped?: boolean }] }`. Worker re-opens output, applies edits via `pdf-lib`, re-validates with `qpdf --check` + veraPDF, replaces the output file, refreshes `expires_at`. |

Edge cases:

- Calling `/figures` on a non-`complete` job → 409.
- Calling `/figures` after the user already downloaded → 410 (the file is
  gone; nothing to enhance).
- Calling `/enhance` with edits referencing a `structRef` we don't recognize
  → 400 with diagnostic.

## DB schema additions

```sql
ALTER TABLE remediation_jobs ADD COLUMN enhancement_state TEXT;
   -- null | 'started' | 'complete'
ALTER TABLE remediation_jobs ADD COLUMN enhancement_started_at INTEGER;
ALTER TABLE remediation_jobs ADD COLUMN enhancement_completed_at INTEGER;
ALTER TABLE remediation_jobs ADD COLUMN enhancement_edit_count INTEGER;
```

`remediation_events` gains new event types (no schema change — events table
is generic):

- `enhance_offered` — user landed on result page and saw the walkthrough offer
- `enhance_started` — user opened the walkthrough
- `enhance_edit` — one per edit (details: `{ structRef_hash, mode: 'alt'|'decorative'|'skipped', text_length }`); text content NOT in event payload
- `enhance_complete` — all edits applied + file re-validated
- `enhance_failed` — pdf-lib write or re-validation failed

## Frontend changes

New files:

- `apps/web/app/pages/remediate/[jobId]/enhance.vue` — the walkthrough page
- `apps/web/app/components/FigureEditor.vue` — one figure's preview + text field + decorative toggle + keyboard handling
- `apps/web/app/composables/useFigureWalkthrough.ts` — state machine (figures list, current index, edits map, save handler)

Edits:

- `pages/remediate/[jobId].vue` — outstanding-issues expandable gains the
  "Add Alt Text" primary action when alt_text category < threshold AND
  enhancement_state ≠ 'complete'.

## pdf-lib write-back approach

The output PDF coming out of ODL has `StructTreeRoot → ... → Figure` nodes
with empty `/Alt` properties. We need to:

1. Open the PDF via `PDFDocument.load(bytes)`.
2. Navigate to the `StructTreeRoot` via the catalog.
3. For each edit with a matching `structRef`:
   - If `decorative`: change the role from `Figure` to `Artifact` (marks the
     content as non-content; screen readers skip it).
   - Otherwise: set the `/Alt` property to the user's text.
4. Save via `pdfDoc.save()` → write to a new path → atomic-rename over the
   current output.
5. Re-run `qpdf --check` and veraPDF on the new output. If either fails,
   restore the previous output and report the failure.

`pdf-lib` exposes the catalog and indirect objects via its low-level API
(`PDFRef`, `PDFContext`, `PDFDict`). The structure-tree traversal is
manual but well-documented; the writer pattern is the same one the
spike's research recommended.

**Spike step (half day):** prove this works on the ILHEALS spike output —
add one alt text, save, re-audit, confirm the audit's `Alt Text on Images`
category score improves.

## Image extraction approach

For each `Figure` structure element, we need a preview to show the user.
Approach:

1. Parse the structure tree to enumerate `Figure` nodes and their
   page + MCID references.
2. Use `pdfjs-dist` (already in the stack) to load the PDF and render the
   relevant page region.
3. Use the structure element's bounding box (stored as a `/BBox` property
   or derivable from the content stream's MCID range) to crop the page
   render to just the figure.
4. Encode the cropped image as PNG, serve as base64 data URL in
   `/figures` response.

Fallback if bbox derivation fails: render the entire page and let the
user know which figure on the page we mean ("Figure 3 of 4 on page 7").

Server-side rendering keeps the client lightweight — no pdfjs in the
browser, no large PDF over the wire. The privacy posture stays unchanged:
the rendered image is generated, served, and forgotten in the same
request.

## Image ↔ struct element correlation

Each `Figure` has an MCID that points into the page content stream. The
content stream contains marked-content sections (`/MCID 7 ... /EMC`) that
wrap the image XObject reference. By walking both the structure tree and
the content stream once at `/figures` request time, we build a mapping:

```
structRef → { page: number, mcid: number, imageXObjectRef: string,
              bbox: [x, y, w, h] }
```

This mapping is ephemeral — recomputed on every `/figures` request. We
don't store it.

## Privacy & retention adjustments

The integration plan's retention rules are tightened by adding three
explicit changes for the walkthrough:

1. **Output TTL extends by 30 min when `enhance_started` fires.** Bounded;
   does not enable unlimited retention.
2. **The figures-preview response is not cached.** Each `/figures` call
   re-renders. Avoids creating a second copy of the PDF's contents in
   memory.
3. **`enhance_edit` event payloads NEVER contain alt-text content.** Only
   metadata: hashed struct ref, mode (alt/decorative/skipped), text
   length. Auditors can prove a human authored alt text without the
   audit log itself containing the descriptive text.

The receipt panel grows a section:

```
User-authored alt text:
  ✓ 5 figures described (avg 22 words)
  – 2 figures marked decorative
  – 1 figure skipped
```

## Security additions to threat model

Two new vectors to add to the threat-model table in the integration plan:

| # | Attack vector | Defense |
|---|---------------|---------|
| 16 | **Malicious user input in alt-text fields** (XSS, injection of structure-tree primitives). | `pdf-lib`'s string-setting API escapes PDF special characters automatically. Frontend escapes when displaying alt text in the receipt review screen. Max length 500 chars enforced server-side. |
| 17 | **Race between enhance and basic-download.** User starts a download with the basic-output token, then the worker overwrites the output mid-stream. | The basic-download flow marks `status='expired'` BEFORE streaming (already added in v1.18.0); a subsequent `/enhance` call validates `status === 'complete' && enhancement_state !== 'started_elsewhere'` before proceeding. |

## Verification

End-to-end manual smoke test (uses the existing ICJIA fixtures):

1. Upload `controls/ILHEALSFallWinter2022FINAL.pdf`. Auto-remediate.
2. Result page shows "N figures still need descriptions" with the Add Alt
   Text action.
3. Click in. Walkthrough renders each figure with a preview.
4. Add alt text to 3 figures, mark 2 decorative, skip 1. Save.
5. Confirm:
   - Downloaded PDF passes `qpdf --check`.
   - `Alt Text on Images` category score in re-audit ≥ baseline.
   - Receipt shows the "User-authored alt text" section with correct counts.
   - DB: `remediation_events` contains one `enhance_edit` per figure handled.
   - DB: `remediation_jobs.enhancement_state = 'complete'`.
6. Re-run the page; the walkthrough offer is gone (`enhancement_state ==
   'complete'`).

Automated test (`apps/api/src/__tests__/remediation-enhance.test.ts`):

- Worker round-trip: create job, run basic pipeline, then mock
  user-provided edits → run enhance pipeline → assert audit's alt-text
  score improves.
- pdf-lib edits survive `qpdf --check`.
- Privacy assertion: `enhance_edit` event payloads contain no alt-text
  characters.

## Out of scope (will be separate specs)

- Table-header walkthrough (mark `TH` cells, set `Scope`)
- Reading-order walkthrough (reorder structure elements when xycut is wrong)
- Heading-level walkthrough (demote/promote `H1`/`H2`/`H3`)
- AI suggestion overlay for alt text (Phase 3 — hosted vision API)
- Multi-session / persistent draft (the Phase 1 walkthrough is single-session by design)
