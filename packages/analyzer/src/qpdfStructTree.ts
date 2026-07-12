/**
 * Pure PDF structure-tree walkers used by qpdfService.ts's JSON-object-graph
 * analysis: reference normalization/resolution, the RoleMap tag mapper, and
 * the table/heading tree walkers. Nothing here spawns a process or touches
 * the filesystem — nested-table detection, document-order heading
 * collection, and per-table structural analysis (headers, scope, row
 * structure, nesting, captions, column consistency, header associations)
 * operate purely on the already-parsed `qpdf --json` object map.
 *
 * Extracted verbatim from qpdfService.ts in the v1.34.0 structural split.
 * qpdfService.ts re-exports TableAnalysis (imported directly by some tests)
 * and imports the walker functions back for its own object-graph walk and
 * post-processing passes.
 */

export interface TableAnalysis {
  hasHeaders: boolean;
  headerCount: number;
  dataCellCount: number;
  hasScope: boolean;
  scopeMissingCount: number;
  hasRowStructure: boolean;
  rowCount: number;
  hasNestedTable: boolean;
  hasCaption: boolean;
  hasConsistentColumns: boolean | null;
  columnCounts: number[];
  hasHeaderAssociation: boolean;
}

// Normalize an object-map KEY to the reference-VALUE form: qpdf JSON v2 keys
// the object map as "obj:N 0 R" while indirect-reference values inside
// objects are "N 0 R". Every comparison between a map key and a value ref
// must go through this, or it silently never matches on qpdf ≥ 11.
export function normRef(r: string): string {
  return r.replace(/^obj:/, "");
}

// Resolve a ref like "9 0 R" to its object, trying both "obj:9 0 R" and "9 0 R" key formats
export function resolveRef(ref: string, objects: any): any {
  if (!ref || typeof ref !== "string") return null;
  return objects[ref] ?? objects[`obj:${ref}`] ?? null;
}

export function mapToStandardTag(
  tag: string | null | undefined,
  roleMap: Record<string, string>,
): string | null {
  if (!tag) return null;
  return roleMap[tag] || tag;
}

// Walk a /Table struct element's subtree and record the object refs of any
// DESCENDANT /Table elements (nested tables). Only ref-string children can be
// top-level objects in the map, so only those need to be recorded for the
// nested-table filter; inline nested tables are never top-level candidates.
export function collectDescendantTableRefs(
  tableObj: any,
  objects: Record<string, any>,
  roleMap: Record<string, string>,
  out: Set<string>,
): void {
  const visited = new Set<any>();
  const walk = (node: any, depth: number): void => {
    if (depth > 50 || !node || typeof node !== "object") return;
    if (visited.has(node)) return;
    visited.add(node);
    const kids = node["/K"];
    if (kids === undefined || kids === null) return;
    const items = Array.isArray(kids) ? kids : [kids];
    for (const item of items) {
      if (typeof item === "number") continue;
      if (item && typeof item === "object" && item["/MCID"] !== undefined) continue;
      if (typeof item === "string") {
        const child = resolveRef(item, objects);
        if (!child) continue;
        if (mapToStandardTag(child["/S"], roleMap) === "/Table") out.add(item);
        walk(child, depth + 1);
      } else if (item && typeof item === "object") {
        // Inline child: can't be a top-level candidate, but recurse so a
        // ref-based nested table deeper inside it is still found.
        walk(item, depth + 1);
      }
    }
  };
  walk(tableObj, 0);
}

