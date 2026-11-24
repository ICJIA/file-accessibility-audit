/**
 * One shape for every JSON error the API sends:
 *
 *   { "error": "<sentence for a person>", "code": "<STABLE_MACHINE_CODE>",
 *     "details": "<optional second sentence>", …route-specific extras }
 *
 * `error` and `details` are written for people and have been reworded over
 * time; clients that had to branch on a failure could only compare those
 * sentences. `code` is the part that does not change: branch on it.
 *
 * HOW IT IS APPLIED. Two ways, one table:
 *
 *   - a route that knows something the status alone does not say (a
 *     password-protected PDF and a corrupt one are both 422) names the code
 *     itself, with `apiErrorBody` / `sendApiError`;
 *   - `stampErrorCodes`, mounted first in app.ts, adds the status's default
 *     code to any error body that reaches `res.json` without one. So a route
 *     that is added later and forgets cannot send a code-less error —
 *     errorCodes.test.ts walks the routes to prove it.
 *
 * Nothing here changes a status code or an existing `error` / `details`
 * string.
 */
import type { NextFunction, Request, Response } from "express";

export const API_ERROR_CODES = [
  "INVALID_REQUEST",
  "URL_NOT_ALLOWED",
  "UNSUPPORTED_TYPE",
  "AUDIT_REQUIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "NOT_READY",
  "DOWNLOAD_IN_PROGRESS",
  "GONE",
  "FILE_TOO_LARGE",
  "FORMAT_DISABLED",
  "FILE_ENCRYPTED",
  "FILE_UNREADABLE",
  "RATE_LIMITED",
  "CLIENT_CLOSED",
  "INTERNAL",
  "FETCH_FAILED",
  "SERVER_BUSY",
  "SHUTTING_DOWN",
  "TIMEOUT",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
  details?: string;
  [extra: string]: unknown;
}

/** The code an error body gets when its route did not name one. */
export function defaultCodeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return "INVALID_REQUEST";
    case 401:
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 405:
      return "METHOD_NOT_ALLOWED";
    case 409:
      return "NOT_READY";
    case 410:
      return "GONE";
    case 413:
      return "FILE_TOO_LARGE";
    case 415:
      return "UNSUPPORTED_TYPE";
    case 422:
      return "FILE_UNREADABLE";
    case 429:
      return "RATE_LIMITED";
    case 499:
      return "CLIENT_CLOSED";
    case 502:
      return "FETCH_FAILED";
    case 503:
      return "SERVER_BUSY";
    case 504:
      return "TIMEOUT";
    default:
      return status >= 400 && status < 500 ? "INVALID_REQUEST" : "INTERNAL";
  }
}

/**
 * Build an error body. `code` defaults to the status's; pass it when the
 * route knows better. Key order is error, details, extras, code — `error`
 * first, as every body has always had it.
 */
export function apiErrorBody(
  status: number,
  body: { error: string; details?: string; [extra: string]: unknown },
  code?: ApiErrorCode,
): ApiErrorBody {
  return { ...body, code: code ?? defaultCodeForStatus(status) };
}

/** Send an error in the one shape. */
export function sendApiError(
  res: Response,
  status: number,
  body: { error: string; details?: string; [extra: string]: unknown },
  code?: ApiErrorCode,
): void {
  res.status(status).json(apiErrorBody(status, body, code));
}

function isCodelessErrorBody(body: unknown): body is { error: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    typeof (body as { error?: unknown }).error === "string" &&
    typeof (body as { code?: unknown }).code !== "string"
  );
}

/**
 * Express middleware: every error body sent through `res.json` with a 4xx or
 * 5xx status carries a `code`. A body that already has one is left alone.
 * Only bodies whose `error` is a string are touched — the status document's
 * 503 payload and an analyze job's poll response (where `error` is an object
 * inside a 200) are not error bodies in this sense.
 */
export function stampErrorCodes(_req: Request, res: Response, next: NextFunction): void {
  const json = res.json.bind(res);
  res.json = ((body?: unknown) => {
    if (res.statusCode >= 400 && isCodelessErrorBody(body)) {
      return json(apiErrorBody(res.statusCode, body));
    }
    return json(body);
  }) as Response["json"];
  next();
}
