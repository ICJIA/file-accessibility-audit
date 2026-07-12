import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Absolute path to the extracted audit-engine package's source.
const analyzerSrc = fileURLToPath(new URL("../../packages/analyzer/src", import.meta.url));

export default defineConfig({
  resolve: {
    // Phase E extracted the audit engine into @file-audit/analyzer. apps/api
    // keeps thin `export *` re-export shims at src/services/<m>.ts, so both
    // production (tsx follows the shim) and `tsc --noEmit` are unchanged, and
    // every existing `import "../services/<m>.js"` still resolves.
    //
    // Two engine leaves need one extra step in the TEST runner only.
    // pdfAnalyzer (now in the package) imports qpdfService and pdfjsService via
    // package-local relative paths, and pdfAnalyzerTimeout.test.ts white-box-
    // mocks those two leaves through their historical `../services/<m>.js`
    // path. Vitest keys a mock on the RESOLVED module id: the mock would land
    // on the api shim file while pdfAnalyzer resolves the package file — two
    // distinct ids, so the mock would silently miss and the real qpdf/pdfjs
    // would run. Rewriting the `services/<m>.js` specifier to the package
    // source unifies the two ids so the existing mock intercepts the real code
    // again. The shim is a pure `export *`, so this is behaviour-identical; it
    // only affects module identity under vitest. Scoped to exactly these two
    // leaves (matched by the `services/` path segment, which the package-local
    // `./qpdfService.js` import deliberately lacks): every other engine module
    // is either mocked at a consumer that still lives in api — where the shim
    // path already matches — or never mocked.
    alias: [
      {
        find: /(?:\.\.\/)+services\/(qpdfService|pdfjsService)\.js$/,
        replacement: `${analyzerSrc}/$1.ts`,
      },
    ],
  },
});
