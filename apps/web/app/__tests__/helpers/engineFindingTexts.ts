/**
 * What the engine can write under each finding code, read from its SOURCE.
 *
 * The scorers tag every finding string where it is born —
 *
 *     fd("xlsx.alt_text.images_missing_alt", { count: n })`${n} image(s) are missing alt text.`
 *     fd("pdf.text_extractability.tagged")("Document is tagged (StructTreeRoot present)")
 *
 * — so the words that go with a code can be read off the syntax tree without
 * running the engine on a document. That is what lets a web test notice a
 * finding being reworded on the day it happens, in CI, where the control
 * documents do not exist.
 *
 * Every `${…}` is replaced by PLACEHOLDER (a digit, so a pattern that expects
 * a count still matches); a `cond ? "a" : "b"` contributes one shape per
 * branch. A string built somewhere the tree does not show (a helper's return
 * value, a variable assigned in a loop) makes the code `dynamic`: its shapes
 * are then not the whole truth and a caller must not rely on them.
 *
 * Test-only. Reads packages/analyzer/src/scoring/*.ts; changes nothing.
 */
import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export const PLACEHOLDER = "7";

export interface EngineTexts {
  /** Every shape the tagged string can take. */
  shapes: string[];
  /** True when some part of the string is built out of the tree's sight. */
  dynamic: boolean;
}

const SCORING_DIR = resolve(import.meta.dirname, "../../../../../packages/analyzer/src/scoring");
const MAX_SHAPES = 200;

interface Texts {
  v: string[];
  dyn: boolean;
}

function cross(a: string[], b: string[], join = ""): string[] {
  const out: string[] = [];
  for (const x of a) for (const y of b) if (out.length < MAX_SHAPES) out.push(x + join + y);
  return out;
}

/** The one `const name = <initializer>` above a use of `name`, if there is
 *  exactly one in the file. */
function initializerOf(id: ts.Identifier, sf: ts.SourceFile): ts.Expression | null {
  let found: ts.Expression | null = null;
  let count = 0;
  const visit = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === id.text &&
      n.initializer &&
      n.pos < id.pos
    ) {
      found = n.initializer;
      count++;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return count === 1 ? found : null;
}

function textsOf(node: ts.Node, sf: ts.SourceFile, depth = 0): Texts {
  const unknown: Texts = { v: [PLACEHOLDER], dyn: true };
  if (depth > 6) return unknown;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { v: [node.text], dyn: false };
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return textsOf(node.expression, sf, depth);
  }
  if (ts.isConditionalExpression(node)) {
    const a = textsOf(node.whenTrue, sf, depth + 1);
    const b = textsOf(node.whenFalse, sf, depth + 1);
    return { v: [...a.v, ...b.v], dyn: a.dyn || b.dyn };
  }
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    const a = textsOf(node.left, sf, depth + 1);
    const b = textsOf(node.right, sf, depth + 1);
    if (op === ts.SyntaxKind.PlusToken) return { v: cross(a.v, b.v), dyn: a.dyn || b.dyn };
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
      return { v: [...a.v, ...b.v], dyn: a.dyn || b.dyn };
    }
    return unknown;
  }
  if (ts.isTemplateExpression(node)) {
    let v = [node.head.text];
    for (const span of node.templateSpans) {
      const e = span.expression;
      // A substitution is a VALUE (a count, a name, a list). Only a choice
      // between literal words is followed; anything else is one placeholder.
      let sub = [PLACEHOLDER];
      if (ts.isConditionalExpression(e) || ts.isParenthesizedExpression(e)) {
        sub = textsOf(e, sf, depth + 1).v;
      } else if (ts.isIdentifier(e)) {
        const init = initializerOf(e, sf);
        const t = init ? textsOf(init, sf, depth + 1) : null;
        if (t && !t.dyn) sub = t.v;
      }
      v = cross(v, sub).map((s) => s + span.literal.text);
    }
    return { v, dyn: false };
  }
  if (ts.isIdentifier(node)) {
    const init = initializerOf(node, sf);
    return init ? textsOf(init, sf, depth + 1) : unknown;
  }
  return unknown;
}

/** The code(s) an `fd(<here>, …)` call names. `code.unusable`, where `code`
 *  is one of several per-format objects, names that property's value in each
 *  of them. Anything else cannot be read and yields nothing. */
function codesOf(arg: ts.Expression | undefined, sf: ts.SourceFile): string[] {
  if (!arg) return [];
  if (ts.isStringLiteral(arg)) return [arg.text];
  if (ts.isParenthesizedExpression(arg)) return codesOf(arg.expression, sf);
  if (ts.isConditionalExpression(arg)) {
    return [...codesOf(arg.whenTrue, sf), ...codesOf(arg.whenFalse, sf)];
  }
  if (ts.isPropertyAccessExpression(arg)) {
    const name = arg.name.text;
    const out: string[] = [];
    const visit = (n: ts.Node): void => {
      if (
        ts.isPropertyAssignment(n) &&
        (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) &&
        n.name.text === name &&
        ts.isStringLiteral(n.initializer)
      ) {
        out.push(n.initializer.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return out;
  }
  return [];
}

const isFdCall = (n: ts.Node): n is ts.CallExpression =>
  ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "fd";

let cache: Map<string, EngineTexts> | null = null;

/** code → the shapes of every string the engine tags with it. */
export function engineFindingTexts(): Map<string, EngineTexts> {
  if (cache) return cache;
  const out = new Map<string, EngineTexts>();
  const add = (code: string, t: Texts): void => {
    const known = out.get(code) ?? { shapes: [], dynamic: false };
    known.shapes.push(...t.v);
    known.dynamic ||= t.dyn;
    out.set(code, known);
  };
  for (const file of readdirSync(SCORING_DIR)) {
    if (!file.endsWith(".ts")) continue;
    const sf = ts.createSourceFile(
      file,
      readFileSync(resolve(SCORING_DIR, file), "utf8"),
      ts.ScriptTarget.ES2022,
      true,
    );
    const visit = (n: ts.Node): void => {
      // fd(code)("text")  /  fd(code)(cond ? "a" : "b")
      if (ts.isCallExpression(n) && isFdCall(n.expression) && n.arguments[0]) {
        const t = textsOf(n.arguments[0], sf);
        for (const code of codesOf(n.expression.arguments[0], sf)) add(code, t);
      }
      // fd(code)`text ${value}`
      if (ts.isTaggedTemplateExpression(n) && isFdCall(n.tag)) {
        const t = textsOf(n.template, sf);
        for (const code of codesOf(n.tag.arguments[0], sf)) add(code, t);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  cache = out;
  return out;
}
