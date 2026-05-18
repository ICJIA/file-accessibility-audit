# PDF Remediation Spike — OpenDataLoader (basic vs hybrid)

_Generated: 2026-05-18T12:57:53.422Z_

Pipeline: qpdf preprocess (--object-streams=disable) → ODL basic OR ODL hybrid (docling-fast) → audit + validate.

## Summary

| PDF | Tagged | Pages | Input | Basic ODL | Hybrid ODL | Manual ceiling |
|-----|--------|-------|-------|-----------|------------|----------------|
| ILHEALSFallWinter2022FINAL.pdf | no | 4 | 49.0 F | 90.0 A ✓ (+41.0, 0.6s) | 90.0 A ✓ (+41.0, 35.4s) | 55.0 F |
| WomenInPolicing2021-210525T15080148.pdf | yes | 37 | 65.0 D | 75.0 C ✓ (+10.0, 1.4s) | 75.0 C ✓ (+10.0, 11.7s) | 81.0 B |
| FY_22_ICJIA_Annual_Report_7c7ba4f4f0.pdf | yes | 30 | 39.0 F | 57.0 F ✓ (+18.0, 2.3s) | 62.0 D ✓ (+23.0, 28.9s) | 67.0 D |
| 2009 MV Annual Report.pdf | no | 24 | 46.0 F | 82.0 B ✓ (+36.0, 1.2s) | 82.0 B ✓ (+36.0, 23.3s) | – |
| 2022 SFS Process Evaluation Report-230622T16355531.pdf | yes | 51 | 62.0 D | 65.0 D ✓ (+3.0, 2.1s) | 66.0 D ✓ (+4.0, 10.5s) | – |
| DVFR_Biennial_Report_2024_FINAL_PUBLISHED_d01bf7bffd_b7889a939d.pdf | no | 4 | 62.0 D | 71.0 C ✓ (+9.0, 0.4s) | 71.0 C ✓ (+9.0, 0.5s) | – |
| Juvenile Justice System and Risk Factor Data 2007 Annual Report.pdf | no | 246 | 51.0 F | 53.0 F ✓ (+2.0, 37.0s) | 53.0 F ✓ (+2.0, 559.0s) | – |
| COVID arrests PDF to post on web-210305T17262965.pdf | yes | 18 | 60.0 D | 59.0 F ✓ (-1.0, 1.4s) | 59.0 F ✓ (-1.0, 6.5s) | – |
| FINAL REPORT PDF FOR POSTING-230207T16344430.pdf | yes | 10 | 62.0 D | 68.0 D ✓ (+6.0, 0.5s) | 65.0 D ✓ (+3.0, 15.9s) | – |
| Full_DJJ_Recidivism_Report_3-7-2019-191011T20092914.pdf | yes | 34 | 57.0 F | 62.0 D ✓ (+5.0, 2.9s) | 59.0 F ✓ (+2.0, 18.1s) | – |
| inaccessible.pdf | no | 30 | 46.0 F | 85.0 B ✓ (+39.0, 0.9s) | 85.0 B ✓ (+39.0, 49.3s) | – |
| accessible.pdf | yes | 1 | 92.0 A | 92.0 A ✓ (+0.0, 0.4s) | 92.0 A ✓ (+0.0, 4.3s) | – |

## Aggregate: basic vs hybrid

| Bucket | Mode | N | Avg Δ | Damaged | Wins (Δ≥+15) |
|--------|------|---|-------|---------|--------------|
| Untagged input | basic | 5 | +25.4 | 0 | 3 |
| Untagged input | hybrid | 5 | +25.4 | 0 | 3 |
| Tagged input | basic | 7 | +5.9 | 0 | 1 |
| Tagged input | hybrid | 7 | +5.9 | 0 | 1 |

## ILHEALSFallWinter2022FINAL.pdf

- Producer: Canva / Canva · Pages: 4 · Tagged: **no** · Size: 1270 KB
- Input score: **49.0 (F)** · Manual ceiling: 55.0 (F)

