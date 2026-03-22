import type { CachedRow } from './cache.js'
import { CATEGORY_IDS, CATEGORY_LABELS, sortRowsDescending, auditToolLink, gradeDistribution, generateAssessment, splitByEra } from './csv.js'

const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#14b8a6',
  C: '#eab308',
  D: '#f97316',
  F: '#ef4444',
}

const GRADE_BG: Record<string, string> = {
  A: '#f0fdf4',
  B: '#f0fdfa',
  C: '#fefce8',
  D: '#fff7ed',
  F: '#fef2f2',
}

function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Build a compact JSON-serializable row for client-side rendering */
function toClientRow(row: CachedRow) {
  const cats: Record<string, { s: number | null; g: string; v: string }> = {}
  for (const catId of CATEGORY_IDS) {
    cats[catId] = {
      s: (row as any)[`${catId}_score`] ?? null,
      g: (row as any)[`${catId}_grade`] ?? '',
      v: (row as any)[`${catId}_severity`] ?? '',
    }
  }
  let tags: string[] = []
  if (row.tags) {
    try { tags = JSON.parse(row.tags) } catch {}
  }
  return {
    t: row.title ?? '',
    d: row.publication_date ?? '',
    g: row.grade ?? '',
    s: row.overall_score ?? null,
    u: row.file_url ?? '',
    c: row.critical_findings ?? '',
    p: row.page_count ?? null,
    pt: row.pub_type ?? '',
    sm: row.summary ?? '',
    tg: tags,
    at: row.audited_at ?? '',
    cats,
  }
}

