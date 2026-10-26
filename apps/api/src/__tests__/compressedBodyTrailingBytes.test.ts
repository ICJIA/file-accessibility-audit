/**
 * A compressed body followed by trailing bytes must not end the API process
 * (GHSA-27r3-jxmh-p828, body-parser < 1.20.9, high; fixed in v1.166.2).
 *
 * The API parses JSON and text/plain bodies with body-parser's defaults, which
 * accept gzip and deflate. On 1.20.6 a gzip body followed by trailing bytes was
 * answered normally — and then the late bytes reached the decoder it had
 * already finished with, which threw "incorrect header check" outside Express.
 * Nothing catches that: one anonymous request, parsed before any route or rate
 * limit, ended the process. Reproduced against the production parsers on
 * 2026-10-26 before the fix.
 *
 * The payload is upstream's own regression case (body-parser test/json.js):
 * the frame, one stray byte, then 100 KiB — large enough to arrive in later
 * socket reads, after the decoder has ended. Sent over a real socket, because
 * the crash needs bytes that arrive late.
 */
import { describe, it, expect } from "vitest";
import express from "express";
import http from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { bodyParsers } from "../middleware/bodyParsers.js";

// gzip of {"a":1} — upstream's fixture.
const GZIPPED_JSON = Buffer.from("1f8b0800000000000003ab564a54b232ac0500afac1b5607000000", "hex");

function post(port: number, contentType: string, body: Buffer): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: "POST",
        path: "/echo",
        headers: {
          "Content-Type": contentType,
          "Content-Encoding": "gzip",
          "Content-Length": body.length,
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

describe("the API's body parsers and a compressed body with trailing bytes", () => {
  for (const contentType of ["application/json", "text/plain"]) {
    it(`answers and does not throw outside Express (${contentType})`, async () => {
      const uncaught: unknown[] = [];
      const record = (error: unknown) => uncaught.push(error);
      process.on("uncaughtException", record);
      const app = express();
      app.use(bodyParsers);
      app.post("/echo", (_req, res) => {
        res.status(200).json({ parsed: true });
      });
      const server = app.listen(0, "127.0.0.1");
      try {
        await once(server, "listening");
        const { port } = server.address() as AddressInfo;
        const body = Buffer.concat([
          GZIPPED_JSON,
          Buffer.from([0x00]),
          Buffer.alloc(100 * 1024, 0x58),
        ]);
        expect(await post(port, contentType, body)).toBe(200);
        // The crash came AFTER the answer, when the late bytes landed.
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(uncaught).toEqual([]);
      } finally {
        server.close();
        process.off("uncaughtException", record);
      }
    });
  }
});