| Category | Input | Basic | Hybrid |
|----------|-------|-------|--------|
| text_extractability | – | 100.0 | 100.0 |
| title_language | – | 100.0 | 100.0 |
| heading_structure | – | 75.0 | 75.0 |
| alt_text | – | 100.0 | 100.0 |
| pdf_ua_compliance | – | – | – |
| bookmarks | – | – | – |
| table_markup | – | – | – |
| color_contrast | – | – | – |
| link_quality | – | 89.0 | 89.0 |
| reading_order | – | 40.0 | 40.0 |
| form_accessibility | – | – | – |

## WomenInPolicing2021-210525T15080148.pdf

- Producer: Adobe InDesign 16.1 (Windows) / Adobe PDF Library 15.0 · Pages: 37 · Tagged: **yes** · Size: 1390 KB
- Input score: **65.0 (D)** · Manual ceiling: 81.0 (B)

| Category | Input | Basic | Hybrid |
|----------|-------|-------|--------|
| text_extractability | – | 85.0 | 85.0 |
| title_language | – | 50.0 | 50.0 |
| heading_structure | – | 75.0 | 75.0 |
| alt_text | – | 50.0 | 50.0 |
| pdf_ua_compliance | – | – | – |
| bookmarks | – | 100.0 | 100.0 |
| table_markup | – | 87.0 | 85.0 |
| color_contrast | – | – | – |
| link_quality | – | 81.0 | 81.0 |
| reading_order | – | 100.0 | 100.0 |
| form_accessibility | – | – | – |

## FY_22_ICJIA_Annual_Report_7c7ba4f4f0.pdf

- Producer: Adobe InDesign 18.2 (Windows) / Adobe PDF Library 17.0 · Pages: 30 · Tagged: **yes** · Size: 2812 KB
- Input score: **39.0 (F)** · Manual ceiling: 67.0 (D)

| Category | Input | Basic | Hybrid |
|----------|-------|-------|--------|
| text_extractability | – | 100.0 | 100.0 |
| title_language | – | 50.0 | 50.0 |
| heading_structure | – | 55.0 | 75.0 |
| alt_text | – | 50.0 | 46.0 |
| pdf_ua_compliance | – | – | – |
| bookmarks | – | 0.0 | 0.0 |
| table_markup | – | 62.0 | 70.0 |
| color_contrast | – | – | – |
| link_quality | – | – | – |
| reading_order | – | 40.0 | 70.0 |
| form_accessibility | – | – | – |

## 2009 MV Annual Report.pdf

- Producer: Acrobat PDFMaker 8.0 for Word / Acrobat Distiller 8.0.0 (Windows) · Pages: 24 · Tagged: **no** · Size: 211 KB
- Input score: **46.0 (F)**

| Category | Input | Basic | Hybrid |
|----------|-------|-------|--------|
| text_extractability | – | 85.0 | 85.0 |
| title_language | – | 50.0 | 50.0 |
| heading_structure | – | 75.0 | 75.0 |
| alt_text | – | 100.0 | 100.0 |
| pdf_ua_compliance | – | – | – |
| bookmarks | – | 100.0 | 100.0 |
| table_markup | – | 82.0 | 90.0 |
| color_contrast | – | – | – |
| link_quality | – | 100.0 | 100.0 |
| reading_order | – | 70.0 | 70.0 |
| form_accessibility | – | – | – |

## 2022 SFS Process Evaluation Report-230622T16355531.pdf

- Producer: Microsoft® Word for Microsoft 365 / Microsoft® Word for Microsoft 365 · Pages: 51 · Tagged: **yes** · Size: 1015 KB
- Input score: **62.0 (D)**

| Category | Input | Basic | Hybrid |
|----------|-------|-------|--------|
| text_extractability | – | 85.0 | 85.0 |
| title_language | – | 50.0 | 50.0 |
| heading_structure | – | 75.0 | 75.0 |
| alt_text | – | 67.0 | 67.0 |
| pdf_ua_compliance | – | – | – |
| bookmarks | – | 0.0 | 0.0 |
| table_markup | – | 70.0 | 75.0 |
| color_contrast | – | – | – |
| link_quality | – | 81.0 | 81.0 |
| reading_order | – | 100.0 | 100.0 |
| form_accessibility | – | – | – |

