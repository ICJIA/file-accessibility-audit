import express, { type RequestHandler } from "express";
import { BULK_INVENTORY } from "#config";

/**
 * The API's request-body parsers, mounted once in index.ts and driven
 * directly by compressedBodyTrailingBytes.test.ts, so the test exercises the
 * parsers production runs rather than a copy of their options.
 *
 * Both accept compressed bodies (body-parser's default `inflate: true`).
 * Below body-parser 1.20.9 that let one anonymous request end the process:
 * a gzip body followed by trailing bytes was answered normally, then the
 * late bytes reached the finished decoder and threw outside Express
 * (GHSA-27r3-jxmh-p828; fixed by the 1.20.9 floor, v1.166.2).
 */
export const bodyParsers: RequestHandler[] = [
  // Byte counts from the root config, so the limits and the messages that
  // describe them (middleware/errorHandler.ts, routes/bulk-from-inventory.ts)
  // cannot drift: 1 MB of JSON, 5 MB of text.
  express.json({ limit: BULK_INVENTORY.JSON_BODY_LIMIT_BYTES }),
  // text/plain is used by bulk-from-inventory when the caller pipes NDJSON directly
  express.text({ limit: BULK_INVENTORY.MAX_INVENTORY_BYTES, type: "text/plain" }),
];