export function generateHtml(rows: CachedRow[], generatedAt: Date, csvContent?: string): string {
  const sorted = sortRowsDescending(rows)
  const dateStr = generatedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = generatedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  const dist = gradeDistribution(sorted)
  const needsWork = dist.C + dist.D + dist.F
  const needsPct = sorted.length > 0 ? Math.round((needsWork / sorted.length) * 100) : 0
  const assessment = generateAssessment(dist, sorted.length)

  const { recent, legacy } = splitByEra(sorted)
  const recentDist = gradeDistribution(recent)
  const legacyDist = gradeDistribution(legacy)
  const recentNeedsWork = recentDist.C + recentDist.D + recentDist.F
  const recentNeedsPct = recent.length > 0 ? Math.round((recentNeedsWork / recent.length) * 100) : 0
  const recentAssessment = generateAssessment(recentDist, recent.length)

  // Category column headers
  let catHeaders = ''
  for (const catId of CATEGORY_IDS) {
    catHeaders += `<th class="cat-header" data-sort="num" data-key="cat_${catId}">${esc(CATEGORY_LABELS[catId])}<span class="sort-arrow"></span></th>`
  }

  const totalCols = 6 + CATEGORY_IDS.length + 1

  // Serialize row data for client-side rendering
  const clientRows = sorted.map(toClientRow)
  // Escape </script> in JSON to prevent premature tag close
  const rowsJson = JSON.stringify(clientRows).replace(/<\//g, '<\\/')

  // Serialize constants the client needs
  const catIdsJson = JSON.stringify(CATEGORY_IDS)
  const catLabelsJson = JSON.stringify(CATEGORY_LABELS)
  const gradeColorsJson = JSON.stringify(GRADE_COLORS)
  const gradeBgJson = JSON.stringify(GRADE_BG)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ICJIA Publication Accessibility Audit — ${esc(dateStr)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8f9fa; color: #1a1a1a; padding: 24px; }
  h1 { font-size: 1.5rem; margin-bottom: 4px; }
  .meta { color: #666; font-size: 0.9rem; margin-bottom: 20px; }

  .summary { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .summary-card { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px 24px; text-align: center; min-width: 100px; }
  .summary-card .count { font-size: 2rem; font-weight: 800; }
  .summary-card .label { font-size: 0.8rem; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }

  .legend { margin-bottom: 20px; font-size: 0.85rem; color: #555; }
  .legend span { display: inline-block; margin-right: 18px; }
  .legend .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }

  .table-wrap { overflow-x: auto; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; white-space: nowrap; }
  thead { position: sticky; top: 0; z-index: 2; }
  th { background: #1a1a1a; color: #fff; padding: 10px 12px; text-align: left; font-weight: 600; cursor: pointer; user-select: none; position: relative; }
  th:hover { background: #333; }
  th .sort-arrow { font-size: 0.7rem; margin-left: 4px; opacity: 0.3; }
  th.sorted-asc .sort-arrow, th.sorted-desc .sort-arrow { opacity: 1; }
  th.grade-header { background: #0f4c2a; text-align: center; font-size: 1rem; min-width: 70px; }
  th.score-header { background: #0f4c2a; text-align: center; }
  th.date-header { background: #1e3a5f; }
  th.cat-header { background: #2a2a2a; text-align: center; font-size: 0.75rem; font-weight: 400; padding: 8px 6px; }

  td { padding: 8px 12px; border-bottom: 1px solid #eee; vertical-align: middle; height: 44px; }
  tr { height: 44px; }
  .row-num { color: #aaa; text-align: center; font-size: 0.78rem; }
  .title-cell { font-weight: 500; min-width: 250px; }
  .title-cell .title-text { display: block; max-width: 400px; overflow-x: auto; white-space: nowrap; scrollbar-width: thin; }
  .title-cell .title-text::-webkit-scrollbar { height: 3px; }
  .title-cell .title-text::-webkit-scrollbar-thumb { background: #ccc; border-radius: 2px; }
  .date-cell { font-weight: 600; white-space: nowrap; }
  .grade-cell { text-align: center; font-size: 1.3rem; font-weight: 900; letter-spacing: 1px; border-left: 3px solid #e0e0e0; border-right: 3px solid #e0e0e0; }
  .score-cell { text-align: center; font-weight: 700; font-size: 0.95rem; }
  .link-cell a { color: #2563eb; text-decoration: none; font-size: 0.82rem; }
  .link-cell a:hover { text-decoration: underline; }
  .cat-score { text-align: center; font-size: 0.8rem; color: #666; }
  .cat-warn { color: #b45309; font-weight: 600; }
  .cat-critical { color: #dc2626; font-weight: 700; }
  .critical-cell { min-width: 200px; font-size: 0.78rem; color: #b91c1c; }
  .critical-cell .crit-text { display: block; max-width: 350px; overflow-x: auto; white-space: nowrap; scrollbar-width: thin; }
  .critical-cell .crit-text::-webkit-scrollbar { height: 3px; }
  .critical-cell .crit-text::-webkit-scrollbar-thumb { background: #ccc; border-radius: 2px; }

  .assessment { border-radius: 8px; padding: 20px 24px; margin-bottom: 24px; }
  .assessment.good { background: #f0fdf4; border: 2px solid #86efac; }
  .assessment.mixed { background: #fefce8; border: 2px solid #fde047; }
  .assessment.concern { background: #fff7ed; border: 2px solid #fdba74; }
  .assessment.critical { background: #fef2f2; border: 2px solid #fca5a5; }
  .assessment .headline { font-size: 1.25rem; font-weight: 800; margin-bottom: 8px; }
  .assessment.good .headline { color: #166534; }
  .assessment.mixed .headline { color: #854d0e; }
  .assessment.concern .headline { color: #9a3412; }
  .assessment.critical .headline { color: #991b1b; }
  .assessment .detail { font-size: 0.95rem; color: #374151; margin-bottom: 8px; }
  .assessment .action { font-size: 0.95rem; font-weight: 600; color: #1e3a5f; padding: 10px 14px; background: rgba(255,255,255,0.7); border-radius: 6px; }
  .assessment .action::before { content: "Recommended: "; font-weight: 800; }
  .remediation-stat { font-size: 0.9rem; margin-top: 10px; color: #555; }
  .remediation-stat strong { color: #dc2626; }

  .era-section { margin-bottom: 24px; }
  .era-section h2 { font-size: 1.1rem; margin-bottom: 12px; color: #1a1a1a; }
  .era-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 16px; }
  @media (max-width: 800px) { .era-grid { grid-template-columns: 1fr; } }
  .era-card { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; }
  .era-card h3 { font-size: 0.95rem; margin-bottom: 8px; color: #374151; }
  .era-card .era-stats { display: flex; gap: 10px; flex-wrap: wrap; font-size: 0.85rem; }
  .era-card .era-stats span { display: inline-block; }

  .main-row { cursor: pointer; }
  .main-row:hover td { background: #eef4ff; }
  .expand-icon { display: inline-block; width: 14px; font-size: 0.7rem; color: #888; transition: transform 0.15s; margin-right: 4px; }
  .main-row.expanded .expand-icon { transform: rotate(90deg); }
  .main-row.expanded td { background: #e8f0fe; border-bottom-color: #ccc; }

  .detail-row td { padding: 0 !important; background: #f4f7fb; height: auto; }
  .detail-row { height: auto; }
  .detail-cell { border-bottom: 2px solid #ccc !important; }
  .detail-panel { padding: 16px 24px 20px; }
  .detail-meta { display: flex; flex-wrap: wrap; gap: 12px 24px; font-size: 0.88rem; color: #374151; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid #ddd; }
  .detail-filename { color: #888; font-size: 0.8rem; word-break: break-all; }
  .detail-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 14px; }
  @media (max-width: 1200px) { .detail-grid { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 700px) { .detail-grid { grid-template-columns: repeat(2, 1fr); } }
  .detail-card { border-radius: 6px; padding: 10px 12px; }
  .detail-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .detail-cat-name { font-size: 0.78rem; font-weight: 600; color: #374151; }
  .detail-cat-grade { font-size: 1.1rem; font-weight: 900; }
  .detail-card-body { font-size: 0.8rem; color: #555; display: flex; gap: 8px; align-items: center; }
  .detail-score strong { color: #1a1a1a; }
  .detail-severity { padding: 1px 6px; border-radius: 3px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; }
  .sev-critical { background: #fef2f2; color: #dc2626; }
  .sev-major { background: #fff7ed; color: #ea580c; }
  .sev-minor { background: #fefce8; color: #a16207; }
  .sev-pass { background: #f0fdf4; color: #16a34a; }
  .detail-criticals { margin-bottom: 14px; font-size: 0.85rem; }
  .detail-criticals strong { color: #991b1b; }
  .detail-criticals ul { margin: 6px 0 0 20px; color: #b91c1c; }
  .detail-criticals li { margin-bottom: 3px; }
  .detail-summary { font-size: 0.88rem; color: #374151; margin-bottom: 14px; line-height: 1.5; }
  .detail-summary strong { color: #1a1a1a; }
  .detail-tags { margin-bottom: 14px; display: flex; gap: 6px; flex-wrap: wrap; }
  .detail-tag { display: inline-block; padding: 2px 10px; border-radius: 12px; background: #e0e7ff; color: #3730a3; font-size: 0.75rem; font-weight: 600; text-transform: lowercase; }
  .detail-pub-type { display: inline-block; padding: 3px 10px; border-radius: 4px; background: #f3f4f6; color: #4b5563; font-size: 0.8rem; font-weight: 600; margin-bottom: 14px; }
  .detail-actions { display: flex; gap: 10px; }
  .detail-action-btn { display: inline-block; padding: 8px 16px; border-radius: 5px; font-size: 0.85rem; font-weight: 600; text-decoration: none; background: #1e3a5f; color: #fff; }
  .detail-action-btn:hover { background: #2a4f7f; }
  .detail-action-secondary { background: #fff; color: #1e3a5f; border: 1px solid #1e3a5f; }
  .detail-action-secondary:hover { background: #f0f4f8; }

  .download-bar { margin-bottom: 20px; }
  .download-btn { display: inline-block; padding: 10px 20px; background: #1e3a5f; color: #fff; border: none; border-radius: 6px; font-size: 0.9rem; font-weight: 600; cursor: pointer; text-decoration: none; }
  .download-btn:hover { background: #2a4f7f; }

  .dist-chart { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px 24px; margin-bottom: 24px; }
  .dist-chart h2 { font-size: 1rem; margin-bottom: 14px; color: #1a1a1a; }
  .dist-bar-row { display: flex; align-items: center; margin-bottom: 8px; }
  .dist-label { width: 60px; font-weight: 700; font-size: 1rem; }
  .dist-bar-wrap { flex: 1; height: 28px; background: #f0f0f0; border-radius: 4px; overflow: hidden; position: relative; }
  .dist-bar { height: 100%; border-radius: 4px; min-width: 2px; transition: width 0.3s; }
  .dist-count { width: 70px; text-align: right; font-size: 0.88rem; font-weight: 600; color: #555; padding-left: 10px; }
  .dist-stacked { height: 36px; background: #f0f0f0; border-radius: 6px; overflow: hidden; display: flex; margin-top: 8px; }
  .dist-stacked-seg { height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; color: #fff; min-width: 0; }

  .pagination { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 16px; margin-bottom: 8px; flex-wrap: wrap; }
  .pagination button { padding: 6px 14px; border: 1px solid #ccc; border-radius: 5px; background: #fff; font-size: 0.85rem; cursor: pointer; font-weight: 600; }
  .pagination button:hover:not(:disabled) { background: #eef4ff; border-color: #2563eb; }
  .pagination button:disabled { opacity: 0.4; cursor: default; }
  .pagination button.active { background: #1e3a5f; color: #fff; border-color: #1e3a5f; }
  .pagination .page-info { font-size: 0.85rem; color: #666; margin: 0 8px; }

  footer { margin-top: 24px; color: #999; font-size: 0.8rem; text-align: center; }
  footer a { color: #2563eb; text-decoration: none; }
</style>
</head>
<body>

<h1>ICJIA Publication Accessibility Audit</h1>
<p class="meta">Generated ${esc(dateStr)} at ${esc(timeStr)} &mdash; ${sorted.length} publications &mdash; sorted by publication date, newest first</p>

<div class="summary">
  <div class="summary-card"><div class="count">${sorted.length}</div><div class="label">Total</div></div>
  <div class="summary-card"><div class="count" style="color:${GRADE_COLORS.A}">${dist.A}</div><div class="label">Grade A</div></div>
  <div class="summary-card"><div class="count" style="color:${GRADE_COLORS.B}">${dist.B}</div><div class="label">Grade B</div></div>
  <div class="summary-card"><div class="count" style="color:${GRADE_COLORS.C}">${dist.C}</div><div class="label">Grade C</div></div>
  <div class="summary-card"><div class="count" style="color:${GRADE_COLORS.D}">${dist.D}</div><div class="label">Grade D</div></div>
  <div class="summary-card"><div class="count" style="color:${GRADE_COLORS.F}">${dist.F}</div><div class="label">Grade F</div></div>
</div>

<div class="dist-chart">
  <h2>Grade Distribution</h2>
  ${['A', 'B', 'C', 'D', 'F'].map(g => {
    const count = dist[g]
    const pct = sorted.length > 0 ? (count / sorted.length) * 100 : 0
    return `<div class="dist-bar-row">
      <div class="dist-label" style="color:${GRADE_COLORS[g]}">${g}</div>
      <div class="dist-bar-wrap"><div class="dist-bar" style="width:${pct}%;background:${GRADE_COLORS[g]};"></div></div>
      <div class="dist-count">${count} (${Math.round(pct)}%)</div>
    </div>`
  }).join('\n  ')}
  <div class="dist-stacked">
    ${['A', 'B', 'C', 'D', 'F'].map(g => {
      const pct = sorted.length > 0 ? (dist[g] / sorted.length) * 100 : 0
      if (pct < 1) return ''
      return `<div class="dist-stacked-seg" style="width:${pct}%;background:${GRADE_COLORS[g]};">${pct >= 5 ? g : ''}</div>`
    }).join('')}
  </div>
</div>

<div class="assessment ${assessment.level}">
  <div class="headline">${esc(assessment.headline)}</div>
  <div class="detail">${esc(assessment.detail)}</div>
  <div class="action">${esc(assessment.action)}</div>
  <div class="remediation-stat">
    <strong>${needsWork} of ${sorted.length} files (${needsPct}%)</strong> need remediation &mdash;
    C: ${dist.C} &nbsp;&bull;&nbsp; D: ${dist.D} &nbsp;&bull;&nbsp; F: ${dist.F}
  </div>
</div>

<div class="legend">
  <strong>Grade:</strong>
  <span><span class="dot" style="background:${GRADE_COLORS.A}"></span> A = Excellent (90+)</span>
  <span><span class="dot" style="background:${GRADE_COLORS.B}"></span> B = Good (80+)</span>
  <span><span class="dot" style="background:${GRADE_COLORS.C}"></span> C = Needs Improvement (70+)</span>
  <span><span class="dot" style="background:${GRADE_COLORS.D}"></span> D = Poor (60+)</span>
  <span><span class="dot" style="background:${GRADE_COLORS.F}"></span> F = Failing (&lt;60)</span>
  &nbsp;&nbsp;|&nbsp;&nbsp; Category scores are 0–100. Click any row to expand details.
</div>

${csvContent ? `<div class="download-bar">
  <a class="download-btn" id="csv-download" download="publist-audit.csv">Download CSV Report</a>
</div>` : ''}

<div id="pagination-top" class="pagination"></div>

<div class="table-wrap">
<table>
<thead>
  <tr>
    <th data-sort="num" data-key="_num">#<span class="sort-arrow"></span></th>
    <th data-sort="str" data-key="t">Title<span class="sort-arrow"></span></th>
    <th class="date-header sorted-desc" data-sort="str" data-key="d">Published<span class="sort-arrow"> \\u25BC</span></th>
    <th class="grade-header" data-sort="grade" data-key="g">Grade<span class="sort-arrow"></span></th>
    <th class="score-header" data-sort="num" data-key="s">Score<span class="sort-arrow"></span></th>
    <th data-sort="none">Details</th>
    ${catHeaders}
    <th data-sort="str" data-key="c">Critical Issues<span class="sort-arrow"></span></th>
  </tr>
</thead>
<tbody id="report-tbody">
</tbody>
</table>
</div>

<div id="pagination-bottom" class="pagination"></div>

<footer>
  ICJIA File Accessibility Audit &mdash; <a href="https://audit.icjia.app" target="_blank">audit.icjia.app</a>
</footer>

${csvContent ? `<script>
(function() {
  var csv = decodeURIComponent("${encodeURIComponent(csvContent)}");
  var blob = new Blob([csv], { type: 'text/csv' });
  document.getElementById('csv-download').href = URL.createObjectURL(blob);
})();
</script>` : ''}
<script>
(function() {
  var DATA = ${rowsJson};
  var CAT_IDS = ${catIdsJson};
  var CAT_LABELS = ${catLabelsJson};
  var GC = ${gradeColorsJson};
  var GB = ${gradeBgJson};
  var AUDIT_BASE = 'https://audit.icjia.app';
  var PER_PAGE = 150;
  var TOTAL_COLS = ${totalCols};
  var gradeOrder = { A: 1, B: 2, C: 3, D: 4, F: 5 };

  var currentPage = 0;
  var expandedSet = new Set(); // track expanded original indices

  function h(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function auditLink(url) { return AUDIT_BASE + '?url=' + encodeURIComponent(url); }

  function sevClass(v) {
    if (v === 'Critical') return 'sev-critical';
    if (v === 'Major') return 'sev-major';
    if (v === 'Minor') return 'sev-minor';
    if (v === 'Pass' || v === 'Good') return 'sev-pass';
    return '';
  }

  function renderRow(r, globalIdx, displayNum) {
    var grade = r.g;
    var color = GC[grade] || '#888';
    var bg = GB[grade] || '#fff';
    var link = r.u ? auditLink(r.u) : '';
    var filename = r.u ? decodeURIComponent(r.u.split('/').pop() || '') : '';
    var isExpanded = expandedSet.has(globalIdx);

    // Category cells
    var catCells = '';
    for (var ci = 0; ci < CAT_IDS.length; ci++) {
      var cat = r.cats[CAT_IDS[ci]];
      var sc = cat.s;
      var cls = 'cat-score';
      if (sc !== null && sc < 40) cls += ' cat-critical';
      else if (sc !== null && sc < 70) cls += ' cat-warn';
      catCells += '<td class="' + cls + '">' + (sc != null ? sc : '') + '</td>';
    }

    // Detail cards
    var detailCards = '';
    for (var ci = 0; ci < CAT_IDS.length; ci++) {
      var catId = CAT_IDS[ci];
      var cat = r.cats[catId];
      var catColor = GC[cat.g] || '#888';
      var catBg = GB[cat.g] || '#f9f9f9';
      detailCards += '<div class="detail-card" style="border-left:3px solid ' + catColor + ';background:' + catBg + ';">' +
        '<div class="detail-card-header"><span class="detail-cat-name">' + h(CAT_LABELS[catId]) + '</span>' +
        '<span class="detail-cat-grade" style="color:' + catColor + ';">' + h(cat.g) + '</span></div>' +
        '<div class="detail-card-body"><span class="detail-score">Score: <strong>' + (cat.s != null ? cat.s : '\\u2014') + '</strong>/100</span>' +
        (cat.v ? '<span class="detail-severity ' + sevClass(cat.v) + '">' + h(cat.v) + '</span>' : '') +
        '</div></div>';
    }

    // Critical findings
    var critList = '';
    if (r.c) {
      var items = r.c.split('; ').map(function(f) { return '<li>' + h(f) + '</li>'; }).join('');
      critList = '<div class="detail-criticals"><strong>Critical Findings:</strong><ul>' + items + '</ul></div>';
    }

    var mainClass = 'main-row' + (isExpanded ? ' expanded' : '');
    var detailDisplay = isExpanded ? 'table-row' : 'none';

    // Format pubType for display
    var pubTypeLabel = r.pt ? r.pt.replace(/([A-Z])/g, ' $1').replace(/^./, function(c) { return c.toUpperCase(); }).trim() : '';

    // Tags
    var tagsHtml = '';
    if (r.tg && r.tg.length > 0) {
      tagsHtml = '<div class="detail-tags">';
      for (var ti = 0; ti < r.tg.length; ti++) tagsHtml += '<span class="detail-tag">' + h(r.tg[ti]) + '</span>';
      tagsHtml += '</div>';
    }

    // Summary
    var summaryHtml = r.sm ? '<div class="detail-summary"><strong>Summary:</strong> ' + h(r.sm) + '</div>' : '';

    return '<tr class="' + mainClass + '" data-idx="' + globalIdx + '">' +
      '<td class="row-num">' + displayNum + '</td>' +
      '<td class="title-cell"><span class="expand-icon">&#9654;</span> <span class="title-text">' + h(r.t) + '</span></td>' +
      '<td class="date-cell">' + h(r.d) + '</td>' +
      '<td class="grade-cell" style="background:' + bg + ';color:' + color + ';">' + h(grade) + '</td>' +
      '<td class="score-cell" style="color:' + color + ';">' + (r.s != null ? r.s : '') + '</td>' +
      '<td class="link-cell"><a href="' + h(link) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">View Full Analysis</a></td>' +
      catCells +
      '<td class="critical-cell"><span class="crit-text">' + h(r.c) + '</span></td>' +
      '</tr>' +
      '<tr class="detail-row" data-idx="' + globalIdx + '" style="display:' + detailDisplay + ';">' +
      '<td colspan="' + TOTAL_COLS + '" class="detail-cell"><div class="detail-panel">' +
      '<div class="detail-meta">' +
        '<span><strong>' + h(r.t) + '</strong></span>' +
        '<span>Published: ' + (h(r.d) || 'Unknown') + '</span>' +
        '<span>Pages: ' + (r.p != null ? r.p : '\\u2014') + '</span>' +
        '<span>Overall: <strong style="color:' + color + ';">' + grade + ' (' + (r.s != null ? r.s : '\\u2014') + ')</strong></span>' +
        (pubTypeLabel ? '<span>Type: ' + h(pubTypeLabel) + '</span>' : '') +
        (filename ? '<span class="detail-filename">' + h(filename) + '</span>' : '') +
        (r.at ? '<span>Audited: ' + h(r.at.slice(0, 10)) + '</span>' : '') +
      '</div>' +
      (pubTypeLabel ? '<div class="detail-pub-type">' + h(pubTypeLabel) + '</div>' : '') +
      summaryHtml +
      tagsHtml +
      '<div class="detail-grid">' + detailCards + '</div>' +
      critList +
      '<div class="detail-actions">' +
        '<a href="' + h(link) + '" target="_blank" rel="noopener" class="detail-action-btn">View Full Analysis in Audit Tool</a>' +
        (r.u ? '<a href="' + h(r.u) + '" target="_blank" rel="noopener" class="detail-action-btn detail-action-secondary">Download PDF</a>' : '') +
      '</div></div></td></tr>';
  }

  function renderPage() {
    var tbody = document.getElementById('report-tbody');
    var start = currentPage * PER_PAGE;
    var end = Math.min(start + PER_PAGE, DATA.length);
    var html = '';
    for (var i = start; i < end; i++) {
      html += renderRow(DATA[i], i, i + 1);
    }
    tbody.innerHTML = html;
    renderPagination();
    // Scroll table into view on page change
    document.querySelector('.table-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderPagination() {
    var totalPages = Math.ceil(DATA.length / PER_PAGE);
    if (totalPages <= 1) {
      document.getElementById('pagination-top').innerHTML = '';
      document.getElementById('pagination-bottom').innerHTML = '';
      return;
    }

    var start = currentPage * PER_PAGE + 1;
    var end = Math.min((currentPage + 1) * PER_PAGE, DATA.length);

    var html = '<button id="pg-prev" ' + (currentPage === 0 ? 'disabled' : '') + '>&laquo; Prev</button>';

    // Show page numbers with ellipsis
    var pages = [];
    for (var p = 0; p < totalPages; p++) {
      if (p === 0 || p === totalPages - 1 || Math.abs(p - currentPage) <= 2) {
        pages.push(p);
      } else if (pages[pages.length - 1] !== -1) {
        pages.push(-1); // ellipsis marker
      }
    }
    for (var pi = 0; pi < pages.length; pi++) {
      var p = pages[pi];
      if (p === -1) {
        html += '<span class="page-info">...</span>';
      } else {
        html += '<button class="pg-num' + (p === currentPage ? ' active' : '') + '" data-page="' + p + '">' + (p + 1) + '</button>';
      }
    }

    html += '<button id="pg-next" ' + (currentPage >= totalPages - 1 ? 'disabled' : '') + '>Next &raquo;</button>';
    html += '<span class="page-info">Showing ' + start + '\\u2013' + end + ' of ' + DATA.length + '</span>';

    document.getElementById('pagination-top').innerHTML = html;
    document.getElementById('pagination-bottom').innerHTML = html;

    // Bind events on both pagination bars
    ['pagination-top', 'pagination-bottom'].forEach(function(id) {
      var el = document.getElementById(id);
      el.querySelector('#pg-prev')?.addEventListener('click', function() { if (currentPage > 0) { currentPage--; renderPage(); } });
      el.querySelector('#pg-next')?.addEventListener('click', function() { if (currentPage < totalPages - 1) { currentPage++; renderPage(); } });
      el.querySelectorAll('.pg-num').forEach(function(btn) {
        btn.addEventListener('click', function() { currentPage = parseInt(btn.getAttribute('data-page')); renderPage(); });
      });
    });
  }

  // --- Expand / Collapse ---
  document.getElementById('report-tbody').addEventListener('click', function(e) {
    var mainRow = e.target.closest('tr.main-row');
    if (!mainRow) return;
    if (e.target.tagName === 'A') return;
    var idx = parseInt(mainRow.getAttribute('data-idx'));
    var detailRow = document.querySelector('tr.detail-row[data-idx="' + idx + '"]');
    if (!detailRow) return;
    var isOpen = mainRow.classList.contains('expanded');
    mainRow.classList.toggle('expanded');
    detailRow.style.display = isOpen ? 'none' : 'table-row';
    if (isOpen) expandedSet.delete(idx); else expandedSet.add(idx);
  });

  // --- Sorting ---
  var headers = document.querySelectorAll('thead th');
  headers.forEach(function(th) {
    var sortType = th.getAttribute('data-sort');
    if (sortType === 'none') return;
    var key = th.getAttribute('data-key');

    th.addEventListener('click', function() {
      var isAsc = th.classList.contains('sorted-asc');
      var dir = isAsc ? -1 : 1;

      headers.forEach(function(h) {
        h.classList.remove('sorted-asc', 'sorted-desc');
        var arrow = h.querySelector('.sort-arrow');
        if (arrow) arrow.textContent = '';
      });
      th.classList.add(dir === 1 ? 'sorted-asc' : 'sorted-desc');
      var arrow = th.querySelector('.sort-arrow');
      if (arrow) arrow.textContent = dir === 1 ? ' \\u25B2' : ' \\u25BC';

      DATA.sort(function(a, b) {
        var valA, valB;
        if (key && key.startsWith('cat_')) {
          var catId = key.slice(4);
          valA = a.cats[catId] ? a.cats[catId].s : null;
          valB = b.cats[catId] ? b.cats[catId].s : null;
          return ((valA || 0) - (valB || 0)) * dir;
        }
        if (sortType === 'num') {
          valA = key === 's' ? (a.s || 0) : 0;
          valB = key === 's' ? (b.s || 0) : 0;
          return (valA - valB) * dir;
        }
        if (sortType === 'grade') {
          return ((gradeOrder[a.g] || 99) - (gradeOrder[b.g] || 99)) * dir;
        }
        // string
        valA = a[key] || '';
        valB = b[key] || '';
        return valA.localeCompare(valB) * dir;
      });

      expandedSet.clear();
      currentPage = 0;
      renderPage();
    });
  });

  // Initial render
  renderPage();
})();
</script>
</body>
</html>
`
}
