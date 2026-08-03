import { resolveStatus, type ApiStatusPayload } from "../utils/status";

// Public service-status document, served at https://audit.icjia.app/status.
//
// Lives at /status — NOT under /api/ — because production nginx sends /api/*
// straight to Express; this path must reach the Nuxt process so the response
// can report on both tiers (this handler ran => web ok; loopback probe
// answered => api ok).
//
// Intended for internal developers and curious managers, not for search
// engines: robots.txt disallows it AND every response carries X-Robots-Tag,
// because robots.txt is advisory while the header is honoured even when the
// URL is reached directly.
export default defineEventHandler(async (event) => {
  const { apiInternalUrl } = useRuntimeConfig(event);
  setResponseHeader(event, "X-Robots-Tag", "noindex, nofollow");
  setResponseHeader(event, "Cache-Control", "no-store");

  const result = await resolveStatus(() =>
    // retry: 0 so a dying API fails fast rather than multiplying ofetch's
    // default retries. The timeout is more generous than /healthz's 3s
    // because a cold engine-probe cache makes the API spawn subprocesses
    // (including a veraPDF JVM) before it can answer.
    $fetch<ApiStatusPayload>(`${apiInternalUrl}/api/status`, {
      timeout: 15000,
      retry: 0,
      // Critical: Express answers 503 WITH a full payload when a core engine
      // is broken. Without this, ofetch would throw and the payload naming
      // the broken component would be discarded in favour of a bare
      // "api: down" — losing the exact diagnosis this endpoint exists for.
      ignoreResponseError: true,
    }),
  );

  setResponseStatus(event, result.httpStatus);
  return result.body;
});
