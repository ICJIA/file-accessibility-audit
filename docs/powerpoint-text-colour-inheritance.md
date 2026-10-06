# PowerPoint Text Colour, Followed Through the Text Styles (v1.166.0)

**Date:** 2026-10-06
**Version:** v1.166.0
**Scope:**
- `packages/analyzer`:
  - `pptxService.ts`: each run's colour, size and weight resolved through the text styles (`RunLook`, `listStyleLook`, `ContrastContext.textLook`), link text in the theme's link colour (`linkFill`), highlights (`judgeRun`), shrink-to-fit (`fontScaleOf`), `useBgFill` backdrops (`shapeFill`), painters read strictly (`painterOf`), and colour-map overrides (`agreedScheme`).
  - `placeholderAlt.ts`: page labels in both forms.
  - `scoring/pptx.ts`, `scoring/conformance.ts`: the contrast explanation and the "not assessed" reason.
- Traps 217 (PDF) and 218–222 (PowerPoint).
- Gate: `office-encoding-invariance` grows to 89 encodings.
- Tests: `pptxInheritedText` (28, new), `placeholderAltText` (+9).

Two user decisions, both asked on 2026-10-06 after v1.165.0 shipped, and both extending a rule that release introduced.

---

## 1. Text colour and size, followed ("follow it")

**The question:** should the checker follow text colour and size through the placeholder, layout and master text styles, the way v1.165.0 follows backgrounds? **The answer:** yes, under the same strict rules: one stated colour, theme colours under the colour map, no modifier and no gradient guessed at.

**Why it mattered.** Most text in a deck sets no colour of its own. Across the 10 real decks in the test set, **64 of 900** text runs carried a colour the old check could read. Every other run was "not assessed", including whole decks of grey body text a template might set.

**The chain**, highest first, for each run at its paragraph's outline level:

| Source | Applies to |
|---|---|
| The run's own properties (`a:rPr`) | every run |
| The paragraph's own run defaults (`a:pPr/a:defRPr`) | known only where they agree with what lies beneath (see below) |
| The shape's own list style (`a:lstStyle`) | every shape |
| A placeholder's layout placeholder (matched by `idx`, else type), then its master placeholder, then the master's **title**, **body** or **other** text style by placeholder type | placeholders |
| The shape's theme-style font colour (`p:style/a:fontRef`), then the master's **other** style and the presentation's **defaults**, which must agree | any other shape |

Each list style is read at the run's level, falling back to its default paragraph (`a:defPPr`). Text that no source makes bold is not bold. A size is scaled by the slide's shrink-to-fit (`a:normAutofit fontScale`, written `62500` or `62.5%`). Where the slide states no shrink of its own but its layout or master placeholder carries one, the size is unknown.

**Where PowerPoint's precedence is not certain, disagreement means unknown, never a guess:**
- **A paragraph's own run defaults.** LibreOffice applies them; whether PowerPoint does over the styles is not settled, so they count only where they agree. All 29 instances in the real decks are empty.
- **A text box's two possible defaults:** the master's other style and the presentation's defaults. PowerPoint writes them alike; in every real deck in the test set they agree.
- **A theme-style font colour on a placeholder**, and a shape's own list style against its theme-style font colour.
- **A slide that re-maps its theme colours** (`clrMapOvr`, a dark slide in a light deck). The text on it is drawn under the slide's mapping; that is what the override is for. Whether the layout's and master's *graphics* are re-mapped too is not certain, so they keep only the colours both readings give alike. This also closes a false accusation that predates this release: the master's background was read under the master's own colours, so white text could fail at 1:1.

