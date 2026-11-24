/**
 * The OpenAPI 3.1 description of the public API, served at
 * GET /api/openapi.json (routes/openapi.ts).
 *
 * HAND-WRITTEN, and pinned so it cannot go stale: openapi.test.ts walks the
 * Express router stack app.ts builds and fails when a mounted route has no
 * entry here, or an entry here has no route. When you add, remove or rename a
 * route, that test tells you to come here.
 *
 * What it promises is the part clients build on: paths, methods, parameters,
 * status codes, and the one error shape (`ApiError`, with its stable `code`).
 * The audit result itself is described by its load-bearing fields and left
 * open (`additionalProperties`) — it grows with every release, and its full
 * type lives in packages/shared.
 */
import { ANALYSIS, BULK_INVENTORY, DEPLOY, REMEDIATION, SHARED_REPORTS } from "#config";
import { API_ERROR_CODES } from "./apiError.js";
import { REQUEST_ID_HEADER } from "./requestContext.js";
import { readApiVersion } from "./status.js";

type Json = Record<string, unknown>;

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });

const jsonContent = (schema: Json): Json => ({ "application/json": { schema } });

/** A response whose body is the shared error shape. */
const errorResponse = (description: string): Json => ({
  description,
  content: jsonContent(ref("ApiError")),
});

const ok = (description: string, schema: Json): Json => ({
  description,
  content: jsonContent(schema),
});

/** 429 and 503 are the same on every route: the error shape + Retry-After. */
const RATE_LIMITED = { $ref: "#/components/responses/RateLimited" };
const BUSY = { $ref: "#/components/responses/ServerBusy" };
const INTERNAL = { $ref: "#/components/responses/InternalError" };

const FILE_UPLOAD_BODY = (maxMb: number, formats: string): Json => ({
  required: true,
  content: {
    "multipart/form-data": {
      schema: {
        type: "object",
        required: ["file"],
        properties: {
          file: {
            type: "string",
            format: "binary",
            description: `The document (${formats}). Up to ${maxMb} MB. The only file part accepted.`,
          },
        },
      },
    },
  },
});

const URL_BODY = (withForce: boolean): Json => ({
  required: true,
  content: jsonContent({
    type: "object",
    required: ["url"],
    properties: {
      url: {
        type: "string",
        format: "uri",
        description:
          "http(s) URL. Without the service token the host must be on the server's allowlist; private and reserved addresses are always refused.",
      },
      ...(withForce
        ? {
            force: {
              type: "boolean",
              description:
                "Skip the stored-report lookup and audit again. Also accepted as ?force=true.",
            },
          }
        : {}),
    },
  }),
});

const FORCE_QUERY: Json = {
  name: "force",
  in: "query",
  required: false,
  schema: { type: "string", enum: ["true"] },
  description: "Same as the body field `force`.",
};

