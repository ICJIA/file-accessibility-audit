/**
 * A per-request id, so one request's error-log lines can be found.
 *
 * Every request gets a random id (a UUID — nothing about the caller goes into
 * it: no address, no token, no header the caller sent). It is returned as
 * `X-Request-Id`, and while the request is being handled every line the
 * error log writes (services/errorLog.ts) is tagged `[req <id>]`. A person
 * reporting a failure can quote the header; the operator greps the log for
 * it. That is the whole feature.
 *
 * NOT an access log. Nothing is written for a request that logs no warning
 * or error, and the id is never stored with anything about who sent the
 * request — the retention policy forbids identifiers, and an id that could
 * be tied to a caller would be one. For the same reason an `X-Request-Id`
 * the CALLER sends is ignored: writing a caller-chosen value into the log
 * would let the caller put an identifier there.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

interface RequestStore {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestStore>();

export const REQUEST_ID_HEADER = "X-Request-Id";

/** The id of the request being handled right now, if any. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** Run `fn` as part of request `requestId` (for code that lost the context). */
export function runWithRequestId<T>(requestId: string | undefined, fn: () => T): T {
  if (!requestId || storage.getStore()?.requestId === requestId) return fn();
  return storage.run({ requestId }, fn);
}

/** Express middleware — mount before everything that can log. */
export function requestIdMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  storage.run({ requestId }, next);
}