## DVFR_Biennial_Report_2024_FINAL_PUBLISHED_d01bf7bffd_b7889a939d.pdf

- Producer: Adobe Acrobat Pro 2020 20.5.30574 / Adobe Acrobat Pro 2020 20.5.30574 · Pages: 4 · Tagged: **no** · Size: 1878 KB
- Input score: **62.0 (D)**

| Category | Input | Basic | Hybrid |
|----------|-------|-------|--------|
| text_extractability | – | 100.0 | 100.0 |
| title_language | – | 50.0 | 50.0 |
| heading_structure | – | 75.0 | 75.0 |
| alt_text | – | 40.0 | 40.0 |
| pdf_ua_compliance | – | – | – |
| bookmarks | – | – | – |
| table_markup | – | – | – |
| color_contrast | – | – | – |
| link_quality | – | – | – |
| reading_order | – | 100.0 | 100.0 |
| form_accessibility | – | – | – |

## Juvenile Justice System and Risk Factor Data 2007 Annual Report.pdf

- Producer: Adobe Acrobat 8.0 Combine Files / Acrobat Distiller 8.0.0 (Windows) · Pages: 246 · Tagged: **no** · Size: 7301 KB
- Input score: **51.0 (F)**

| Category | Input | Basic | Hybrid |
|----------|-------|-------|--------|
| text_extractability | – | 85.0 | 85.0 |
| title_language | – | 0.0 | 0.0 |
| heading_structure | – | 55.0 | 55.0 |
| alt_text | – | 13.0 | 11.0 |
| pdf_ua_compliance | – | – | – |
| bookmarks | – | 100.0 | 100.0 |
| table_markup | – | 57.0 | 55.0 |
| color_contrast | – | – | – |
| link_quality | – | 84.0 | 84.0 |
| reading_order | – | 70.0 | 70.0 |
| form_accessibility | – | – | – |

## COVID arrests PDF to post on web-210305T17262965.pdf

- Producer: Adobe Acrobat Pro 11.0.23 / Adobe Acrobat Pro 11.0.23 · Pages: 18 · Tagged: **yes** · Size: 711 KB
- Input score: **60.0 (D)**

| Category | Input | Basic | Hybrid |
|----------|-------|-------|--------|
| text_extractability | – | 85.0 | 85.0 |
| title_language | – | 0.0 | 0.0 |
| heading_structure | – | 75.0 | 75.0 |
| alt_text | – | 16.0 | 10.0 |
| pdf_ua_compliance | – | – | – |
| bookmarks | – | 100.0 | 100.0 |
| table_markup | – | 80.0 | 85.0 |
| color_contrast | – | – | – |
| link_quality | – | 87.0 | 87.0 |
| reading_order | – | 70.0 | 70.0 |
| form_accessibility | – | – | – |

## FINAL REPORT PDF FOR POSTING-230207T16344430.pdf

- Producer: Adobe Acrobat Pro 11.0.23 / Adobe Acrobat Pro 11.0.23 · Pages: 10 · Tagged: **yes** · Size: 550 KB
- Input score: **62.0 (D)**

| Category | Input | Basic | Hybrid |
|----------|-------|-------|--------|
| text_extractability | – | 85.0 | 85.0 |
| title_language | – | 0.0 | 0.0 |
| heading_structure | – | 75.0 | 75.0 |
| alt_text | – | 53.0 | 36.0 |
| pdf_ua_compliance | – | – | – |
| bookmarks | – | 100.0 | 100.0 |
| table_markup | – | 85.0 | 85.0 |
| color_contrast | – | – | – |
| link_quality | – | 92.0 | 92.0 |
| reading_order | – | 100.0 | 100.0 |
| form_accessibility | – | – | – |

## Full_DJJ_Recidivism_Report_3-7-2019-191011T20092914.pdf