**Strict colours.** One stated colour, as for backgrounds. A shaded (`lumMod`/`lumOff`, PowerPoint's "lighter 40%"), tinted or see-through (`alpha`) colour is unknown, and so is text on a picture or gradient. In the real decks the modified text colours are almost all transparency (`alpha` 60–80%); the rest are shades.

### Three readings the chain needed, each verified on real files

1. **Link text.** PowerPoint draws a link in the theme's link colour, whatever the run states, unless the link carries PowerPoint 2019's "use the text colour" mark (the 2018 `hlinkClr` extension, `val="tx"`), which earlier versions ignore. With that mark the colour is known only if the two agree. Following the chain without this rule read four links in a real deck as the inherited black; LibreOffice's rendering shows them in the link blue (on the white backdrop of reading 2 below). Rendering a second deck showed a link whose run says white drawn in the theme's teal.
2. **`useBgFill` backdrops.** PowerPoint's Designer lays a full-slide rectangle under the content, marked "show the slide's background". Its theme style still names the accent fill an inserted shape would otherwise take. Five real decks carry 67 of them. Reading the style made the white slide blue for everything above it. LibreOffice draws them in the slide's white, so the background is now what the mark says. **One that also states a fill of its own** (a real Designer slide: `useBgFill` and an explicit black fill) is drawn black by LibreOffice. What PowerPoint draws there is not certain, so it is unknown when the two differ.
3. **Highlights.** A highlight paints a colour behind the run, so the run is judged against it.

### Misreads fixed (all predate this release)

| Trap | What the checker did | What is drawn |
|---|---|---|
| 219 | Six white titles on a band shaded 25% darker than accent 5 judged against plain #5B9BD5: **2.96:1, failed** (a real survey-results deck, contrast 50) | about #2F75B5, 4.85:1. Now unknown by the strict rule; the deck's contrast is 100 |
| 220 | A link whose run says white, on navy: **11.6:1, passed** | the theme's link blue on navy, 1.97:1, a real failure |
| 221 | Black on a yellow highlight, on navy: **1.81:1, failed** | black on yellow, 19.6:1 |

Also fixed, each pinned by a unit test, no file in the test set affected:
- the slide colour-map override above;
- a fill a placeholder inherits from its layout was ignored beneath later shapes;
- text inside a `useBgFill` shape was judged against its style's accent.

The painters beneath text (`painterOf`) now read fills exactly as a shape's own text background is read (`shapeFill`): strictly, theme fill references included.

### What it found on the real decks

**424 of 900** runs are now checked, up from 64. Every newly checked colour pair was censused by deck. Almost all are black on white, plus white on accent shapes (4.72:1), dark grey on white, and the template colours of a Google Slides deck. The one deck whose readings looked wrong, the Communication deck (black text on a template whose master background is "Text 1"), was rendered. Its template swaps the theme's colour names (`bg1="dk1" tx1="lt1"`), and LibreOffice shows black on white, as read.

The remaining 476 stay unassessed: 417 for their background (pictures, gradients, shaded fills, shapes partly overlapping) and 59 for their own colour (see-through or shaded).

| Deck | Contrast before → after |
|---|---|
| Communication with Federal Employees | not assessed → 100 (11 runs) |
| PWDOA Communication Strategies | not assessed → 100 (109) |
| PWDOA Part 3, Trauma Informed | not assessed → 100 (38) |
| Understanding Dynamics | not assessed → 100 (60) |
| DEI Climate Survey | 50 → 100 (six false failures gone) |

No deck's grade changed.

## 2. Page labels count as missing alt text ("count it as missing")

v1.165.0 counted file names and placeholder words as missing alt text (WCAG failure F30) and deliberately left OpenDataLoader's "Table (page 30)" outside the rule until the user decided. **The decision:** a page label counts as missing.

A page label is an object type and a page and nothing else. The corpus carries three forms:
- "Table (page N)" ×39, OpenDataLoader on remediated reports;
- "Illustration (page N)" ×2, the same tagger;
- "Illustration on page N" ×10, in two agency reports.

All three now match (`table|image|figure|chart|graph|picture|diagram|illustration`, then "(page N)" or "on page N"). Exact matches only: "Table 3 (page 30) shows awards by county" and "Illustration of the courthouse on page 3" stand.

| Document | Before → after |
|---|---|
| WomenInPolicing 2021, remediated (two copies) | 89/B → 69/D (alt 100 → 0, four labels) |
| Lewd Sexual Display 2024, remediated | 79/C → 69/D (alt 66 → 11, five labels) |
| FY22 Annual Report, remediated (two copies) | 69/D → 65/D (alt 100 → 0, thirteen labels) |
| CIEG | 89/B → 79/C (alt 81 → 65, six "Illustration on page N") |
| COVID Death in Custody | alt 70 → 64 (one), grade unchanged |

Remediation's own UI already says manual review of alt text is recommended. These reports now score the alt text they actually carry.

## 3. Follow-up for the user

**PowerPoint shades.** Word and Excel already compute their tints and shades. PowerPoint's approved rule leaves its shades (`lumMod`/`lumOff`) and transparency unknown. That is the deliberate choice, and it is why the DEI deck's titles are now unassessed rather than correctly passed. Computing `lumMod`/`lumOff` exactly would assess them, and transparency over a known solid background is also exactly computable. Both are a decision for the user; nothing here guesses.

## 4. Verification

- **Test-first.** `pptxInheritedText` (28): 23 RED first. Four of the five that passed before the code existed were proven by breaking their guard; the fifth pins that a run's own colour still wins. One test was tightened when its guard's removal still passed it. `placeholderAltText` +9.
- **Traps 217–222.** The released v1.165.0 analyzer fails all six: 217 at 100/A, 218 not assessed, 219 at a false 79/C, 220 at a false pass, 221 at a false 69/D, 222 not assessed. Removing the `useBgFill` guard alone fails 222 at 69/D. The first, narrower page-label rule fails 217 at 79/C.
- **Gate:** four new PowerPoint encodings (89 in all) — colour from the master's body style, colour from the text box's own style, shrink-to-fit in thousandths and as a percentage. The released analyzer diverges on both colour variants; breaking the percentage reading diverges its variant.
- **Ledger:** 353 rows; every movement above verified, three by LibreOffice rendering. All gates green.