// Walk the structure tree from StructTreeRoot in document (reading) order and
// return headings in that order. Mirrors the heading detection in the flat
// object scan (mapToStandardTag + H/H1–H6) but preserves /K traversal order.
// Returns [] when there is no StructTreeRoot or no reachable headings, letting
// the caller keep the flat-scan result as a fallback.
export function collectHeadingsInOrder(
  objects: Record<string, any>,
  roleMap: Record<string, string>,
): Array<{ level: string; tag: string }> {
  let root: any = null;
  for (const obj of Object.values(objects)) {
    if ((obj as any)?.["/Type"] === "/StructTreeRoot") {
      root = obj;
      break;
    }
  }
  if (!root) return [];

  const headings: Array<{ level: string; tag: string }> = [];
  const visited = new Set<any>();
  const walk = (node: any, depth: number): void => {
    if (depth > 200 || !node || typeof node !== "object") return;
    if (visited.has(node)) return;
    visited.add(node);

    const rawS = node["/S"];
    if (typeof rawS === "string") {
      const tag = mapToStandardTag(rawS, roleMap);
      if (tag === "/H" || /^\/H[1-6]$/.test(tag || "")) {
        headings.push({ level: tag!.replace("/", ""), tag: rawS });
      }
    }

    const kids = node["/K"];
    if (kids === undefined || kids === null) return;
    const items = Array.isArray(kids) ? kids : [kids];
    for (const item of items) {
      if (typeof item === "number") continue;
      if (item && typeof item === "object" && item["/MCID"] !== undefined) continue;
      if (typeof item === "string") {
        const child = resolveRef(item, objects);
        if (child) walk(child, depth + 1);
      } else if (item && typeof item === "object") {
        walk(item, depth + 1);
      }
    }
  };
  walk(root, 0);
  return headings;
}