- Producer: Adobe Acrobat Pro 11.0.23 / Adobe Acrobat Pro 11.0.23 · Pages: 34 · Tagged: **yes** · Size: 887 KB
- Input score: **57.0 (F)**

| Category | Input | Basic | Hybrid |
|----------|-------|-------|--------|
| text_extractability | – | 85.0 | 85.0 |
| title_language | – | 0.0 | 0.0 |
| heading_structure | – | 75.0 | 75.0 |
| alt_text | – | 31.0 | 15.0 |
| pdf_ua_compliance | – | – | – |
| bookmarks | – | 100.0 | 100.0 |
| table_markup | – | 77.0 | 75.0 |
| color_contrast | – | – | – |
| link_quality | – | 100.0 | 100.0 |
| reading_order | – | 70.0 | 70.0 |
| form_accessibility | – | – | – |

## inaccessible.pdf

- Producer: Writer / LibreOffice 4.2 · Pages: 30 · Tagged: **no** · Size: 1018 KB
- Input score: **46.0 (F)**

| Category | Input | Basic | Hybrid |
|----------|-------|-------|--------|
| text_extractability | – | 100.0 | 100.0 |
| title_language | – | 50.0 | 50.0 |
| heading_structure | – | 75.0 | 75.0 |
| alt_text | – | 100.0 | 100.0 |
| pdf_ua_compliance | – | – | – |
| bookmarks | – | 100.0 | 100.0 |
| table_markup | – | 85.0 | – |
| color_contrast | – | – | – |
| link_quality | – | 100.0 | 100.0 |
| reading_order | – | 70.0 | 70.0 |
| form_accessibility | – | – | – |

## accessible.pdf

- Producer: Microsoft Word · Pages: 1 · Tagged: **yes** · Size: 152 KB
- Input score: **92.0 (A)**

| Category | Input | Basic | Hybrid |
|----------|-------|-------|--------|
| text_extractability | – | 100.0 | 100.0 |
| title_language | – | 100.0 | 100.0 |
| heading_structure | – | 75.0 | 75.0 |
| alt_text | – | 100.0 | 100.0 |
| pdf_ua_compliance | – | – | – |
| bookmarks | – | – | – |
| table_markup | – | 77.0 | 75.0 |
| color_contrast | – | – | – |
| link_quality | – | 100.0 | 100.0 |
| reading_order | – | 90.0 | 90.0 |
| form_accessibility | – | – | – |

## Notes

- All ODL runs use input pre-normalized via `qpdf --object-streams=disable` (mitigation discovered in earlier spike pass).
- Validity check: `qpdf --check` must report no warnings/errors. ✗ DAMAGED = output is corrupted.
- Hybrid backend: `docling-fast` (default), no SmolVLM picture descriptions enabled in this run.

---

## SmolVLM (Tier 3 alt text) — aborted

Tried `opendataloader-pdf-hybrid --enrich-picture-description` (SmolVLM-256M vision model for AI-generated alt text). Aborted partway through because the model's continuous per-image inference on MPS consumed enough GPU/memory to make the host machine unusable.

Observations from the partial run:

- Setup itself is fast (~1.5s `DocumentConverter initialized`). The slowdown is **steady-state inference cost**, not initialization.
- On Apple Silicon (MPS), SmolVLM forward-passes per image starve the OS of GPU resources.
- On a CPU-only DigitalOcean droplet, the same model would either be impossibly slow (minutes per page) or OOM the box (typical small droplet is 2–4 GB RAM; SmolVLM + docling + EasyOCR resident set is well over 2 GB).

**Conclusion for the roadmap**: SmolVLM-based AI alt text **cannot share the same droplet as the audit/remediation API**. To pursue Tier 3 later, the realistic paths are:

1. **Hosted vision API** (Claude vision, GPT-4o vision) — pay per image, no infra. Likely cheapest at our volume.
2. **Dedicated worker droplet** with GPU, queued separately from the API. Highest infra cost.
3. **Managed inference platform** (Replicate, Modal, RunPod) — pay per inference, model hosted by them.

Tier 3 is explicitly **deferred from v1** and will require its own design pass when prioritized.