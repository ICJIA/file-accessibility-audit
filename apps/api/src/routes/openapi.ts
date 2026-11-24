// GET /api/openapi.json — the machine-readable description of the public API.
//
// The document is hand-written (services/openapi.ts) and pinned to the real
// router by openapi.test.ts, which fails when a mounted route is missing from
// it or it describes one that does not exist. Mounted after globalLimiter in
// app.ts, so it is rate-limited like the other cheap GETs.

import { Router, type IRouter } from "express";
import { buildOpenApiDocument } from "../services/openapi.js";

const router: IRouter = Router();

router.get("/openapi.json", (_req, res) => {
  // Built per request: the server URL depends on NODE_ENV and the version on
  // package.json, both fixed for the life of the process, and it is cheap.
  res.set("Cache-Control", "public, max-age=300");
  res.json(buildOpenApiDocument());
});

export default router;