export function analyzeTable(
  tableObj: any,
  objects: any,
  roleMap: Record<string, string> = {},
): TableAnalysis {
  const result: TableAnalysis = {
    hasHeaders: false,
    headerCount: 0,
    dataCellCount: 0,
    hasScope: false,
    scopeMissingCount: 0,
    hasRowStructure: false,
    rowCount: 0,
    hasNestedTable: false,
    hasCaption: false,
    hasConsistentColumns: null,
    columnCounts: [],
    hasHeaderAssociation: false,
  };

  const kids = tableObj["/K"];
  if (!kids) return result;

  // Resolve a node that may be a ref string or inline object
  const resolve = (node: any): any => {
    if (typeof node === "string") return resolveRef(node, objects);
    return node && typeof node === "object" ? node : null;
  };

  // Get the tag of a node
  const getTag = (node: any): string | null => {
    const resolved = resolve(node);
    return mapToStandardTag(resolved?.["/S"] || null, roleMap);
  };

  // Check if a TH node has a /Scope attribute
  const hasNodeScope = (node: any): boolean => {
    const resolved = resolve(node);
    if (!resolved) return false;
    const attrs = resolved["/A"];
    if (!attrs) return false;
    // /A can be a single dict, a ref, or an array
    const checkAttr = (a: any): boolean => {
      const r = resolve(a);
      return r?.["/Scope"] === "/Column" || r?.["/Scope"] === "/Row";
    };
    if (Array.isArray(attrs)) return attrs.some(checkAttr);
    return checkAttr(attrs);
  };

  // Check if a TD node has /Headers association
  const hasNodeHeaders = (node: any): boolean => {
    const resolved = resolve(node);
    if (!resolved) return false;
    if (resolved["/Headers"]) return true;
    const attrs = resolved["/A"];
    if (!attrs) return false;
    const checkAttr = (a: any): boolean => {
      const r = resolve(a);
      return !!r?.["/Headers"];
    };
    if (Array.isArray(attrs)) return attrs.some(checkAttr);
    return checkAttr(attrs);
  };

  // Read a cell's /ColSpan or /RowSpan. Spans live in the cell's /A
  // attribute dict(s) per ISO 32000 (owner /Table); accept a direct key too
  // for leniency, mirroring hasNodeScope. Defaults to 1.
  const spanOf = (cellNode: any, key: "/ColSpan" | "/RowSpan"): number => {
    const resolved = resolve(cellNode);
    if (!resolved) return 1;
    let v: any = resolved[key];
    if (v === undefined && resolved["/A"]) {
      const attrs = resolved["/A"];
      const read = (a: any): any => resolve(a)?.[key];
      if (Array.isArray(attrs)) {
        for (const a of attrs) {
          const c = read(a);
          if (c !== undefined) {
            v = c;
            break;
          }
        }
      } else {
        v = read(attrs);
      }
    }
    return typeof v === "number" && v >= 1 ? Math.floor(v) : 1;
  };

  // Walk the table subtree collecting all signals in a single pass
  const walk = (node: any, depth: number): void => {
    if (depth > 15 || !node) return;
    const resolved = resolve(node);
    if (!resolved) return;
    const tag = getTag(resolved);

    if (tag === "/TH") {
      result.headerCount++;
      if (hasNodeScope(resolved)) {
        result.hasScope = true;
      } else {
        result.scopeMissingCount++;
      }
    }
    if (tag === "/TD") {
      result.dataCellCount++;
      if (hasNodeHeaders(resolved)) {
        result.hasHeaderAssociation = true;
      }
    }
    if (tag === "/Table" && depth > 0) {
      result.hasNestedTable = true;
    }
    if (tag === "/Caption") {
      result.hasCaption = true;
    }

    // Recurse into children
    const childKids = resolved["/K"];
    if (!childKids) return;
    const items = Array.isArray(childKids) ? childKids : [childKids];
    for (const item of items) {
      if (
        typeof item === "number" ||
        (item && typeof item === "object" && item["/MCID"] !== undefined)
      )
        continue;
      walk(item, depth + 1);
    }
  };

  // Walk the entire table subtree
  walk(tableObj, 0);

  result.hasHeaders = result.headerCount > 0;
  // hasScope is true only when ALL TH have scope
  if (result.headerCount > 0 && result.scopeMissingCount === 0) {
    result.hasScope = true;
  } else {
    result.hasScope = false;
    if (result.headerCount === 0) result.scopeMissingCount = 0;
  }

  // Check row structure: direct children of table should be TR (or THead/TBody/TFoot containing TR)
  const directKids = Array.isArray(kids) ? kids : [kids];
  let trCount = 0;
  for (const kid of directKids) {
    const tag = getTag(kid);
    if (tag === "/TR") trCount++;
    if (tag === "/THead" || tag === "/TBody" || tag === "/TFoot") {
      // Check for TR inside section
      const sectionResolved = resolve(kid);
      const sectionKids = sectionResolved?.["/K"];
      if (sectionKids) {
        const sItems = Array.isArray(sectionKids) ? sectionKids : [sectionKids];
        for (const s of sItems) {
          if (getTag(s) === "/TR") trCount++;
        }
      }
    }
  }
  result.rowCount = trCount;
  result.hasRowStructure = trCount > 0;

  // Column consistency: effective grid columns per TR, honoring /ColSpan and
  // /RowSpan. A cell with /ColSpan n occupies n columns in its row; a cell
  // with /RowSpan m also occupies its column(s) in the following m-1 rows
  // (tracked via carryover). Counting raw cells instead flagged correctly
  // spanned tables as "inconsistent column counts".
  const trNodes: any[] = [];
  for (const kid of directKids) {
    const tag = getTag(kid);
    if (tag === "/TR") {
      trNodes.push(kid);
    } else if (tag === "/THead" || tag === "/TBody" || tag === "/TFoot") {
      const sectionResolved = resolve(kid);
      const sectionKids = sectionResolved?.["/K"];
      if (sectionKids) {
        const sItems = Array.isArray(sectionKids) ? sectionKids : [sectionKids];
        for (const s of sItems) {
          if (getTag(s) === "/TR") trNodes.push(s);
        }
      }
    }
  }

  let rowSpanCarry: Array<{ rowsLeft: number; cols: number }> = [];
  for (const trNode of trNodes) {
    let effectiveCols = rowSpanCarry.reduce((sum, c) => sum + c.cols, 0);
    rowSpanCarry = rowSpanCarry
      .map((c) => ({ rowsLeft: c.rowsLeft - 1, cols: c.cols }))
      .filter((c) => c.rowsLeft > 0);

    const trResolved = resolve(trNode);
    const rowKids = trResolved?.["/K"];
    if (rowKids) {
      const items = Array.isArray(rowKids) ? rowKids : [rowKids];
      for (const item of items) {
        const tag = getTag(item);
        if (tag !== "/TH" && tag !== "/TD") continue;
        const colSpan = spanOf(item, "/ColSpan");
        const rowSpan = spanOf(item, "/RowSpan");
        effectiveCols += colSpan;
        if (rowSpan > 1) {
          rowSpanCarry.push({ rowsLeft: rowSpan - 1, cols: colSpan });
        }
      }
    }
    result.columnCounts.push(effectiveCols);
  }

  if (result.columnCounts.length > 0) {
    const first = result.columnCounts[0];
    result.hasConsistentColumns = result.columnCounts.every((c) => c === first);
  }

  return result;
}