const JOB_ID_PARAM: Json = {
  name: "jobId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};

const JOB_TOKEN_QUERY: Json = {
  name: "token",
  in: "query",
  required: true,
  schema: { type: "string" },
  description:
    "The `downloadToken` returned by POST /api/remediate. An unknown job, a missing token and a wrong token all answer 404.",
};

/** The failures every document analysis can answer with. */
const ANALYSIS_ERRORS: Json = {
  "400": errorResponse(
    "The request is malformed, or the file is not a supported document (`UNSUPPORTED_TYPE`).",
  ),
  "413": errorResponse("The document is larger than the limit (`FILE_TOO_LARGE`)."),
  "415": errorResponse("Auditing this format is switched off on this server (`FORMAT_DISABLED`)."),
  "422": errorResponse(
    "The document could not be audited: password-protected (`FILE_ENCRYPTED`) or corrupt / unreadable (`FILE_UNREADABLE`).",
  ),
  "429": RATE_LIMITED,
  "500": INTERNAL,
  "503": BUSY,
  "504": errorResponse("The audit did not finish in time (`TIMEOUT`)."),
};

const FETCH_ERRORS: Json = {
  "400": errorResponse(
    "`url` is missing (`INVALID_REQUEST`), or is not allowed (`URL_NOT_ALLOWED`).",
  ),
  "499": errorResponse("The caller disconnected while the server was fetching (`CLIENT_CLOSED`)."),
  "502": errorResponse("The server could not fetch the URL (`FETCH_FAILED`)."),
};

export function buildOpenApiDocument(): Json {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    openapi: "3.1.0",
    info: {
      title: "ICJIA File Accessibility Audit API",
      version: readApiVersion(),
      summary: "Audit PDF, Word, PowerPoint and Excel files for accessibility.",
      description: [
        "Every endpoint is public: there are no accounts and no sign-in. Requests are rate-limited per IP address.",
        "An optional service token (`Authorization: Bearer …`) selects a higher rate tier and lets the URL endpoints fetch from hosts outside the allowlist; it is never required.",
        "",
        "**Errors.** Every error is JSON in one shape — `error` (a sentence for a person), `code` (stable; branch on this), and sometimes `details`. `error` and `details` may be reworded between releases; `code` is not.",
        "",
        `**Request ids.** Every response carries \`${REQUEST_ID_HEADER}\`, a random id for that request. Quote it when reporting a failure. An id sent by the caller is ignored.`,
        "",
        "**Busy and restarting.** 429 and 503 always carry `Retry-After` (seconds).",
      ].join("\n"),
    },
    servers: [
      {
        url: isProduction ? DEPLOY.PRODUCTION_URL : `http://localhost:${process.env.PORT || 5103}`,
      },
    ],
    tags: [
      { name: "Audit a document" },
      { name: "Audit a web page" },
      { name: "Shared reports" },
      {
        name: "Remediation",
        description: "PDF auto-remediation. Every path answers 404 while the feature is off.",
      },
      { name: "Service" },
    ],
    paths: {
      "/": {
        get: {
          tags: ["Service"],
          operationId: "getRoot",
          summary: "Health summary (same as /api/health).",
          responses: { "200": ok("Health summary.", ref("Health")), "429": RATE_LIMITED },
        },
      },
      "/api": {
        get: {
          tags: ["Service"],
          operationId: "getApiRoot",
          summary: "Health summary (same as /api/health).",
          responses: { "200": ok("Health summary.", ref("Health")), "429": RATE_LIMITED },
        },
      },
      "/api/health": {
        get: {
          tags: ["Service"],
          operationId: "getHealth",
          summary: "Health summary: the service verdict and the systems behind it.",
          responses: { "200": ok("Health summary.", ref("Health")), "429": RATE_LIMITED },
        },
      },
      "/api/status": {
        get: {
          tags: ["Service"],
          operationId: "getStatus",
          summary: "Service status document: engines, database, usage totals.",
          responses: {
            "200": ok("The service can audit (it may be degraded).", ref("StatusDocument")),
            "429": RATE_LIMITED,
            "503": ok(
              "A core system (the database or qpdf) is down. The body is the status document, not the error shape.",
              ref("StatusDocument"),
            ),
          },
        },
      },
      "/api/openapi.json": {
        get: {
          tags: ["Service"],
          operationId: "getOpenApi",
          summary: "This document.",
          responses: {
            "200": ok("OpenAPI 3.1 document.", { type: "object" }),
            "429": RATE_LIMITED,
          },
        },
      },
      "/api/analyze": {
        post: {
          tags: ["Audit a document"],
          operationId: "analyzeUpload",
          summary: "Upload a document and receive its audit in the response.",
          description:
            "The file is analyzed in memory and not stored. The result carries a `seal`; post the result back unchanged to POST /api/reports to share it.",
          requestBody: FILE_UPLOAD_BODY(
            ANALYSIS.MAX_FILE_SIZE_MB,
            "PDF, Word .docx, PowerPoint .pptx or Excel .xlsx",
          ),
          responses: { "200": ok("The audit.", ref("AnalysisResult")), ...ANALYSIS_ERRORS },
        },
      },
      "/api/analyze-job": {
        post: {
          tags: ["Audit a document"],
          operationId: "startAnalyzeJob",
          summary: "Upload a document and receive a job to poll for progress.",
          description:
            "Runs the same audit as POST /api/analyze. Answers at once with a job id and a token; poll GET /api/analyze-job/{id}.",
          requestBody: FILE_UPLOAD_BODY(
            ANALYSIS.MAX_FILE_SIZE_MB,
            "PDF, Word .docx, PowerPoint .pptx or Excel .xlsx",
          ),
          responses: {
            "202": ok("The job was accepted.", ref("AnalyzeJobCreated")),
            "400": errorResponse("No file, or a file type that is not accepted."),
            "413": errorResponse("The document is larger than the limit (`FILE_TOO_LARGE`)."),
            "429": RATE_LIMITED,
            "500": INTERNAL,
            "503": BUSY,
          },
        },
      },
      "/api/analyze-job/{id}": {
        get: {
          tags: ["Audit a document"],
          operationId: "pollAnalyzeJob",
          summary: "Progress of an audit job; the result is delivered once.",
          description:
            "Step states are returned as often as asked. The response on which `done` is true carries `result` or `error` and removes the job.",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            {
              name: "t",
              in: "query",
              required: true,
              schema: { type: "string" },
              description: "The `token` returned by POST /api/analyze-job.",
            },
          ],
          responses: {
            "200": ok("The job's state.", ref("AnalyzeJobStatus")),
            "404": errorResponse(
              "No such job: wrong id, wrong token, expired, or already delivered — deliberately indistinguishable.",
            ),
            "429": RATE_LIMITED,
          },
        },
      },
      "/api/analyze-url": {
        post: {
          tags: ["Audit a document"],
          operationId: "analyzeUrl",
          summary: "Audit the document at a URL; nothing is stored.",
          requestBody: URL_BODY(false),
          responses: {
            "200": ok("The audit.", ref("AnalysisResult")),
            ...ANALYSIS_ERRORS,
            ...FETCH_ERRORS,
          },
        },
      },
      "/api/audit-url": {
        post: {
          tags: ["Audit a document"],
          operationId: "auditUrl",
          summary: "Audit the document at a URL and store a shareable report.",
          description:
            "For inventory automation. The same content audited again returns the stored report (`cached: true`) unless `force` is set.",
          parameters: [FORCE_QUERY],
          requestBody: URL_BODY(true),
          responses: {
            "200": ok("A summary and the report link.", ref("AuditUrlResult")),
            ...ANALYSIS_ERRORS,
            ...FETCH_ERRORS,
          },
        },
      },
      "/api/bulk-from-inventory": {
        post: {
          tags: ["Audit a document"],
          operationId: "bulkFromInventory",
          summary: "Audit every matching entry of an NDJSON inventory.",
          description: `Up to ${BULK_INVENTORY.MAX_FILES_PER_REQUEST} entries per request, audited one after another. A failure of one entry is reported in that entry's result and does not fail the request.`,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["inventory"],
                  properties: {
                    inventory: {
                      type: "string",
                      description: `The NDJSON text. The whole JSON body may be up to ${BULK_INVENTORY.JSON_BODY_LIMIT_BYTES} bytes.`,
                    },
                    filterCategory: {
                      type: "string",
                      enum: ["pdf", "docx", "pptx", "xlsx"],
                      default: "pdf",
                    },
                  },
                },
              },
              "text/plain": {
                schema: {
                  type: "string",
                  description: `The NDJSON itself, up to ${BULK_INVENTORY.MAX_INVENTORY_BYTES} bytes. Entries in category \`pdf\` are audited.`,
                },
              },
            },
          },
          responses: {
            "200": ok("Per-entry results.", ref("BulkResult")),
            "400": errorResponse("No inventory, or no entry with a resolvable URL."),
            "413": errorResponse("The inventory is larger than the limit (`FILE_TOO_LARGE`)."),
            "429": RATE_LIMITED,
            "500": INTERNAL,
          },
        },
      },
      "/api/audit-url-page": {
        post: {
          tags: ["Audit a web page"],
          operationId: "auditUrlPage",
          summary: "Render a web page, run axe-core on it, and store a shareable report.",
          parameters: [FORCE_QUERY],
          requestBody: URL_BODY(true),
          responses: {
            "200": ok("A summary and the report link.", ref("PageAuditResult")),
            "400": errorResponse(
              "`url` is missing (`INVALID_REQUEST`), or is not allowed (`URL_NOT_ALLOWED`).",
            ),
            "429": RATE_LIMITED,
            "500": INTERNAL,
            "502": errorResponse("The page could not be rendered or audited (`FETCH_FAILED`)."),
            "503": BUSY,
            "504": errorResponse("The page took too long to load (`TIMEOUT`)."),
          },
        },
      },
      "/api/reports": {
        post: {
          tags: ["Shared reports"],
          operationId: "saveReport",
          summary: "Store an audit result and receive a shareable id.",
          description: `Only a result this server produced is accepted: post the result exactly as received, \`seal\` included. Stored for ${SHARED_REPORTS.EXPIRY_DAYS} days.`,
          requestBody: {
            required: true,
            content: jsonContent({
              type: "object",
              required: ["report"],
              properties: { report: ref("AnalysisResult") },
            }),
          },
          responses: {
            "200": ok("Stored.", {
              type: "object",
              required: ["id", "expiresAt"],
              properties: {
                id: { type: "string", pattern: "^[a-f0-9]{32}$" },
                expiresAt: { type: "string", format: "date-time" },
              },
            }),
            "400": errorResponse("Not a result, or its seal does not verify."),
            "413": errorResponse("The body is larger than the limit (`FILE_TOO_LARGE`)."),
            "429": RATE_LIMITED,
            "500": INTERNAL,
          },
        },
      },
      "/api/reports/{id}": {
        get: {
          tags: ["Shared reports"],
          operationId: "getReport",
          summary: "Retrieve a shared report.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", pattern: "^[a-f0-9]{32}$" },
            },
          ],
          responses: {
            "200": ok("The report.", {
              type: "object",
              required: ["report", "createdAt", "expiresAt"],
              properties: {
                report: { type: "object", additionalProperties: true },
                createdAt: { type: "string" },
                expiresAt: { type: "string", format: "date-time" },
              },
            }),
            "400": errorResponse("The id is not 32 hex characters."),
            "404": errorResponse("No such report (`NOT_FOUND`)."),
            "410": errorResponse("The report link has expired (`GONE`)."),
            "429": RATE_LIMITED,
            "500": INTERNAL,
          },
        },
      },
      "/api/remediate": {
        post: {
          tags: ["Remediation"],
          operationId: "startRemediation",
          summary: "Start auto-remediation of a PDF that was audited recently.",
          description: `The same bytes must have been audited within the last ${Math.round(REMEDIATION.AUDIT_REQUIRED_WINDOW_MS / 60_000)} minutes. Jobs are queued: the limits on jobs per caller and across the service are checked before the upload is read.`,
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: {
                    file: {
                      type: "string",
                      format: "binary",
                      description: `The PDF. Up to ${REMEDIATION.MAX_FILE_SIZE_MB} MB.`,
                    },
                    title: { type: "string", description: "Title to write into the PDF." },
                    language: {
                      type: "string",
                      description: "Language tag to write into the PDF (for example en-US).",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "202": ok("The job was accepted.", ref("RemediationCreated")),
            "400": errorResponse(
              "No file, not a PDF (`UNSUPPORTED_TYPE`), or a malformed title / language.",
            ),
            "403": errorResponse("These bytes have not been audited recently (`AUDIT_REQUIRED`)."),
            "404": errorResponse("Remediation is switched off on this server."),
            "413": errorResponse("The PDF is too large or has too many pages (`FILE_TOO_LARGE`)."),
            "422": errorResponse(
              "The PDF could not be read: password-protected (`FILE_ENCRYPTED`) or corrupt (`FILE_UNREADABLE`).",
            ),
            "429": RATE_LIMITED,
            "500": INTERNAL,
            "503": BUSY,
            "504": errorResponse("The preflight audit did not finish in time (`TIMEOUT`)."),
          },
        },
      },
      "/api/remediate/{jobId}/status": {
        get: {
          tags: ["Remediation"],
          operationId: "getRemediationStatus",
          summary: "Progress of a remediation job.",
          parameters: [JOB_ID_PARAM, JOB_TOKEN_QUERY],
          responses: {
            "200": ok("The job's state.", ref("RemediationStatus")),
            "404": errorResponse("No such job for this token, or remediation is off."),
            "429": RATE_LIMITED,
          },
        },
      },
      "/api/remediate/{jobId}/download": {
        get: {
          tags: ["Remediation"],
          operationId: "downloadRemediatedPdf",
          summary: "Download the remediated PDF. Single use.",
          description:
            "The download is used up when the whole file has been sent; after that the job is expired (410) and its files are deleted. A transfer that is cut off can be tried again until the job's `expiresAt`. A HEAD request returns the headers only and uses nothing up.",
          parameters: [
            JOB_ID_PARAM,
            JOB_TOKEN_QUERY,
            {
              name: "name",
              in: "query",
              required: false,
              schema: { type: "string", maxLength: 250 },
              description: "File name to offer instead of the uploaded one.",
            },
          ],
          responses: {
            "200": {
              description: "The PDF.",
              content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
            },
            "404": errorResponse("No such job for this token, or remediation is off."),
            "409": errorResponse(
              "The job has not finished (`NOT_READY`), or a download of it is already being sent (`DOWNLOAD_IN_PROGRESS`).",
            ),
            "410": errorResponse("The file was already downloaded or has expired (`GONE`)."),
            "429": RATE_LIMITED,
            "500": INTERNAL,
          },
        },
      },
      "/api/remediate/{jobId}/receipt": {
        get: {
          tags: ["Remediation"],
          operationId: "getRemediationReceipt",
          summary: "The job's record: scores, both audits, and every lifecycle event.",
          parameters: [JOB_ID_PARAM, JOB_TOKEN_QUERY],
          responses: {
            "200": ok("The receipt.", { type: "object", additionalProperties: true }),
            "404": errorResponse("No such job for this token, or remediation is off."),
            "429": RATE_LIMITED,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        serviceToken: {
          type: "http",
          scheme: "bearer",
          description:
            "Optional. A service credential for fleet automation, not a user account: higher rate limits and the URL-allowlist bypass.",
        },
      },
      headers: {
        RetryAfter: {
          description: "Seconds to wait before trying again.",
          schema: { type: "integer", minimum: 0 },
        },
        RequestId: {
          description: "A random id for this request. Quote it when reporting a failure.",
          schema: { type: "string", format: "uuid" },
        },
      },
      responses: {
        RateLimited: {
          description: "Too many requests, or a per-caller limit was reached (`RATE_LIMITED`).",
          headers: { "Retry-After": { $ref: "#/components/headers/RetryAfter" } },
          content: jsonContent(ref("ApiError")),
        },
        ServerBusy: {
          description:
            "No capacity right now (`SERVER_BUSY`), or the service is restarting (`SHUTTING_DOWN`). Any request can receive the latter.",
          headers: { "Retry-After": { $ref: "#/components/headers/RetryAfter" } },
          content: jsonContent(ref("ApiError")),
        },
        InternalError: {
          description: "An unexpected failure (`INTERNAL`). No internal detail is returned.",
          content: jsonContent(ref("ApiError")),
        },
      },
      schemas: {
        ApiError: {
          type: "object",
          description: "The body of every 4xx and 5xx response except /api/status's 503.",
          required: ["error", "code"],
          properties: {
            error: {
              type: "string",
              description: "A sentence for a person. May be reworded between releases.",
            },
            code: {
              type: "string",
              enum: [...API_ERROR_CODES],
              description: "Stable machine-readable code. Branch on this.",
            },
            details: {
              type: "string",
              description: "More for a person: what to do next. May be reworded.",
            },
          },
          additionalProperties: true,
        },
        Health: {
          type: "object",
          required: ["status", "uptime", "systems"],
          properties: {
            status: { type: "string" },
            uptime: { type: "string" },
            degraded: { type: "array", items: { type: "string" } },
            systems: { type: "array", items: { type: "object", additionalProperties: true } },
          },
        },
        StatusDocument: { type: "object", additionalProperties: true },
        AnalysisResult: {
          type: "object",
          description:
            "The audit of one document. Its full type is in packages/shared; the fields below are the ones clients rely on.",
          required: ["filename", "overallScore", "grade", "categories"],
          properties: {
            filename: { type: "string" },
            overallScore: { type: "number", minimum: 0, maximum: 100 },
            grade: { type: "string", enum: ["A", "B", "C", "D", "F"] },
            pageCount: { type: ["integer", "null"] },
            categories: { type: "array", items: { type: "object", additionalProperties: true } },
            seal: {
              type: "string",
              description:
                "The server's signature over this result. Required by POST /api/reports; do not alter the result before posting it back.",
            },
          },
          additionalProperties: true,
        },
        AnalyzeJobCreated: {
          type: "object",
          required: ["jobId", "token"],
          properties: {
            jobId: { type: "string", format: "uuid" },
            token: { type: "string", description: "Pass as `t` when polling. Shown once." },
          },
        },
        AnalyzeJobStatus: {
          type: "object",
          required: ["done", "steps"],
          properties: {
            done: { type: "boolean" },
            steps: {
              type: "object",
              description: "Keys: analysis, veraPdfUa, veraPdfWcag.",
              additionalProperties: {
                type: "object",
                required: ["state"],
                properties: {
                  state: { type: "string", enum: ["pending", "running", "done", "skipped"] },
                  startedAt: { type: "integer" },
                  endedAt: { type: "integer" },
                },
              },
            },
            result: ref("AnalysisResult"),
            error: {
              type: "object",
              description:
                "Present when the audit failed: the status and body POST /api/analyze would have answered with.",
              required: ["status", "body"],
              properties: { status: { type: "integer" }, body: ref("ApiError") },
            },
          },
        },
        ScorePair: {
          type: "object",
          properties: {
            score: { type: ["number", "null"] },
            grade: { type: ["string", "null"] },
          },
        },
        AuditUrlResult: {
          type: "object",
          required: ["filename", "reportId", "reportUrl", "reportExpiresAt", "cached"],
          properties: {
            filename: { type: "string" },
            pageCount: { type: ["integer", "null"] },
            audited: { type: ["string", "null"], format: "date-time" },
            strict: ref("ScorePair"),
            practical: { ...ref("ScorePair"), description: "Alias of `strict`." },
            reportId: { type: "string" },
            reportUrl: { type: "string", format: "uri", description: "The report page." },
            reportExpiresAt: { type: "string", format: "date-time" },
            cached: { type: "boolean" },
          },
        },
        PageAuditResult: {
          type: "object",
          required: ["url", "axe", "reportId", "reportUrl", "reportExpiresAt", "cached"],
          properties: {
            url: { type: "string" },
            pageTitle: { type: "string" },
            audited: { type: "string", format: "date-time" },
            axe: { type: "object", additionalProperties: true },
            reportId: { type: "string" },
            reportUrl: { type: "string", format: "uri" },
            reportExpiresAt: { type: "string", format: "date-time" },
            cached: { type: "boolean" },
          },
        },
        BulkResult: {
          type: "object",
          required: ["summary", "results"],
          properties: {
            summary: {
              type: "object",
              required: ["total", "analyzed", "failed", "skipped"],
              properties: {
                total: { type: "integer" },
                analyzed: { type: "integer" },
                failed: { type: "integer" },
                skipped: { type: "integer" },
              },
            },
            results: {
              type: "array",
              items: {
                type: "object",
                required: ["path"],
                properties: {
                  path: { type: "string" },
                  sha256: { type: "string" },
                  publicUrl: { type: "string" },
                  overallScore: { type: "number" },
                  grade: { type: "string" },
                  reportId: { type: "string" },
                  reportUrl: {
                    type: "string",
                    format: "uri",
                    description: "The report page — the same link shape /api/audit-url returns.",
                  },
                  error: { type: "string", description: "Why this entry was not audited." },
                  errorCode: {
                    type: "string",
                    enum: [...API_ERROR_CODES],
                    description: "Stable code for `error`.",
                  },
                },
              },
            },
          },
        },
        RemediationCreated: {
          type: "object",
          required: ["jobId", "downloadToken", "queued"],
          properties: {
            jobId: { type: "string", format: "uuid" },
            downloadToken: {
              type: "string",
              description: "The key to this job's status, receipt and download. Shown once.",
            },
            inputScore: { type: "number" },
            inputGrade: { type: "string" },
            queued: { type: "boolean", description: "True while the job waits for a worker." },
          },
        },
        RemediationStatus: {
          type: "object",
          required: ["jobId", "status", "queued"],
          properties: {
            jobId: { type: "string", format: "uuid" },
            status: {
              type: "string",
              enum: ["pending", "running", "complete", "failed", "expired"],
            },
            queued: { type: "boolean" },
            queuePosition: { type: "integer", minimum: 1 },
            step: { type: ["string", "null"] },
            progressPct: { type: ["number", "null"] },
            inputScore: { type: ["number", "null"] },
            outputScore: { type: ["number", "null"] },
            outputValid: {},
            failureReason: { type: ["string", "null"] },
            createdAt: {},
            completedAt: {},
            expiresAt: {},
            inputFilename: { type: "string" },
            originalFilename: { type: ["string", "null"] },
          },
        },
      },
    },
    security: [{}, { serviceToken: [] }],
  };
}
