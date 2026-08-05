// GET /api/status — public service-status document.
//
// The Nitro tier re-serves this at https://audit.icjia.app/status; see
// apps/web/server/routes/status.ts. All the work (and all the privacy
// rules) live in services/status.ts — this file is only wiring.

import express from "express";
import { statusLimiter } from "../middleware/rateLimiter.js";
import db from "../db/sqlite.js";
import { REMEDIATION } from "#config";
import {
  createStatusService,
  defaultBackupStatusFile,
  defaultProbes,
  payloadIsCoreFailure,
  readApiVersion,
  type StatusDb,
} from "../services/status.js";

const router = express.Router();

// Process start, captured at import. The status service reports the API
// process's uptime because that is the process that performs audits.
const STARTED_AT_MS = Date.now();

const service = createStatusService({
  now: () => Date.now(),
  db: db as unknown as StatusDb,
  probes: defaultProbes,
  version: readApiVersion(),
  startedAtMs: STARTED_AT_MS,
  remediationEnabled: REMEDIATION.ENABLED,
  backupStatusFile: defaultBackupStatusFile(),
});

router.get("/status", statusLimiter, async (_req, res) => {
  try {
    const payload = await service.getStatus();

    // Belt and braces alongside robots.txt: that file is advisory and only
    // consulted by well-behaved crawlers, whereas this header is honoured
    // even when the URL is reached directly.
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.set("Cache-Control", "no-store");

    // Core failure (database or qpdf) means the service cannot audit at all,
    // so a monitor should treat it as an outage. Optional engines being down
    // is a degradation and stays 200 — see the design spec.
    res.status(payloadIsCoreFailure(payload) ? 503 : 200).json(payload);
  } catch (err) {
    // getStatus is written not to throw; this is the last line of defence.
    // The generic body keeps internals (and paths) out of the response.
    console.error("[status] failed to build payload:", err);
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.status(503).json({ status: "down", database: "down" });
  }
});

export default router;
